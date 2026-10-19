import json
import os
import boto3
from decimal import Decimal
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from auth_utils import get_user_claims, verify_bola, verify_bfla, AuthorizationError

# -----------------------------------------------------------------------------
# Configuration & DynamoDB Setup
# -----------------------------------------------------------------------------
dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME', 'FacultyProfiles')
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS'
}

class DecimalEncoder(json.JSONEncoder):
    """Encoder สำหรับแปลงชนิดข้อมูล Decimal ของ DynamoDB เป็น JSON Number"""
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
# TASK 1: Lambda Function - GetProfiles
# GET /profiles               (ดึงรายชื่ออาจารย์ทั้งหมด - Public)
# GET /profiles/{faculty_id}  (ดึงโปรไฟล์อาจารย์รายบุคคล - Public)
# =============================================================================
def get_profiles_handler(event, context):
    try:
        path_params = event.get('pathParameters') or {}
        query_params = event.get('queryStringParameters') or {}
        
        target_faculty_id = path_params.get('faculty_id') or query_params.get('faculty_id')

        # ---------------------------------------------------------------------
        # Case A: ดึงข้อมูลโปรไฟล์อาจารย์รายบุคคลด้วย faculty_id
        # ---------------------------------------------------------------------
        if target_faculty_id:
            response = table.get_item(Key={'faculty_id': target_faculty_id})
            item = response.get('Item')
            
            if not item:
                return create_response(404, {
                    'message': f'ไม่พบข้อมูลโปรไฟล์ของอาจารย์รหัส {target_faculty_id}'
                })
            
            return create_response(200, item)

        # ---------------------------------------------------------------------
        # Case B: ดึงรายชื่ออาจารย์ทั้งหมด (Directory / List View)
        # ---------------------------------------------------------------------
        else:
            response = table.scan()
            items = response.get('Items', [])
            return create_response(200, items)

    except Exception as e:
        return create_response(500, {
            'error': f'เกิดข้อผิดพลาดในการดึงข้อมูลโปรไฟล์: {str(e)}'
        })


# =============================================================================
# TASK 2: Lambda Function - UpdateProfile
# PUT /profiles/{faculty_id}  (อาจารย์แก้ไขโปรไฟล์ตนเอง / Staff แก้ไขให้)
# =============================================================================
def update_profile_handler(event, context):
    try:
        # 1. ดึง Claims จาก Cognito JWT Token
        user_info = get_user_claims(event)
        
        path_params = event.get('pathParameters') or {}
        target_faculty_id = path_params.get('faculty_id')

        if not target_faculty_id:
            return create_response(400, {
                'message': 'กรุณาระบุ faculty_id ใน Path Parameters (เช่น /profiles/prof_001)'
            })

        # 2. BOLA Protection: ตรวจสอบว่าเป็นเจ้าของโปรไฟล์ตนเอง หรือเป็น Staff/Admin
        verify_bola(user_info, target_faculty_id)

        # 3. อ่าน Body Payload
        body_raw = event.get('body')
        if not body_raw:
            return create_response(400, {
                'message': 'ไม่พบข้อมูลโปรไฟล์ที่ต้องการอัปเดต (Request body is empty)'
            })

        try:
            body = json.loads(body_raw, parse_float=Decimal)
        except json.JSONDecodeError:
            return create_response(400, {
                'message': 'รูปแบบ JSON ใน Request body ไม่ถูกต้อง'
            })

        # 4. ดึงข้อมูลเดิมมาอ้างอิง (ถ้ามี)
        existing_item = table.get_item(Key={'faculty_id': target_faculty_id}).get('Item') or {}
        now_iso = datetime.now(timezone.utc).isoformat()

        # 5. จัดเตรียมข้อมูลสำหรับบันทึก
        updated_item = {
            'faculty_id': target_faculty_id,
            'name_th': body.get('name_th', existing_item.get('name_th', '')),
            'name_en': body.get('name_en', existing_item.get('name_en', '')),
            'academic_position': body.get('academic_position', existing_item.get('academic_position', '')),
            'contact_information': body.get('contact_information', existing_item.get('contact_information', {})),
            'research_interests': body.get('research_interests', existing_item.get('research_interests', [])),
            'education': body.get('education', existing_item.get('education', [])),
            'expertise': body.get('expertise', existing_item.get('expertise', [])),
            'external_profiles': body.get('external_profiles', existing_item.get('external_profiles', {})),
            'publications': body.get('publications', existing_item.get('publications', [])),
            'updated_at': now_iso
        }

        # คำนวณจำนวนผลงานตีพิมพ์ (total_publications) ให้อัตโนมัติ
        updated_item['total_publications'] = len(updated_item['publications'])

        # 6. บันทึกลง DynamoDB ตาราง FacultyProfiles
        table.put_item(Item=updated_item)

        return create_response(200, {
            'message': 'อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว',
            'data': updated_item
        })

    except AuthorizationError as auth_err:
        return create_response(auth_err.status_code, {
            'error': 'Forbidden', 
            'message': auth_err.message
        })
    except Exception as e:
        return create_response(500, {
            'error': f'เกิดข้อผิดพลาดในการอัปเดตข้อมูลโปรไฟล์: {str(e)}'
        })