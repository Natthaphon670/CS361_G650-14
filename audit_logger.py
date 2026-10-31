"""
Audit Logger (Issue 5.1)
-----------------------------------------------------------------------------
บันทึก Audit Log ของการกระทำสำคัญลง Amazon CloudWatch Logs

- เขียนด้วย print() เป็น JSON 1 บรรทัดต่อ 1 เหตุการณ์ เพื่อให้ CloudWatch Logs Insights
  แยก field ได้อัตโนมัติ (ถ้าใช้ logging ของ Lambda จะมี prefix [INFO] ทำให้ไม่เป็น JSON ล้วน)
- ทุก record มี "log_type": "AUDIT" ใช้เป็นตัวกรองใน Metric Filter / Logs Insights
- ห้ามทำให้ request ล้มเพราะการเขียน log: ทุกอย่างอยู่ใน try/except
- ไม่บันทึก Token, Request body หรือข้อความ comment (เก็บเฉพาะ has_comment) เพื่อลดการรั่วของข้อมูล
"""
import json
from datetime import datetime, timezone

# Event types
WORKLOAD_SUBMITTED = 'WORKLOAD_SUBMITTED'
WORKLOAD_APPROVED = 'WORKLOAD_APPROVED'
WORKLOAD_REJECTED = 'WORKLOAD_REJECTED'
WORKLOAD_CREATED = 'WORKLOAD_CREATED'
WORKLOAD_UPDATED = 'WORKLOAD_UPDATED'
WORKLOAD_DELETED = 'WORKLOAD_DELETED'
PROFILE_UPDATED = 'PROFILE_UPDATED'

# Outcomes
SUCCESS = 'SUCCESS'
DENIED = 'DENIED'        # ไม่ผ่าน BOLA/BFLA (403)
CONFLICT = 'CONFLICT'    # ผิดลำดับ Workflow (409)
ERROR = 'ERROR'          # ข้อผิดพลาดฝั่ง Server (500)

STATUS_TO_EVENT = {
    'Pending_Review': WORKLOAD_SUBMITTED,
    'Approved': WORKLOAD_APPROVED,
    'Rejected': WORKLOAD_REJECTED,
}

_MAX_LEN = 200


def _clip(value):
    """ตัดความยาว string ป้องกัน log บวมจาก input ของผู้ใช้"""
    if value is None:
        return None
    s = str(value)
    return s if len(s) <= _MAX_LEN else s[:_MAX_LEN] + '...'


def _request_meta(event, context):
    """ดึง request_id และ source_ip รองรับทั้ง REST API (v1) และ HTTP API (v2)"""
    rc = (event or {}).get('requestContext') or {}
    source_ip = (rc.get('identity') or {}).get('sourceIp') or (rc.get('http') or {}).get('sourceIp')
    return {
        'api_request_id': rc.get('requestId'),
        'lambda_request_id': getattr(context, 'aws_request_id', None),
        'source_ip': source_ip,
    }


def audit_log(event_type, outcome, *, user_info=None, event=None, context=None,
              faculty_id=None, term_id=None, status_from=None, status_to=None,
              reason=None, extra=None):
    """เขียน Audit Log 1 รายการ คืนค่า record (ใช้ใน unit test) หรือ None ถ้าล้มเหลว"""
    try:
        user_info = user_info or {}
        record = {
            'log_type': 'AUDIT',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'event_type': event_type,
            'outcome': outcome,
            'actor': {
                'username': _clip(user_info.get('username')),
                'faculty_id': _clip(user_info.get('faculty_id')),
                'groups': [_clip(g) for g in (user_info.get('groups') or [])],
            },
            'target': {
                'faculty_id': _clip(faculty_id),
                'term_id': _clip(term_id),
            },
            'status_from': status_from,
            'status_to': status_to,
            'reason': _clip(reason),
            **_request_meta(event, context),
        }
        if extra:
            record['extra'] = {k: _clip(v) if isinstance(v, str) else v for k, v in extra.items()}

        print(json.dumps(record, ensure_ascii=False, default=str), flush=True)
        return record
    except Exception:
        # Logging ต้องไม่ทำให้ธุรกรรมหลักล้ม
        return None


def log_server_error(where, error, context=None):
    """บันทึกรายละเอียด Error ฝั่ง Server (ลูกค้าเห็นแค่ข้อความทั่วไป ตาม Issue 4.2)"""
    try:
        print(json.dumps({
            'log_type': 'ERROR',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'where': where,
            'error_type': type(error).__name__,
            'error_message': _clip(error),
            'lambda_request_id': getattr(context, 'aws_request_id', None),
        }, ensure_ascii=False, default=str), flush=True)
    except Exception:
        pass
