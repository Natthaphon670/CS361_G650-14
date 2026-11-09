"""
Deadline & Timeframe Management (Sub-Issue 2.6 / #83)
-----------------------------------------------------------------------------
เก็บกำหนดส่งภาระงานไว้ใน DynamoDB (ตาราง SystemSettings) เพื่อให้ Staff/Admin
"""
import os
from datetime import datetime, timedelta, timezone

import boto3

import audit_logger as audit

BKK = timezone(timedelta(hours=7), 'Asia/Bangkok')
SETTING_KEY = 'submission_deadline'
FRIDAY = 4  # Monday = 0

LOCKED_MESSAGE = 'หมดเขตการส่ง/แก้ไขภาระงานแล้ว'

_table = None


def settings_table():
    """สร้าง Table object ครั้งแรกที่ใช้ (unit test แทนที่ตัวแปร _table ได้)"""
    global _table
    if _table is None:
        name = os.environ.get('SETTINGS_TABLE_NAME')
        if not name:
            return None
        _table = boto3.resource('dynamodb').Table(name)
    return _table


def now_bkk():
    return datetime.now(BKK)


def parse_deadline(value):
    """แปลง ISO 8601 เป็น datetime ที่มี timezone (ถ้าไม่ระบุ offset ถือเป็นเวลาไทย)"""
    if value is None or str(value).strip() == '':
        return None
    dt = datetime.fromisoformat(str(value).strip().replace('Z', '+00:00'))
    return dt.replace(tzinfo=BKK) if dt.tzinfo is None else dt


def end_of_friday(now=None):
    """23:59:59 ของวันศุกร์ในสัปดาห์ปัจจุบัน (ถ้าเป็นวันเสาร์/อาทิตย์ จะเป็นวันศุกร์ถัดไป)"""
    now = (now or now_bkk()).astimezone(BKK)
    days_ahead = (FRIDAY - now.weekday()) % 7
    friday = (now + timedelta(days=days_ahead)).replace(hour=23, minute=59, second=59, microsecond=0)
    return friday


def get_deadline():
    """คืน dict {deadline: datetime, source, updated_by, updated_at} หรือ None ถ้าไม่จำกัดเวลา"""
    table = None
    try:
        table = settings_table()
        if table is not None:
            item = table.get_item(Key={'setting_key': SETTING_KEY}).get('Item')
            if item:
                deadline = parse_deadline(item.get('deadline'))
                if deadline is None:
                    return None  # Admin ล้างกำหนดส่งแล้ว (ไม่จำกัดเวลา)
                return {
                    'deadline': deadline,
                    'source': 'settings',
                    'updated_by': item.get('updated_by'),
                    'updated_at': item.get('updated_at'),
                }
    except Exception as e:
        # อ่านค่าไม่ได้ (เช่นยังไม่ได้สร้างตาราง) -> ใช้ค่า default จาก Environment แทน ไม่ทำให้ระบบล่ม
        audit.log_server_error('deadline_config.get_deadline', e)

    try:
        fallback = parse_deadline(os.environ.get('SUBMISSION_DEADLINE'))
    except ValueError as e:
        audit.log_server_error('deadline_config.env_parse', e)
        fallback = None
    if fallback is None:
        return None
    return {'deadline': fallback, 'source': 'environment', 'updated_by': None, 'updated_at': None}


def is_locked(cfg=None, now=None):
    """True เมื่อเลยกำหนดส่งแล้ว"""
    cfg = cfg if cfg is not None else get_deadline()
    if not cfg:
        return False
    return (now or now_bkk()) > cfg['deadline']


def save_deadline(deadline, username, previous=None):
    """บันทึกกำหนดส่งใหม่ (deadline=None = ไม่จำกัดเวลา)"""
    table = settings_table()
    if table is None:
        raise RuntimeError('SETTINGS_TABLE_NAME is not configured')
    item = {
        'setting_key': SETTING_KEY,
        'deadline': deadline.astimezone(BKK).isoformat() if deadline else '',
        'updated_by': username or 'unknown',
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    if previous:
        item['previous_deadline'] = previous.astimezone(BKK).isoformat()
    table.put_item(Item=item)
    return item


def to_public(cfg, now=None):
    """รูปแบบที่ส่งให้ Frontend"""
    now = now or now_bkk()
    if not cfg:
        return {'deadline': None, 'is_locked': False, 'server_time': now.isoformat()}
    return {
        'deadline': cfg['deadline'].astimezone(BKK).isoformat(),
        'is_locked': now > cfg['deadline'],
        'server_time': now.isoformat(),
        'updated_at': cfg.get('updated_at'),
    }