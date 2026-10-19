import json
import os
import boto3
from decimal import Decimal
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key, Attr

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

# Encoder สำหรับแปลงชนิดข้อมูล Decimal ของ DynamoDB เป็น JSON Number
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

def extract_user_claims(event):
    """แกะ claims จาก Cognito JWT Token เพื่อใช้ทำ BOLA / BFLA Check"""
    try:
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})
        
        # ดึง faculty_id จาก Custom Attribute หรือ Username
        user_faculty_id = claims.get('custom:faculty_id') or claims.get('faculty_id') or claims.get('cognito:username')
        
        # แกะ Cognito Groups
        groups_raw = claims.get('cognito:groups', [])
        if isinstance(groups_raw, str):
            groups = [g.strip() for g in groups_raw.split(',') if g.strip()]
        else:
            groups = list(groups_raw)
            
        is_staff_or_admin = any(g in ['Staff', 'Admin'] for g in groups)
        
        return {
            'user_faculty_id': user_faculty_id,
            'groups': groups,
            'is_staff_or_admin': is_staff_or_admin,
            'claims': claims
        }
    except Exception as e:
        return {'user_faculty_id': None, 'groups': [], 'is_staff_or_admin': False, 'claims': {}}


# =============================================================================
# TASK 1: Lambda Function - GetWorkloads
# GET /workloads
# GET /workloads/{faculty_id}/{term_id}
# Query Params: ?faculty_id=... &term_id=... &academic_year=2567&semester=1
# =============================================================================
def get_workloads_handler(event, context):
    try:
        user_info = extract_user_claims(event)
        user_faculty_id = user_info['user_faculty_id']
        is_staff_or_admin = user_info['is_staff_or_admin']

        path_params = event.get('pathParameters') or {}
        query_params = event.get('queryStringParameters') or {}

        target_faculty_id = path_params.get('faculty_id') or query_params.get('faculty_id')
        target_term_id = path_params.get('term_id') or query_params.get('term_id')
        
        # แปลง academic_year และ semester เป็น term_id (เช่น 2567#1) ถ้าส่งแยกมา
        year = query_params.get('academic_year')
        semester = query_params.get('semester')
        if not target_term_id and year and semester:
            target_term_id = f"{year}#{semester}"

        # ---------------------------------------------------------------------
        # Case A: ดึงข้อมูลรายการเดียวด้วย Primary Key (faculty_id + term_id)
        # ---------------------------------------------------------------------
        if target_faculty_id and target_term_id:
            response = table.get_item(Key={'faculty_id': target_faculty_id, 'term_id': target_term_id})
            item = response.get('Item')
            
            if not item:
                return create_response(404, {'message': f'ไม่พบข้อมูลภาระงานของ {target_faculty_id} ในเทอม {target_term_id}'})
            
            # Privacy Check: ถ้าไม่ใช่งานของตัวเอง และไม่ใช่ Staff -> ดูได้เฉพาะงานที่ Approved แล้ว
            if not is_staff_or_admin and target_faculty_id != user_faculty_id:
                if item.get('workflow_status') != 'Approved':
                    return create_response(403, {'message': 'คุณไม่มีสิทธิ์ดูข้อมูลภาระงานที่ยังไม่อนุมัติของอาจารย์ท่านอื่น'})
                    
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
            
            # อาจารย์ทั่วไปจะเห็นเฉพาะงานที่อนุมัติแล้ว หรือ งานของตนเอง
            if not is_staff_or_admin:
                items = [
                    i for i in items 
                    if i.get('workflow_status') == 'Approved' or i.get('faculty_id') == user_faculty_id
                ]
                
            return create_response(200, items)

        # ---------------------------------------------------------------------
        # Case D: กรณีไม่ระบุ Key ชัดเจน
        # ---------------------------------------------------------------------
        else:
            if is_staff_or_admin:
                # เจ้าหน้าที่/ผู้บริหาร ดึงทั้งหมดผ่าน Scan
                response = table.scan()
                return create_response(200, response.get('Items', []))
            elif user_faculty_id:
                # อาจารย์ทั่วไป ให้ดึงเฉพาะข้อมูลของตนเอง
                response = table.query(
                    KeyConditionExpression=Key('faculty_id').eq(user_faculty_id)
                )
                return create_response(200, response.get('Items', []))
            else:
                return create_response(400, {'message': 'กรุณาระบุ faculty_id หรือ term_id ในการค้นหา'})

    except Exception as e:
        return create_response(500, {'error': f'เกิดข้อผิดพลาดในการดึงข้อมูลภาระงาน: {str(e)}'})


# =============================================================================
# TASK 2: Lambda Function - SaveWorkload (Create & Update)
# PUT /workloads/{faculty_id}/{term_id}
# =============================================================================
def save_workload_handler(event, context):
    try:
        user_info = extract_user_claims(event)
        user_faculty_id = user_info['user_faculty_id']
        is_staff_or_admin = user_info['is_staff_or_admin']

        path_params = event.get('pathParameters') or {}
        target_faculty_id = path_params.get('faculty_id')
        target_term_id = path_params.get('term_id')

        if not target_faculty_id or not target_term_id:
            return create_response(400, {'message': 'กรุณาระบุ faculty_id และ term_id ใน Path Parameters'})

        # ---------------------------------------------------------------------
        # BOLA Protection: อาจารย์สามารถแก้ไขได้เฉพาะงานของตนเอง
        # ---------------------------------------------------------------------
        if not is_staff_or_admin and target_faculty_id != user_faculty_id:
            return create_response(403, {'message': 'BOLA Violation: คุณไม่มีสิทธิ์แก้ไขภาระงานของอาจารย์ท่านอื่น'})

        # อ่าน Body Payload
        body_raw = event.get('body')
        if not body_raw:
            return create_response(400, {'message': 'ไม่พบข้อมูลภาระงาน (Request body is empty)'})

        try:
            body = json.loads(body_raw, parse_float=Decimal)
        except json.JSONDecodeError:
            return create_response(400, {'message': 'รูปแบบ JSON ใน Request body ไม่ถูกต้อง'})

        # ---------------------------------------------------------------------
        # ตรวจสอบสถานะการแก้ไขใน DynamoDB
        # ---------------------------------------------------------------------
        existing_item = table.get_item(Key={'faculty_id': target_faculty_id, 'term_id': target_term_id}).get('Item')
        now_iso = datetime.now(timezone.utc).isoformat()

        if existing_item:
            current_status = existing_item.get('workflow_status', 'Draft')
            # หากอนุมัติแล้ว หรืออยู่ระหว่างรอตรวจ ห้ามอาจารย์แก้ไข
            if not is_staff_or_admin and current_status in ['Pending_Review', 'Approved']:
                return create_response(409, {
                    'message': f'ไม่สามารถแก้ไขได้ เนื่องจากรายการอยู่ในสถานะ "{current_status}" (แก้ไขได้เฉพาะ Draft หรือ Rejected)'
                })
            
            # คงค่าสถานะเดิมไว้ หากไม่มีการส่งสถานะใหม่มา
            workflow_status = body.get('workflow_status', current_status)
            created_at = existing_item.get('created_at', now_iso)
        else:
            # สร้างใหม่ ตั้งค่าสถานะเริ่มต้นเป็น Draft
            workflow_status = body.get('workflow_status', 'Draft')
            created_at = now_iso

        # จัดเตรียมโครงสร้างหมวดหมู่ภาระงานทั้ง 4 หมวด
        incoming_workloads = body.get('workloads', {})
        structured_workloads = {
            'teaching': incoming_workloads.get('teaching', []),
            'academic_outputs': incoming_workloads.get('academic_outputs', []),
            'services_and_admin': incoming_workloads.get('services_and_admin', []),
            'student_advising': incoming_workloads.get('student_advising', [])
        }

        # ประกอบข้อมูล Item ที่จะบันทึกลง DynamoDB
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

        # เก็บข้อมูล Audit ถ้ามี
        if 'review_comment' in body:
            item_to_save['review_comment'] = body['review_comment']
        if 'reviewed_by' in body:
            item_to_save['reviewed_by'] = body['reviewed_by']

        # บันทึกลง DynamoDB
        table.put_item(Item=item_to_save)

        return create_response(200, {
            'message': 'บันทึกข้อมูลภาระงานเรียบร้อยแล้ว',
            'data': item_to_save
        })

    except Exception as e:
        return create_response(500, {'error': f'ไม่สามารถบันทึกข้อมูลภาระงานได้: {str(e)}'})


# =============================================================================
# TASK 3: Lambda Function - DeleteWorkload
# DELETE /workloads/{faculty_id}/{term_id}
# =============================================================================
def delete_workload_handler(event, context):
    try:
        user_info = extract_user_claims(event)
        user_faculty_id = user_info['user_faculty_id']
        is_staff_or_admin = user_info['is_staff_or_admin']

        path_params = event.get('pathParameters') or {}
        target_faculty_id = path_params.get('faculty_id')
        target_term_id = path_params.get('term_id')

        if not target_faculty_id or not target_term_id:
            return create_response(400, {'message': 'กรุณาระบุ faculty_id และ term_id ใน Path Parameters'})

        # ---------------------------------------------------------------------
        # BOLA Protection: ตรวจสอบว่าเป็นเจ้าของงานหรือไม่
        # ---------------------------------------------------------------------
        if not is_staff_or_admin and target_faculty_id != user_faculty_id:
            return create_response(403, {'message': 'BOLA Violation: คุณไม่มีสิทธิ์ลบภาระงานของอาจารย์ท่านอื่น'})

        # ค้นหาข้อมูลเดิมใน DynamoDB
        existing_item = table.get_item(Key={'faculty_id': target_faculty_id, 'term_id': target_term_id}).get('Item')

        if not existing_item:
            return create_response(404, {'message': 'ไม่พบรายการภาระงานที่ต้องการลบ'})

        # ---------------------------------------------------------------------
        # Rule Check: ลบได้เฉพาะสถานะ Draft เท่านั้น
        # ---------------------------------------------------------------------
        current_status = existing_item.get('workflow_status', '')
        if current_status != 'Draft' and not is_staff_or_admin:
            return create_response(409, {
                'message': f'ไม่สามารถลบรายการได้ เนื่องจากไม่อยู่ในสถานะฉบับร่าง (สถานะปัจจุบัน: "{current_status}")'
            })

        # ดำเนินการลบ Item
        table.delete_item(Key={'faculty_id': target_faculty_id, 'term_id': target_term_id})

        return create_response(200, {
            'message': f'ลบรายการภาระงานเทอม {target_term_id} ของ {target_faculty_id} เรียบร้อยแล้ว'
        })

    except Exception as e:
        return create_response(500, {'error': f'เกิดข้อผิดพลาดในการลบข้อมูล: {str(e)}'})