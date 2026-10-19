import json
import os
import boto3
from decimal import Decimal
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key, Attr
from auth_utils import get_user_claims, verify_bola, verify_bfla, AuthorizationError

# -----------------------------------------------------------------------------
# Configuration & DynamoDB Setup
# -----------------------------------------------------------------------------
dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME', 'FacultyWorkloads')
GSI_NAME = os.environ.get('GSI_NAME', 'TermStatusIndex')
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
}

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def create_response(status_code, body):
    """ส่ง Response กลับไปยัง API Gateway พร้อม CORS Headers"""
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, cls=DecimalEncoder, ensure_ascii=False)
    }


# =============================================================================
# TASK 1: Lambda Function - GetWorkloads
# GET /workloads
# GET /workloads/{faculty_id}/{term_id}
# =============================================================================
def get_workloads_handler(event, context):
    try:
        user_info = get_user_claims(event)
        user_faculty_id = user_info['faculty_id']
        is_staff_or_admin = user_info['is_staff_or_admin']

        path_params = event.get('pathParameters') or {}
        query_params = event.get('queryStringParameters') or {}

        target_faculty_id = path_params.get('faculty_id') or query_params.get('faculty_id')
        target_term_id = path_params.get('term_id') or query_params.get('term_id')
        
        year = query_params.get('academic_year')
        semester = query_params.get('semester')
        if not target_term_id and year and semester:
            target_term_id = f"{year}#{semester}"

        # BFLA Check: หากเรียกดูภาพรวมทั้งสาขาผ่าน Query Scope แผงการบริหาร
        if query_params.get('scope') == 'department_overview':
            verify_bfla(user_info, allowed_groups=['Staff', 'Admin'])

        # ---------------------------------------------------------------------
        # Case A: ดึงข้อมูลรายการเดียวด้วย Primary Key (faculty_id + term_id)
        # ---------------------------------------------------------------------
        if target_faculty_id and target_term_id:
            response = table.get_item(Key={'faculty_id': target_faculty_id, 'term_id': target_term_id})
            item = response.get('Item')
            
            if not item:
                return create_response(404, {'message': f'ไม่พบข้อมูลภาระงานของ {target_faculty_id} ในเทอม {target_term_id}'})
            
            # Privacy / BOLA Check: ถ้าไม่ใช่งานของตัวเอง และไม่ใช่ Staff -> ดูได้เฉพาะงานที่ Approved แล้ว
            if not is_staff_or_admin and target_faculty_id != user_faculty_id:
                if item.get('workflow_status') != 'Approved':
                    raise AuthorizationError('คุณไม่มีสิทธิ์ดูข้อมูลภาระงานที่ยังไม่อนุมัติของอาจารย์ท่านอื่น')
                    
            return create_response(200, item)

        # ---------------------------------------------------------------------
        # Case B: Query ตาม faculty_id (ดึงทุกเทอมของอาจารย์ท่านนี้)
        # ---------------------------------------------------------------------
        elif target_faculty_id:
            response = table.query(
                KeyConditionExpression=Key('faculty_id').eq(target_faculty_id)
            )
            items = response.get('Items', [])
            
            # กรองงานของผู้อื่นให้เห็นเฉพาะ Approved
            if not is_staff_or_admin and target_faculty_id != user_faculty_id:
                items = [i for i in items if i.get('workflow_status') == 'Approved']
                
            return create_response(200, items)

        # ---------------------------------------------------------------------
        # Case C: Query ตาม term_id ผ่าน GSI TermStatusIndex (ภาพรวมทั้งสาขา)
        # ---------------------------------------------------------------------
        elif target_term_id:
            response = table.query(
                IndexName=GSI_NAME,
                KeyConditionExpression=Key('term_id').eq(target_term_id)
            )
            items = response.get('Items', [])
            
            if not is_staff_or_admin:
                items = [
                    i for i in items 
                    if i.get('workflow_status') == 'Approved' or i.get('faculty_id') == user_faculty_id
                ]
                
            return create_response(200, items)

        # ---------------------------------------------------------------------
        # Case D: ไม่ระบุ Key ชัดเจน
        # ---------------------------------------------------------------------
        else:
            if is_staff_or_admin:
                response = table.scan()
                return create_response(200, response.get('Items', []))
            elif user_faculty_id:
                response = table.query(
                    KeyConditionExpression=Key('faculty_id').eq(user_faculty_id)
                )
                return create_response(200, response.get('Items', []))
            else:
                return create_response(400, {'message': 'กรุณาระบุ faculty_id หรือ term_id ในการค้นหา'})

    except AuthorizationError as auth_err:
        return create_response(auth_err.status_code, {'error': 'Forbidden', 'message': auth_err.message})
    except Exception as e:
        return create_response(500, {'error': f'เกิดข้อผิดพลาดในการดึงข้อมูลภาระงาน: {str(e)}'})


# =============================================================================
# TASK 2: Lambda Function - SaveWorkload (Create & Update)
# PUT /workloads/{faculty_id}/{term_id}
# =============================================================================
def save_workload_handler(event, context):
    try:
        user_info = get_user_claims(event)
        is_staff_or_admin = user_info['is_staff_or_admin']

        path_params = event.get('pathParameters') or {}
        target_faculty_id = path_params.get('faculty_id')
        target_term_id = path_params.get('term_id')

        if not target_faculty_id or not target_term_id:
            return create_response(400, {'message': 'กรุณาระบุ faculty_id และ term_id ใน Path Parameters'})

        # ---------------------------------------------------------------------
        # BOLA Protection: ตรวจสอบความเป็นเจ้าของข้อมูล
        # ---------------------------------------------------------------------
        verify_bola(user_info, target_faculty_id)

        body_raw = event.get('body')
        if not body_raw:
            return create_response(400, {'message': 'ไม่พบข้อมูลภาระงาน (Request body is empty)'})

        try:
            body = json.loads(body_raw, parse_float=Decimal)
        except json.JSONDecodeError:
            return create_response(400, {'message': 'รูปแบบ JSON ใน Request body ไม่ถูกต้อง'})

        existing_item = table.get_item(Key={'faculty_id': target_faculty_id, 'term_id': target_term_id}).get('Item')
        now_iso = datetime.now(timezone.utc).isoformat()

        if existing_item:
            current_status = existing_item.get('workflow_status', 'Draft')
            if not is_staff_or_admin and current_status in ['Pending_Review', 'Approved']:
                return create_response(409, {
                    'message': f'ไม่สามารถแก้ไขได้ เนื่องจากรายการอยู่ในสถานะ "{current_status}" (แก้ไขได้เฉพาะ Draft หรือ Rejected)'
                })
            
            workflow_status = body.get('workflow_status', current_status)
            created_at = existing_item.get('created_at', now_iso)
        else:
            workflow_status = body.get('workflow_status', 'Draft')
            created_at = now_iso

        incoming_workloads = body.get('workloads', {})
        structured_workloads = {
            'teaching': incoming_workloads.get('teaching', []),
            'academic_outputs': incoming_workloads.get('academic_outputs', []),
            'services_and_admin': incoming_workloads.get('services_and_admin', []),
            'student_advising': incoming_workloads.get('student_advising', [])
        }

        academic_year = Decimal(str(body.get('academic_year', target_term_id.split('#')[0])))
        semester = Decimal(str(body.get('semester', target_term_id.split('#')[1] if '#' in target_term_id else 1)))

        item_to_save = {
            'faculty_id': target_faculty_id,
            'term_id': target_term_id,
            'academic_year': academic_year,
            'semester': semester,
            'evaluation_period': body.get('evaluation_period', ''),
            'workflow_status': workflow_status,
            'workloads': structured_workloads,
            'created_at': created_at,
            'updated_at': now_iso
        }

        if 'review_comment' in body:
            item_to_save['review_comment'] = body['review_comment']
        if 'reviewed_by' in body:
            item_to_save['reviewed_by'] = body['reviewed_by']

        table.put_item(Item=item_to_save)

        return create_response(200, {
            'message': 'บันทึกข้อมูลภาระงานเรียบร้อยแล้ว',
            'data': item_to_save
        })

    except AuthorizationError as auth_err:
        return create_response(auth_err.status_code, {'error': 'Forbidden', 'message': auth_err.message})
    except Exception as e:
        return create_response(500, {'error': f'ไม่สามารถบันทึกข้อมูลภาระงานได้: {str(e)}'})


# =============================================================================
# TASK 3: Lambda Function - DeleteWorkload
# DELETE /workloads/{faculty_id}/{term_id}
# =============================================================================
def delete_workload_handler(event, context):
    try:
        user_info = get_user_claims(event)
        is_staff_or_admin = user_info['is_staff_or_admin']

        path_params = event.get('pathParameters') or {}
        target_faculty_id = path_params.get('faculty_id')
        target_term_id = path_params.get('term_id')

        if not target_faculty_id or not target_term_id:
            return create_response(400, {'message': 'กรุณาระบุ faculty_id และ term_id ใน Path Parameters'})

        # ---------------------------------------------------------------------
        # BOLA Protection: ตรวจสอบความเป็นเจ้าของงานก่อนลบ
        # ---------------------------------------------------------------------
        verify_bola(user_info, target_faculty_id)

        existing_item = table.get_item(Key={'faculty_id': target_faculty_id, 'term_id': target_term_id}).get('Item')

        if not existing_item:
            return create_response(404, {'message': 'ไม่พบรายการภาระงานที่ต้องการลบ'})

        current_status = existing_item.get('workflow_status', '')
        if current_status != 'Draft' and not is_staff_or_admin:
            return create_response(409, {
                'message': f'ไม่สามารถลบรายการได้ เนื่องจากไม่อยู่ในสถานะฉบับร่าง (สถานะปัจจุบัน: "{current_status}")'
            })

        table.delete_item(Key={'faculty_id': target_faculty_id, 'term_id': target_term_id})

        return create_response(200, {
            'message': f'ลบรายการภาระงานเทอม {target_term_id} ของ {target_faculty_id} เรียบร้อยแล้ว'
        })

    except AuthorizationError as auth_err:
        return create_response(auth_err.status_code, {'error': 'Forbidden', 'message': auth_err.message})
    except Exception as e:
        return create_response(500, {'error': f'เกิดข้อผิดพลาดในการลบข้อมูล: {str(e)}'})