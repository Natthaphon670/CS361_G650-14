import json
import boto3
import logging
from decimal import Decimal
from datetime import datetime, timezone

# ตั้งค่าระบบ Logging เพื่อบันทึกผลการทำงานและข้อผิดพลาด
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("migration_workloads.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def transform_workload_item(item):
    """
    ฟังก์ชันสำหรับ Transform ข้อมูลจากรูปแบบ V2 ให้เข้ากับ Schema ของ V3
    """
    # 1. นำ academic_year และ semester มาต่อกันเป็น term_id (Sort Key)
    academic_year = item.get('academic_year')
    semester = item.get('semester')
    item['term_id'] = f"{academic_year}#{semester}"
    
    # 2. เติมฟิลด์ workflow_status เป็น "Approved"
    item['workflow_status'] = "Approved"
    
    # 3. เพิ่ม timestamp เพื่อบันทึกเวลาที่ถูกนำเข้าสู่ระบบ
    item['created_at'] = datetime.now(timezone.utc).isoformat()
    item['updated_at'] = item['created_at']
    
    return item

def migrate_workloads():
    # กำหนดค่าเชื่อมต่อ AWS DynamoDB (ปรับ region_name ให้ตรงกับที่ใช้งาน)
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table('FacultyWorkloads')

    # อ่านข้อมูลจากไฟล์ JSON
    try:
        # ใช้ parse_float=Decimal เพื่อแปลงทศนิยมให้เข้ากับชนิดข้อมูลของ DynamoDB
        with open('faculties-workloads-mock.json', 'r', encoding='utf-8') as file:
            workloads_data = json.load(file, parse_float=Decimal)
        logger.info(f"📂 โหลดไฟล์ faculties-workloads-mock.json สำเร็จ พบข้อมูลทั้งหมด {len(workloads_data)} รายการ")
    except FileNotFoundError:
        logger.error("❌ ไม่พบไฟล์ faculties-workloads-mock.json ในโฟลเดอร์ปัจจุบัน")
        return
    except json.JSONDecodeError as e:
        logger.error(f"❌ รูปแบบไฟล์ JSON ไม่ถูกต้อง: {e}")
        return

    success_count = 0
    error_count = 0

    # นำเข้าข้อมูลด้วย batch_writer() เพื่อประสิทธิภาพสูงสุด
    try:
        with table.batch_writer() as batch:
            for raw_item in workloads_data:
                try:
                    # แปลงข้อมูล
                    transformed_item = transform_workload_item(raw_item)
                    
                    # นำเข้าสู่ Batch
                    batch.put_item(Item=transformed_item)
                    success_count += 1
                    
                except Exception as item_error:
                    # ดักจับ Error ระดับ Item เพื่อให้สคริปต์ทำงานต่อได้แม้มีบางรายการพัง
                    faculty_id = raw_item.get('faculty_id', 'Unknown')
                    term_id = raw_item.get('term_id', 'Unknown')
                    logger.error(f"⚠️ นำเข้าข้อมูลล้มเหลว [faculty_id: {faculty_id}, term_id: {term_id}] - Error: {item_error}")
                    error_count += 1

        logger.info(f"✅ การย้ายข้อมูลเสร็จสิ้น! นำเข้าสำเร็จ: {success_count} รายการ | ล้มเหลว: {error_count} รายการ")

    except Exception as batch_error:
        # ดักจับ Error ระดับ Batch (เช่น ปัญหา Network หรือ Permission)
        logger.critical(f"🚨 เกิดข้อผิดพลาดร้ายแรงระหว่างการเขียน Batch: {batch_error}")

if __name__ == '__main__':
    migrate_workloads()