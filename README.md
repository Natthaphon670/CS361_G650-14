# CS361_G650-14
ระบบผลงานและภาระงานอาจารย์

## Project Overview

โครงการ **CS361_G650-14** เป็นระบบสารสนเทศสำหรับรวบรวมและนำเสนอข้อมูลประวัติ ผลงานวิชาการ และภาระงานของอาจารย์ โดยพัฒนาจาก **V1 Faculty Profile & Public Output** ไปสู่ **V2 Faculty Workload Repository** เพื่อให้ข้อมูลถูกจัดเก็บและเรียกใช้อย่างเป็นระบบมากขึ้น

### V2 Objectives

- รวมข้อมูลประวัติและผลงานวิชาการของอาจารย์ไว้ในระบบส่วนกลาง
- เพิ่ม **Faculty Workload Repository** สำหรับข้อมูลภาระงานอาจารย์
- รองรับภาระงาน 4 หมวดหมู่ ได้แก่ **Teaching, Research, Academic Service และ Professional Development**
- รองรับการค้นหาอาจารย์แบบ **Real-time Directory Search**
- รองรับการกรองข้อมูลภาระงานตาม **Academic Year** และ **Semester**
- จัดเก็บข้อมูลในรูปแบบ JSON ตามโครงสร้างที่กำหนด เพื่อให้ Frontend สามารถเรียกใช้ได้โดยตรง

## Primary User

- **V1:** ผู้ใช้ทั่วไป (Public Users) นักเรียน/นักศึกษา หรือบุคคลภายนอกที่ต้องการเข้าถึงข้อมูลประวัติ ความเชี่ยวชาญ และผลงานวิชาการของอาจารย์
- **V2:** อาจารย์ เจ้าหน้าที่สาขาวิชา และผู้บริหาร ที่ต้องการจัดการ ติดตาม ตรวจสอบ และสรุปข้อมูลภาระงานประจำปี

## Problem

ผู้ใช้งานประสบปัญหาในการรวบรวม ตรวจสอบ และสรุปข้อมูลผลงานและภาระงานของอาจารย์ เนื่องจากข้อมูลจัดเก็บกระจายอยู่ในหลายไฟล์ หลายแหล่งข้อมูล และมีรูปแบบที่แตกต่างกัน ทำให้ใช้เวลาในการรวบรวมมาก เกิดข้อมูลซ้ำซ้อนหรือไม่ครบถ้วน และยากต่อการมองเห็นภาพรวมผลงานของอาจารย์และสาขาวิชาทั้งในมุมมองภายในและการเผยแพร่สู่ภายนอก

---

# V2 Faculty Profile & Workload Repository

V2 ยังคงให้บริการข้อมูลประวัติและผลงานวิชาการผ่าน Static Web Application บน **Amazon S3** และเพิ่มคลังข้อมูลภาระงานอาจารย์ที่แยกตามรหัสอาจารย์ ปีการศึกษา และภาคการศึกษา

## V2 Key Features

### 1. Real-time Directory Search

ผู้ใช้สามารถค้นหารายชื่ออาจารย์จาก Faculty Directory ได้แบบ Real-time โดยระบบกรองรายการที่ตรงกับคำค้นและแสดงผลบนหน้าเว็บทันที

### 2. Categorized Workloads

ข้อมูลภาระงานถูกแบ่งเป็น 4 หมวดหมู่:

- **Teaching**
- **Research**
- **Academic Service**
- **Professional Development**

### 3. Term Filtering

ข้อมูลภาระงานรองรับการค้นหาและกรองตาม:

- `faculty_id`
- `academic_year`
- `semester`
- `workloads`

---

## Data Structure

### `faculties.json`

ไฟล์ข้อมูลหลักสำหรับข้อมูลประวัติและผลงานตีพิมพ์ทางวิชาการของอาจารย์ โดยข้อมูลผลงานมาจากแหล่งข้อมูลภายนอก เช่น Faculty Website และ Google Scholar

### `faculty-workloads.schema.json`

ไฟล์ Schema ที่กำหนดโครงสร้างข้อมูลภาระงานอาจารย์ เพื่อให้ข้อมูลมีรูปแบบที่เป็นระบบและสามารถตรวจสอบโครงสร้างก่อนนำไปใช้งานได้

โครงสร้างหลักที่ใช้ในการสืบค้น ได้แก่:

```text
faculty_id
academic_year
semester
workloads
```

ตัวอย่างโครงสร้าง:

```json
{
  "faculty_id": "FAC001",
  "academic_year": "2025",
  "semester": 1,
  "workloads": {
    "teaching": [],
    "research": [],
    "academic_service": [],
    "professional_development": []
  }
}
```

### `faculties-workloads-mock.json`

ชุดข้อมูลจำลองสำหรับทดสอบ Faculty Workload Repository โดยจัดเก็บข้อมูลภาระงานตาม `faculty_id`, `academic_year`, `semester` และหมวดหมู่ใน `workloads`

ตัวอย่าง:

```json
{
  "faculty_id": "FAC001",
  "academic_year": "2025",
  "semester": 1,
  "workloads": {
    "teaching": [
      {
        "course": "CSxxx",
        "hours": 3
      }
    ],
    "research": [],
    "academic_service": [],
    "professional_development": []
  }
}
```

> ตัวอย่างด้านบนเป็นตัวอย่างโครงสร้างเพื่ออธิบายรูปแบบข้อมูล ไม่ได้หมายถึงข้อมูลจริงของอาจารย์

---

# System Architecture (V2)

V2 Architecture เพิ่มแหล่งข้อมูล **Faculty Workload Evaluation** และเพิ่ม Data Stores สำหรับข้อมูลภาระงาน โดย Amazon S3 ยังคงเป็นพื้นที่สำหรับ Static Web Application, Static Assets และ JSON Data

### V2 Architecture Diagram

[เปิดดู AWS Architecture Diagram V2 บน Miro](https://miro.com/app/board/uXjVHtdmkhM=/?share_link_id=966448347516&fbclid=PAT01DUAUEaLVwZG9mAmV4dG4DYWVtAjEwAHNydGMGYXBwX2lkDzU2NzA2NzM0MzM1MjQyNwABp_kdq9PrwhOGp3sUE64z1Judva4NVS_Yxzm9WH1XQwNqZi0HJaR6KEmLfZX5_aem_5B2gx4cIFRuiOWqodc3KdQ)

โครงสร้างโดยสรุป:

```text
Data Sources
├── Faculty Website
├── Google Scholar
└── Faculty Workload Evaluation
        │
        ▼
   Python Script
   Extract / Validate / Transform
        │
        ├── faculties.json
        └── faculties-workloads-mock.json
                         │
                         ▼
              Amazon S3
              ├── Web Application
              │   ├── index.html
              │   ├── profile.html
              │   ├── style.css
              │   └── *.js
              │
              ├── Static Assets
              │   └── profile_image/
              │
              └── Data Stores
                  ├── faculties.json
                  └── faculties-workloads-mock.json
```

---

## Project Structure

โครงสร้างไฟล์หลักของโปรเจกต์ประกอบด้วยหน้าเว็บ ไฟล์ CSS/JavaScript ข้อมูลจำลอง และ Schema:

```text
CS361_G650-14/
├── index.html
├── profile.html
├── style.css
├── index.js
├── profile.js
├── faculties.json
├── faculties-workloads-mock.json
├── faculty-workloads.schema.json
├── workload-repository.js
├── workload-repository.test.mjs
└── profile_image/
    └── (faculty images)
```

### Frontend

- `index.html` — หน้า Faculty Directory
- `profile.html` — หน้า Faculty Profile
- `style.css` — CSS กลางของระบบ
- `index.js` — JavaScript สำหรับหน้า Directory และการค้นหา
- `profile.js` — JavaScript สำหรับหน้า Profile และการเรียกใช้ข้อมูล

### Workload Repository

- `workload-repository.js` — โมดูลคลังข้อมูลสำหรับโหลดและค้นข้อมูลภาระงาน
- `workload-repository.test.mjs` — ชุดทดสอบ Repository
- รองรับการค้นหาตาม `faculty_id`, `academic_year`, `semester` และหมวดหมู่ `workloads`

### Data & Schema

- `faculties.json` — ข้อมูลประวัติและผลงานวิชาการ
- `faculty-workloads.schema.json` — Schema ของข้อมูลภาระงาน
- `faculties-workloads-mock.json` — Mock Dataset ของภาระงาน 4 หมวดหมู่
- `profile_image/` — รูปภาพอาจารย์

---

## External Actors / Systems

- **cs.sci.tu.ac.th:** แหล่งข้อมูลส่วนตัวของอาจารย์
- **Google Scholar:** แหล่งข้อมูลผลงานวิชาการของอาจารย์
- **Amazon S3:** แหล่งจัดเก็บ Static Web Application, Static Assets และไฟล์ JSON

---

## V1 → V2 Changes

| ส่วน | V1 | V2 |
|---|---|---|
| Faculty Directory | แสดงรายชื่ออาจารย์ | เพิ่ม Real-time Directory Search |
| Faculty Profile | ข้อมูลประวัติและผลงาน | คงความสามารถเดิมและเชื่อมกับข้อมูลระบบ V2 |
| Workload Repository | ไม่มี | เพิ่มคลังภาระงานอาจารย์ |
| Workload Categories | ไม่มี | Teaching / Research / Academic Service / Professional Development |
| Data Filtering | จำกัดข้อมูลพื้นฐาน | รองรับ `faculty_id`, `academic_year`, `semester` |
| Data Schema | `faculties.json` | เพิ่ม `faculty-workloads.schema.json` |
| Workload Dataset | ไม่มี | เพิ่ม `faculties-workloads-mock.json` |
| AWS S3 | Static Web + JSON | Web Application + Static Assets + Data Stores |

---

## V1 Out of Scope / Future Versions

- **Secure Faculty Workspace (V3):** การรองรับการเข้าสู่ระบบและผู้ใช้หลายบทบาท รวมถึงการจัดการข้อมูลตามสิทธิ์
- **Department Reporting & Aggregation (V4):** การรวบรวมและสรุปข้อมูลผลงานและภาระงานจากอาจารย์หลายคนและหลายปีการศึกษา
- **Automation (V5):** Infrastructure และ Deployment ด้วย Automation / Infrastructure as Code
- **Performance & Cost (V6):** การวัดผล Critical Path, Bottleneck, Before–After และต้นทุน
- **Integrated System (V7):** การบูรณาการข้อมูลอาจารย์ ผลงาน ภาระงาน การตรวจสอบข้อมูล และการรายงานระดับสาขาวิชา

---

## Web Application

[เปิดหน้าเว็บระบบ](http://faculty-output-and-workload-management-system-g14.s3-website-us-east-1.amazonaws.com/index.html)
