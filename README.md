# CS361_G650-14
ระบบผลงานและภาระงานอาจารย์ (Faculty Output & Workload Management System)

## Project Overview

โครงการ **CS361_G650-14** เป็นระบบสารสนเทศสำหรับรวบรวม นำเสนอ และบริหารจัดการข้อมูลประวัติ ผลงานวิชาการ และภาระงานของอาจารย์ โดยพัฒนาต่อยอดจาก **V1 Faculty Profile & Public Output** และ **V2 Faculty Workload Repository** มาสู่ **V3 Secure Faculty Workspace** เพื่อยกระดับจากระบบสารสนเทศแบบเปิดอ่านอย่างเดียว (Read-only) ไปสู่ระบบบริหารจัดการข้อมูลแบบยืดหยุ่น ปลอดภัย รองรับการเข้าถึงตามบทบาท (Role-Based Access Control) พร้อมระบบอนุมัติภาระงานและจัดเก็บหลักฐานประกอบการประเมิน

### Project Evolution (V1 ➔ V2 ➔ V3)

- **V1 (Faculty Profile & Public Output):** ระบบแสดงผลข้อมูลประวัติ ผลงานวิชาการ และงานตีพิมพ์ของอาจารย์แบบ Static Web บน Amazon S3 สำหรับผู้ใช้ทั่วไป (Public Users)
- **V2 (Faculty Workload Repository):** เพิ่มคลังข้อมูลภาระงาน 4 หมวดหมู่ แยกตามรหัสอาจารย์ ปีการศึกษา และภาคการศึกษา พร้อมระบบ Real-time Directory Search
- **V3 (Secure Faculty Workspace):** ยกระดับความปลอดภัยด้วย Amazon Cognito, เปลี่ยนผ่านสู่ Serverless Dynamic Backend (DynamoDB + API Gateway + Lambda), ระบบจัดเก็บหลักฐานบน Private S3 ผ่าน Pre-signed URLs และ Workflow อนุมัติภาระงาน

---

## Primary Users & Roles

- **Public Users (ผู้ใช้ทั่วไป / นักศึกษา):** เข้าถึงข้อมูลประวัติ ความเชี่ยวชาญ และผลงานวิชาการสาธารณะของอาจารย์
- **Faculty (อาจารย์):** เข้าสู่ระบบเพื่อจัดการภาระงานของตนเองทั้ง 4 หมวดหมู่ อัปโหลดเอกสารหลักฐาน และส่งขออนุมัติ (`Submit`)
- **Staff (เจ้าหน้าที่สาขาวิชา):** ตรวจสอบภาระงานของอาจารย์ในสาขา อนุมัติหรือส่งกลับแก้ไข (`Approve`/`Reject`) และดูภาพรวมระดับสาขา
- **Admin (ผู้บริหาร):** ตรวจสอบ สรุป และอนุมัติภาพรวมภาระงานระดับสาขาวิชาผ่าน Executive Dashboard

---

## V3 Key Architecture & Features

### 1. Authentication & Authorization (Issue #1)
- **Amazon Cognito User Pool:** ระบบพิสูจน์ตัวตนมาตรฐาน OAuth 2.0 / OpenID Connect รองรับ Authorization Code Grant ร่วมกับ PKCE
- **User Groups (RBAC):** กำหนดกลุ่มผู้ใช้งาน 3 ระดับ ได้แก่ `Faculty`, `Staff`, และ `Admin`
- **JWT Claims:** แนบข้อมูล `cognito:groups` และ `faculty_id` ลงใน JWT Token เพื่อส่งให้ Backend ใช้ตรวจสอบสิทธิ์

### 2. Database Migration to DynamoDB (Issue #2)
- **Amazon DynamoDB:** ย้ายข้อมูลจาก Static JSON มายัง NoSQL Database รองรับข้อมูลหลายปีการศึกษา
- **Keys Design:** กำหนด Partition Key เป็น `faculty_id` และ Sort Key เป็น `academic_year#semester`
- **Global Secondary Index (GSI):** สร้าง GSI สำหรับให้ Staff และ Admin ค้นหาและกรองข้อมูลภาพรวมได้รวดเร็ว
- **Workflow Status Tracking:** รองรับการบันทึกสถานะ `Draft`, `Pending_Review`, `Approved`, และ `Rejected`

### 3. Secure Serverless Backend APIs (Issue #3)
- **REST API via API Gateway:** เชื่อมต่อกับ AWS Lambda สำหรับประมวลผล CRUD Operations
- **Cognito Authorizer:** ตรวจสอบความถูกต้องของ JWT Token ที่ชั้น API Gateway ก่อนเข้าถึง Lambda
- **BFLA (Broken Function Level Authorization) Protection:** ตรวจสอบ `cognito:groups` ใน Lambda ป้องกันการเรียกใช้ API ผิดสิทธิ์ (เช่น อาจารย์เรียกใช้ Endpoint สำหรับ Approve)
- **BOLA (Broken Object Level Authorization) Protection:** ตรวจสอบ Ownership เพื่อให้มั่นใจว่าอาจารย์สามารถแก้ไขได้เฉพาะข้อมูลภาระงานของตนเองเท่านั้น

### 4. Private Evidence Storage (Issue #4)
- **Private S3 Bucket:** จัดเก็บไฟล์เอกสารหลักฐานประกอบภาระงานโดยบล็อกการเข้าถึงจากสาธารณะ 100%
- **Pre-signed URLs:** สร้าง temporary PUT/GET URLs ผ่าน AWS Lambda ชั่วคราวสำหรับการอัปโหลดและดาวน์โหลดไฟล์อย่างปลอดภัย
- **CORS Protection:** กำหนด Policy บน S3 ให้รองรับคำขอเฉพาะจากโดเมน Web Application เท่านั้น

### 5. Dynamic Role-based Frontend (Issue #5)
- **AWS Amplify Hosting:** Deploy Frontend บน AWS Amplify เพื่อรองรับ HTTPS สำหรับการทำงานร่วมกับ Cognito Redirects
- **Secure Token Management:** บริหารจัดการ Login Session และ Token ฝั่ง Client อย่างปลอดภัย
- **Dynamic UI Controls:** แสดงผลเมนู ปุ่มกด (เช่น ปุ่ม *"ส่งตรวจสอบ"*, *"รับรองผลงาน"*) และฟอร์มตามสิทธิ์ผู้ใช้งาน
- **Executive Dashboard:** หน้าสรุปข้อมูลภาระงานภาพรวมระดับสาขาวิชา สามารถกรองตามปีการศึกษาและภาคการศึกษาได้

### 6. Logging, Audit Trail & Rate Limiting (Security Issue 5)

**5.1 Audit Logs → Amazon CloudWatch** (`audit_logger.py`)
- Lambda เขียน Audit Log เป็น JSON บรรทัดเดียวต่อเหตุการณ์ (`"log_type": "AUDIT"`) ทุกครั้งที่มี Submit / Approve / Reject, สร้าง / แก้ไข / ลบภาระงาน และแก้ไขโปรไฟล์
- แต่ละ record เก็บ `timestamp` (UTC), `event_type`, `outcome` (`SUCCESS` / `DENIED` / `CONFLICT` / `ERROR`), ผู้กระทำ (`actor.username`, `actor.faculty_id`, `actor.groups`), เป้าหมาย (`target.faculty_id`, `target.term_id`), `status_from` → `status_to`, `source_ip` และ request id
- บันทึกทั้งการกระทำที่สำเร็จและที่ถูกปฏิเสธ (BOLA/BFLA) เพื่อตรวจย้อนกลับการพยายามเข้าถึงผิดสิทธิ์
- ไม่บันทึก Token, Request body หรือเนื้อหา comment และการเขียน log จะไม่ทำให้ request ล้ม
- Error ฝั่ง Server (`"log_type": "ERROR"`) ถูกบันทึกใน CloudWatch ส่วน Client เห็นเพียงข้อความทั่วไป

ตัวอย่าง Query ใน CloudWatch Logs Insights:
```
fields timestamp, event_type, outcome, actor.username, target.faculty_id, target.term_id, status_from, status_to
| filter log_type = "AUDIT" and target.faculty_id = "FAC001"
| sort timestamp desc
```

**5.2 Rate Limiting บน API Gateway**
| ชั้น | ไฟล์ | การตั้งค่า (default) |
|---|---|---|
| Main API (REST, สร้างผ่าน Console) | `infra/apply-rate-limiting.sh` | Stage throttling 20 rps / burst 40, `POST .../status` 5 rps / burst 10, Usage Plan 10 rps / burst 20 / 10,000 req ต่อวันต่อ API key |
| Evidence API (HTTP API, SAM) | `infra/evidence-api.yaml` | Default route 20 rps / burst 40, `POST /evidence/upload-url` 5 rps / burst 10 |
| Per-IP (ทางเลือก, มีค่าใช้จ่าย) | `infra/api-waf.yaml` | AWS WAF rate-based rule บล็อก IP ที่เกิน 500 req / 5 นาที |
| Monitoring | `infra/api-monitoring.yaml` | Metric filter จาก Audit Log + Alarm เมื่อ DENIED ≥ 10 หรือ 4XX (รวม 429) ≥ 200 ใน 5 นาที |

```bash
./infra/apply-rate-limiting.sh                 # ใช้ throttling + สร้าง usage plan
REQUIRE_API_KEY=true ./infra/apply-rate-limiting.sh   # บังคับ x-api-key แล้วใส่ค่าใน config.js
node infra/load-test.mjs                       # ทดสอบว่าได้ HTTP 429 เมื่อเกิน limit
python -m pytest tests/ -q                     # unit test ของ Audit Logging
```

> Stage throttling เป็น token bucket ที่ทุก client ใช้ร่วมกัน ผู้โจมตีรายเดียวอาจทำให้ผู้ใช้อื่นโดน 429 ไปด้วย ถ้าต้องการจำกัดราย IP จริง ให้ deploy `infra/api-waf.yaml`

---

## Data Structure

### DynamoDB Schema (`FacultyWorkloads` Table)

```json
{
  "faculty_id": "FAC001",
  "academic_year#semester": "2025#1",
  "workflow_status": "Pending_Review",
  "workloads": {
    "teaching": [
      {
        "course": "CS361",
        "hours": 3,
        "evidence_s3_key": "evidence/FAC001/2025_1_cs361.pdf"
      }
    ],
    "research": [],
    "academic_service": [],
    "professional_development": []
  },
  "audit_trail": [
    {
      "action": "SUBMITTED",
      "by": "FAC001",
      "timestamp": "2026-10-19T10:00:00Z"
    }
  ]
}
```

---

## System Architecture Diagram (V3)

- **AWS Architecture Diagram:** [Click Here](https://canva.link/lm69eondtsl6a2e)

---

## V1 / V2 / V3 Comparison

| คุณสมบัติ (Feature) | V1 | V2 | V3 (Current Version) |
|---|---|---|---|
| **Hosting Environment** | S3 Direct Static | S3 Direct Static | **AWS Amplify (Automated HTTPS)** |
| **Authentication** | ไม่มี (Public) | ไม่มี (Public) | **Amazon Cognito (OAuth 2.0 + PKCE)** |
| **User Authorization** | N/A | N/A | **RBAC (`Faculty`, `Staff`, `Admin`)** |
| **Data Storage** | `faculties.json` | Mock Workload JSON | **Amazon DynamoDB (PK/SK + GSI)** |
| **Backend Architecture** | Client-side only | Client-side Repository | **Serverless (API Gateway + AWS Lambda)** |
| **API Security** | N/A | N/A | **Cognito Authorizer + BFLA & BOLA Protection** |
| **Evidence Storage** | N/A | N/A | **Private S3 Bucket + Pre-signed URLs** |
| **Workflow Management** | N/A | N/A | **`Draft` ➔ `Pending_Review` ➔ `Approved` / `Rejected`** |

---

## Web Application

- **Live Site:** [เปิดหน้าเว็บระบบบน AWS Amplify](https://main.d2eorbfslu1s80.amplifyapp.com/)
