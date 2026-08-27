# CS361_G650-14
ระบบผลงานและภาระงานอาจารย์

# Faculty Profile & Public Output (V1)

ระบบแสดงข้อมูลประวัติและผลงานวิชาการของอาจารย์สำหรับสาขาวิชา (Information Service) ในรูปแบบ Static Web Application ที่ทำงานบน **Amazon S3** ล้วน เพื่อให้ผู้ใช้ทั่วไปสามารถเข้าชมข้อมูลประวัติและผลงานวิจัยของอาจารย์ได้อย่างสะดวกรวดเร็ว

---

## 1. ขอบเขตของ V1 (Scope)

* **Public Read-Only:** ผู้ใช้ทั่วไปสามารถเปิดดูข้อมูลได้โดยไม่ต้องเข้าสู่ระบบ (No Authentication)
* **No Search Functionality:** แสดงรายชื่ออาจารย์ทั้งหมดในรูปแบบการ์ด และคลิกเข้าไปดูหน้ารายละเอียดรายบุคคล
* **Serverless & Database-less:** ไม่มีการใช้งานฐานข้อมูล RDS หรือเซิร์ฟเวอร์ Backend รันผ่าน Static Files และไฟล์ข้อมูล JSON บน Amazon S3 ทั้งหมด

---

## 2. สถาปัตยกรรมระบบ (V1 Architecture)

ระบบประกอบด้วย Frontend และ Data Source ที่รวมอยู่ภายใน **Amazon S3 Bucket เดียวกัน**:

```text
[ ผู้ใช้ทั่วไป (Web Browser) ]
              │
              ▼ (HTTP/HTTPS)
    [ Amazon S3 Bucket ]
    (Static Website Hosting)
    ├── index.html       (หน้าแสดงรายชื่ออาจารย์)
    ├── profile.html     (หน้าแสดงประวัติและผลงาน)
    ├── faculties.json   (ไฟล์ข้อมูลรวมประวัติและผลงาน)
    └── assets/          (รูปภาพโปรไฟล์อาจารย์)
