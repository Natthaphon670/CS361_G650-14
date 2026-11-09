"""
Unit tests: Sub-Issue 2.6 (#83) Deadline & Timeframe Management
รัน: python -m pytest tests/ -q
"""
import json
from datetime import datetime, timedelta

import pytest

import deadline_config as dl
import settings_handler as sh
import workloads_handler as wh
from test_audit_logging import Ctx, FakeTable, audit_records, make_event, STATUS_RESOURCE


class FakeSettings:
    def __init__(self, item=None):
        self.item = item

    def get_item(self, Key):
        return {'Item': dict(self.item)} if self.item else {}

    def put_item(self, Item):
        self.item = dict(Item)


def bkk(*args):
    return datetime(*args, tzinfo=dl.BKK)


@pytest.fixture
def settings(monkeypatch):
    fake = FakeSettings()
    monkeypatch.setattr(dl, '_table', fake)
    monkeypatch.delenv('SUBMISSION_DEADLINE', raising=False)
    return fake


@pytest.fixture
def workloads(monkeypatch):
    t = FakeTable([
        {'faculty_id': 'FAC001', 'term_id': '2025#1', 'workflow_status': 'Draft'},
        {'faculty_id': 'FAC002', 'term_id': '2025#1', 'workflow_status': 'Pending_Review'},
    ])
    monkeypatch.setattr(wh, 'table', t)
    return t


def set_deadline(settings, dt):
    settings.item = {'setting_key': dl.SETTING_KEY, 'deadline': dt.isoformat()}


# ---------------------------------------------------------------- date logic
@pytest.mark.parametrize('now,expected', [
    (bkk(2026, 11, 9, 10, 0), bkk(2026, 11, 13, 23, 59, 59)),   # จันทร์ -> ศุกร์นี้
    (bkk(2026, 11, 13, 20, 0), bkk(2026, 11, 13, 23, 59, 59)),  # ศุกร์ -> ศุกร์นี้
    (bkk(2026, 11, 14, 9, 0), bkk(2026, 11, 20, 23, 59, 59)),   # เสาร์ -> ศุกร์หน้า
    (bkk(2026, 11, 15, 9, 0), bkk(2026, 11, 20, 23, 59, 59)),   # อาทิตย์ -> ศุกร์หน้า
])
def test_end_of_friday(now, expected):
    assert dl.end_of_friday(now) == expected


def test_naive_iso_is_bangkok_time():
    assert dl.parse_deadline('2026-11-13T23:59:59') == bkk(2026, 11, 13, 23, 59, 59)
    assert dl.parse_deadline('2026-11-13T16:59:59Z') == bkk(2026, 11, 13, 23, 59, 59)


def test_env_fallback_and_no_deadline(monkeypatch):
    monkeypatch.setattr(dl, '_table', None)
    monkeypatch.delenv('SETTINGS_TABLE_NAME', raising=False)
    monkeypatch.delenv('SUBMISSION_DEADLINE', raising=False)
    assert dl.get_deadline() is None and dl.is_locked() is False

    monkeypatch.setenv('SUBMISSION_DEADLINE', '2000-01-01T00:00:00+07:00')
    cfg = dl.get_deadline()
    assert cfg['source'] == 'environment' and dl.is_locked(cfg)


def test_settings_read_failure_falls_back_to_env(monkeypatch, capsys):
    class Broken:
        def get_item(self, Key):
            raise RuntimeError('table missing')
    monkeypatch.setattr(dl, '_table', Broken())
    monkeypatch.setenv('SUBMISSION_DEADLINE', '2099-01-01T00:00:00+07:00')
    assert dl.get_deadline()['source'] == 'environment'
    assert '"log_type": "ERROR"' in capsys.readouterr().out


# ---------------------------------------------------------------- enforcement
def test_faculty_blocked_after_deadline(settings, workloads, capsys):
    set_deadline(settings, dl.now_bkk() - timedelta(minutes=1))

    put = make_event('PUT', 'FAC001', '2025#1', {'workloads': {}})
    submit = make_event('POST', 'FAC001', '2025#1', {'workflow_status': 'Pending_Review'}, resource=STATUS_RESOURCE)
    delete = make_event('DELETE', 'FAC001', '2025#1')
    for ev in (put, submit, delete):
        res = wh.lambda_handler(ev, Ctx())
        assert res['statusCode'] == 403
        body = json.loads(res['body'])
        assert body['error'] == 'DeadlinePassed' and body['message'] == dl.LOCKED_MESSAGE

    assert workloads.items[('FAC001', '2025#1')]['workflow_status'] == 'Draft'
    recs = audit_records(capsys)
    assert [r['outcome'] for r in recs] == ['LOCKED'] * 3
    assert recs[1]['event_type'] == 'WORKLOAD_SUBMITTED'


def test_faculty_allowed_before_deadline(settings, workloads):
    set_deadline(settings, dl.now_bkk() + timedelta(days=3))
    ev = make_event('POST', 'FAC001', '2025#1', {'workflow_status': 'Pending_Review'}, resource=STATUS_RESOURCE)
    assert wh.lambda_handler(ev, Ctx())['statusCode'] == 200


def test_staff_can_review_after_deadline(settings, workloads):
    set_deadline(settings, dl.now_bkk() - timedelta(days=1))
    ev = make_event('POST', 'FAC002', '2025#1', {'workflow_status': 'Approved'},
                    groups=['Staff'], user_fid='STAFF01', resource=STATUS_RESOURCE)
    assert wh.lambda_handler(ev, Ctx())['statusCode'] == 200


def test_bola_still_checked_before_deadline_message(settings, workloads):
    set_deadline(settings, dl.now_bkk() - timedelta(days=1))
    ev = make_event('PUT', 'FAC002', '2025#1', {'workloads': {}})   # FAC001 แก้ของ FAC002
    body = json.loads(wh.lambda_handler(ev, Ctx())['body'])
    assert body['error'] == 'Forbidden'


# ---------------------------------------------------------------- settings API
def test_public_get(settings):
    set_deadline(settings, bkk(2099, 1, 2, 23, 59, 59))
    res = sh.lambda_handler({'httpMethod': 'GET'}, Ctx())
    body = json.loads(res['body'])
    assert res['statusCode'] == 200
    assert body['deadline'] == '2099-01-02T23:59:59+07:00' and body['is_locked'] is False
    assert 'updated_by' not in body


def test_staff_extend_to_friday(settings, monkeypatch, capsys):
    monday = bkk(2026, 11, 9, 10, 0)
    monkeypatch.setattr(dl, 'now_bkk', lambda: monday)
    set_deadline(settings, bkk(2026, 11, 6, 23, 59, 59))   # เลยกำหนดไปแล้ว

    ev = make_event('PUT', None, None, {'mode': 'extend_to_friday'}, groups=['Staff'], user_fid='STAFF01')
    res = sh.lambda_handler(ev, Ctx())
    assert res['statusCode'] == 200
    assert settings.item['deadline'] == '2026-11-13T23:59:59+07:00'
    assert settings.item['previous_deadline'] == '2026-11-06T23:59:59+07:00'
    assert settings.item['updated_by'] == 'user_STAFF01'

    [rec] = audit_records(capsys)
    assert rec['event_type'] == 'DEADLINE_UPDATED' and rec['outcome'] == 'SUCCESS'
    assert rec['extra']['new_deadline'] == '2026-11-13T23:59:59+07:00'


def test_extend_does_not_shorten_existing_deadline(settings, monkeypatch):
    monkeypatch.setattr(dl, 'now_bkk', lambda: bkk(2026, 11, 9, 10, 0))
    set_deadline(settings, bkk(2026, 11, 30, 23, 59, 59))
    ev = make_event('PUT', None, None, {'mode': 'extend_to_friday'}, groups=['Admin'], user_fid='ADM01')
    assert sh.lambda_handler(ev, Ctx())['statusCode'] == 409
    assert settings.item['deadline'] == '2026-11-30T23:59:59+07:00'


def test_faculty_cannot_change_deadline(settings, capsys):
    ev = make_event('PUT', None, None, {'mode': 'extend_to_friday'})
    assert sh.lambda_handler(ev, Ctx())['statusCode'] == 403
    assert settings.item is None
    assert audit_records(capsys)[0]['outcome'] == 'DENIED'


@pytest.mark.parametrize('value', ['not-a-date', '2000-01-01T00:00:00+07:00', '2099-01-01T00:00:00+07:00', 123])
def test_invalid_custom_deadline_rejected(settings, value):
    ev = make_event('PUT', None, None, {'deadline': value}, groups=['Staff'], user_fid='STAFF01')
    assert sh.lambda_handler(ev, Ctx())['statusCode'] == 400
    assert settings.item is None


def test_clear_deadline_admin_only(settings):
    set_deadline(settings, dl.now_bkk() + timedelta(days=1))
    staff = make_event('PUT', None, None, {'deadline': None}, groups=['Staff'], user_fid='STAFF01')
    assert sh.lambda_handler(staff, Ctx())['statusCode'] == 403

    admin = make_event('PUT', None, None, {'deadline': None}, groups=['Admin'], user_fid='ADM01')
    assert sh.lambda_handler(admin, Ctx())['statusCode'] == 200
    assert dl.get_deadline() is None