import json
import boto3
from decimal import Decimal
from datetime import datetime, timezone

def migrate_profiles():
    # 1. ตั้งค่าการเชื่อมต่อ DynamoDB (กรุณาเปลี่ยน region_name ให้ตรงกับที่สร้างตารางไว้)
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table('FacultyProfiles')

    # 2. อ่านข้อมูลจากไฟล์ JSON
    # หมายเหตุ: ใช้ parse_float=Decimal เพื่อแปลงตัวเลขทศนิยมให้เข้ากับข้อกำหนดของ DynamoDB อัตโนมัติ
    try:
        with open('faculties.json', 'r', encoding='utf-8') as file:
            faculties_data = json.load(file, parse_float=Decimal)
    except FileNotFoundError:
        print("❌ Error: ไม่พบไฟล์ faculties.json ในโฟลเดอร์ปัจจุบัน")
        return
    except json.JSONDecodeError:
        print("❌ Error: รูปแบบไฟล์ JSON ไม่ถูกต้อง")
        return

    print(f"กำลังเตรียมนำเข้าข้อมูลจำนวน {len(faculties_data)} รายการ สู่ตาราง FacultyProfiles...")

    # 3. นำเข้าข้อมูลโดยใช้ Batch Writer
    success_count = 0
    try:
        with table.batch_writer() as batch:
            for profile in faculties_data:
                # เพิ่มฟิลด์ updated_at (ISO 8601 Timestamp) เพื่อบันทึกเวลาที่อัปเดตข้อมูลล่าสุด
                profile['updated_at'] = datetime.now(timezone.utc).isoformat()
                
                # นำข้อมูลเข้าสู่ batch
                batch.put_item(Item=profile)
                success_count += 1
                
        print(f"✅ สำเร็จ! นำเข้าข้อมูลทั้งหมด {success_count} รายการลง DynamoDB เรียบร้อยแล้ว")
        
    except Exception as e:
        print(f"❌ เกิดข้อผิดพลาดระหว่างการเขียนข้อมูลลง DynamoDB: {e}")

if __name__ == '__main__':
    migrate_profiles()