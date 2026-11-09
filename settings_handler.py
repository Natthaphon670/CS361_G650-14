
import json
from datetime import timedelta

import audit_logger as audit
import deadline_config as dl
from auth_utils import AuthorizationError, get_user_claims, verify_bfla

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
}
MAX_AHEAD = timedelta(days=366)


def create_response(status_code, body):
    return {'statusCode': status_code, 'headers': CORS_HEADERS,
            'body': json.dumps(body, ensure_ascii=False, default=str)}


def get_deadline_handler(event, context):
    return create_response(200, dl.to_public(dl.get_deadline()))


def update_deadline_handler(event, context):
    user_info = None
    try:
        user_info = get_user_claims(event)
        verify_bfla(user_info, allowed_groups=['Staff', 'Admin'])

        try:
            body = json.loads(event.get('body') or '{}')
        except json.JSONDecodeError:
            return create_response(400, {'message': 'รูปแบบ JSON ไม่ถูกต้อง'})
        if not isinstance(body, dict):
            return create_response(400, {'message': 'รูปแบบข้อมูลไม่ถูกต้อง'})

        now = dl.now_bkk()
        current = dl.get_deadline()
        previous = current['deadline'] if current else None

        if body.get('mode') == 'extend_to_friday':
            new_deadline = dl.end_of_friday(now)
            if previous and previous >= new_deadline:
                return create_response(409, {
                    'message': 'กำหนดส่งปัจจุบันอยู่หลังวันศุกร์นี้แล้ว ไม่จำเป็นต้องขยายเวลา',
                    **dl.to_public(current, now)})
        elif 'deadline' in body:
            if body['deadline'] is None:
                verify_bfla(user_info, allowed_groups=['Admin'])
                new_deadline = None
            else:
                try:
                    new_deadline = dl.parse_deadline(body['deadline'])
                except (TypeError, ValueError):
                    new_deadline = None
                if new_deadline is None:
                    return create_response(400, {'message': 'รูปแบบวันที่ไม่ถูกต้อง (ใช้ ISO 8601 เช่น 2026-11-20T23:59:59+07:00)'})
                if new_deadline <= now:
                    return create_response(400, {'message': 'กำหนดส่งใหม่ต้องเป็นเวลาในอนาคต'})
                if new_deadline - now > MAX_AHEAD:
                    return create_response(400, {'message': 'กำหนดส่งต้องไม่เกิน 1 ปีจากวันนี้'})
        else:
            return create_response(400, {'message': 'กรุณาระบุ mode = "extend_to_friday" หรือ deadline'})

        dl.save_deadline(new_deadline, user_info.get('username'), previous)
        audit.audit_log(audit.DEADLINE_UPDATED, audit.SUCCESS, user_info=user_info, event=event, context=context,
                        extra={'previous_deadline': previous.isoformat() if previous else None,
                               'new_deadline': new_deadline.isoformat() if new_deadline else None,
                               'mode': body.get('mode') or 'set'})

        saved = {'deadline': new_deadline, 'updated_at': now.isoformat()} if new_deadline else None
        message = ('ยกเลิกกำหนดส่งแล้ว (ไม่จำกัดเวลา)' if new_deadline is None
                   else f"ตั้งกำหนดส่งเป็น {new_deadline.astimezone(dl.BKK).strftime('%d/%m/%Y %H:%M')} น. แล้ว")
        return create_response(200, {'message': message, **dl.to_public(saved, now)})

    except AuthorizationError as auth_err:
        audit.audit_log(audit.DEADLINE_UPDATED, audit.DENIED, user_info=user_info, event=event, context=context,
                        reason=auth_err.message)
        return create_response(auth_err.status_code, {'error': 'Forbidden', 'message': auth_err.message})
    except Exception as e:
        audit.log_server_error('update_deadline_handler', e, context)
        audit.audit_log(audit.DEADLINE_UPDATED, audit.ERROR, user_info=user_info, event=event, context=context,
                        reason=type(e).__name__)
        return create_response(500, {'message': 'เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง'})


def lambda_handler(event, context):
    method = event.get('httpMethod')
    if method == 'OPTIONS':
        return create_response(200, 'CORS preflight successful')
    if method == 'GET':
        return get_deadline_handler(event, context)
    if method == 'PUT':
        return update_deadline_handler(event, context)
    return create_response(405, {'message': f'ไม่รองรับ HTTP Method: {method}'})