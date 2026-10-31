"""
Unit tests: Issue 5.1 Audit Logging
รัน: python -m pytest tests/ -q   (ไม่ต้องต่อ AWS จริง ใช้ FakeTable แทน DynamoDB)
"""
import json
import os
import sys

import pytest

os.environ.setdefault('AWS_DEFAULT_REGION', 'us-east-1')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import workloads_handler as wh  # noqa: E402
import profiles_handler as ph  # noqa: E402


class FakeTable:
    def __init__(self, items=None, fail=False):
        self.items = {(i['faculty_id'], i.get('term_id')): dict(i) for i in (items or [])}
        self.fail = fail

    def _key(self, Key):
        return (Key['faculty_id'], Key.get('term_id'))

    def get_item(self, Key):
        if self.fail:
            raise RuntimeError('dynamo down')
        item = self.items.get(self._key(Key))
        return {'Item': dict(item)} if item else {}

    def put_item(self, Item):
        self.items[(Item['faculty_id'], Item.get('term_id'))] = dict(Item)

    def delete_item(self, Key):
        self.items.pop(self._key(Key), None)

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues):
        self.items[self._key(Key)]['workflow_status'] = ExpressionAttributeValues[':s']


class Ctx:
    aws_request_id = 'lambda-req-1'


def make_event(method, faculty_id, term_id, body=None, groups=None, user_fid='FAC001', resource=''):
    return {
        'httpMethod': method,
        'resource': resource,
        'pathParameters': {'faculty_id': faculty_id, 'term_id': term_id},
        'body': json.dumps(body) if body is not None else None,
        'requestContext': {
            'requestId': 'api-req-1',
            'identity': {'sourceIp': '203.0.113.7'},
            'authorizer': {'claims': {
                'cognito:username': f'user_{user_fid}',
                'custom:faculty_id': user_fid,
                'cognito:groups': ','.join(groups or ['Faculty']),
            }},
        },
    }


def audit_records(capsys):
    out = capsys.readouterr().out.strip().splitlines()
    recs = [json.loads(line) for line in out if line.startswith('{')]
    return [r for r in recs if r.get('log_type') == 'AUDIT']


@pytest.fixture
def table(monkeypatch):
    t = FakeTable([
        {'faculty_id': 'FAC001', 'term_id': '2025#1', 'workflow_status': 'Draft'},
        {'faculty_id': 'FAC002', 'term_id': '2025#1', 'workflow_status': 'Pending_Review'},
    ])
    monkeypatch.setattr(wh, 'table', t)
    return t


STATUS_RESOURCE = '/workloads/{faculty_id}/{term_id}/status'


def test_submit_success_logs_actor_target_and_time(table, capsys):
    ev = make_event('POST', 'FAC001', '2025#1', {'workflow_status': 'Pending_Review'}, resource=STATUS_RESOURCE)
    res = wh.lambda_handler(ev, Ctx())
    assert res['statusCode'] == 200

    [rec] = audit_records(capsys)
    assert rec['event_type'] == 'WORKLOAD_SUBMITTED'
    assert rec['outcome'] == 'SUCCESS'
    assert rec['actor']['faculty_id'] == 'FAC001'
    assert rec['target'] == {'faculty_id': 'FAC001', 'term_id': '2025#1'}
    assert rec['status_from'] == 'Draft' and rec['status_to'] == 'Pending_Review'
    assert rec['timestamp'].endswith('+00:00')
    assert rec['source_ip'] == '203.0.113.7'
    assert rec['api_request_id'] == 'api-req-1' and rec['lambda_request_id'] == 'lambda-req-1'


@pytest.mark.parametrize('decision,event_type', [('Approved', 'WORKLOAD_APPROVED'), ('Rejected', 'WORKLOAD_REJECTED')])
def test_staff_review_success(table, capsys, decision, event_type):
    ev = make_event('POST', 'FAC002', '2025#1', {'workflow_status': decision, 'review_comment': 'ok'},
                    groups=['Staff'], user_fid='STAFF01', resource=STATUS_RESOURCE)
    assert wh.lambda_handler(ev, Ctx())['statusCode'] == 200

    [rec] = audit_records(capsys)
    assert rec['event_type'] == event_type and rec['outcome'] == 'SUCCESS'
    assert rec['actor']['groups'] == ['Staff']
    assert rec['extra'] == {'has_comment': True}
    assert 'ok' not in json.dumps(rec['extra'])  # ไม่เก็บเนื้อหา comment


def test_faculty_approve_is_denied_and_logged(table, capsys):
    ev = make_event('POST', 'FAC002', '2025#1', {'workflow_status': 'Approved'}, resource=STATUS_RESOURCE)
    assert wh.lambda_handler(ev, Ctx())['statusCode'] == 403

    [rec] = audit_records(capsys)
    assert rec['event_type'] == 'WORKLOAD_APPROVED' and rec['outcome'] == 'DENIED'
    assert table.items[('FAC002', '2025#1')]['workflow_status'] == 'Pending_Review'


def test_invalid_transition_logged_as_conflict(table, capsys):
    ev = make_event('POST', 'FAC001', '2025#1', {'workflow_status': 'Approved'},
                    groups=['Admin'], user_fid='ADM01', resource=STATUS_RESOURCE)
    assert wh.lambda_handler(ev, Ctx())['statusCode'] == 409

    [rec] = audit_records(capsys)
    assert rec['outcome'] == 'CONFLICT' and rec['status_from'] == 'Draft'


def test_staff_status_change_via_put_is_audited(table, capsys):
    ev = make_event('PUT', 'FAC002', '2025#1', {'workflow_status': 'Approved', 'workloads': {}},
                    groups=['Staff'], user_fid='STAFF01')
    assert wh.lambda_handler(ev, Ctx())['statusCode'] == 200

    [rec] = audit_records(capsys)
    assert rec['event_type'] == 'WORKLOAD_UPDATED'
    assert rec['status_from'] == 'Pending_Review' and rec['status_to'] == 'Approved'


def test_create_and_delete(table, capsys):
    put = make_event('PUT', 'FAC001', '2026#1', {'workloads': {}})
    assert wh.lambda_handler(put, Ctx())['statusCode'] == 200
    delete = make_event('DELETE', 'FAC001', '2026#1')
    assert wh.lambda_handler(delete, Ctx())['statusCode'] == 200

    created, deleted = audit_records(capsys)
    assert created['event_type'] == 'WORKLOAD_CREATED' and created['status_to'] == 'Draft'
    assert deleted['event_type'] == 'WORKLOAD_DELETED' and deleted['outcome'] == 'SUCCESS'


def test_server_error_logged_but_hidden_from_client(monkeypatch, capsys):
    monkeypatch.setattr(wh, 'table', FakeTable(fail=True))
    ev = make_event('POST', 'FAC001', '2025#1', {'workflow_status': 'Pending_Review'}, resource=STATUS_RESOURCE)
    res = wh.lambda_handler(ev, Ctx())
    assert res['statusCode'] == 500
    assert 'dynamo down' not in res['body']

    out = capsys.readouterr().out
    assert '"log_type": "ERROR"' in out and 'dynamo down' in out
    assert '"outcome": "ERROR"' in out


def test_logger_never_breaks_request(table, monkeypatch, capsys):
    def boom(*a, **k):
        raise OSError('stdout closed')
    monkeypatch.setattr('builtins.print', boom)
    ev = make_event('POST', 'FAC001', '2025#1', {'workflow_status': 'Pending_Review'}, resource=STATUS_RESOURCE)
    assert wh.lambda_handler(ev, Ctx())['statusCode'] == 200


def test_profile_update_audited(monkeypatch, capsys):
    t = FakeTable([{'faculty_id': 'FAC001'}])
    monkeypatch.setattr(ph, 'table', t)
    ev = make_event('PUT', 'FAC001', None, {'name_en': 'Dr. A', 'evil_field': 'x'})
    assert ph.update_profile_handler(ev, Ctx())['statusCode'] == 200

    [rec] = audit_records(capsys)
    assert rec['event_type'] == 'PROFILE_UPDATED' and rec['extra'] == {'fields': 'name_en'}

    ev_other = make_event('PUT', 'FAC009', None, {'name_en': 'x'})
    assert ph.update_profile_handler(ev_other, Ctx())['statusCode'] == 403
    [denied] = audit_records(capsys)
    assert denied['outcome'] == 'DENIED' and denied['target']['faculty_id'] == 'FAC009'
