// ฟังก์ชันหลักสำหรับดึงข้อมูล
async function fetchFaculties() {
    try {
    // ใช้ Fetch API เพื่อดึงข้อมูลจากไฟล์ faculties.json ที่ได้จาก Python
    const response = await fetch('faculties.json');
    const faculties = await response.json();
        
    renderFaculties(faculties);
    } catch (error) {
        console.error('ไม่สามารถดึงไฟล์ faculties.json ได้ กำลังใช้ข้อมูลสำรอง...', error);
    }
}

// ฟังก์ชันสำหรับนำข้อมูลมาสร้างเป็นการ์ด HTML
function renderFaculties(faculties) {
    const grid = document.getElementById('faculty-grid');
    const loading = document.getElementById('loading-state');
      
    grid.innerHTML = ''; // ล้างพื้นที่ก่อนใส่ข้อมูล
      
    faculties.forEach(faculty => {
      const card = document.createElement('div');
      card.className = 'faculty-card';
      // จัดการเรื่องรูปภาพ
      // 1. ดึงตัวเลขรหัสอาจารย์ เช่น "prof_001" เป็น "001"
      const profNumber = faculty.faculty_id ? faculty.faculty_id.replace('prof_', '') : '001';
        
      // 2. กำหนดนามสกุลไฟล์ (.png สำหรับ 022 นอกนั้น .jpg)
      const ext = profNumber === '022' ? '.png' : '.jpg';
      const imgPath = `https://faculty-output-and-workload-management-system-g14.s3.us-east-1.amazonaws.com/profile_image/prof_img_${profNumber}${ext}`;
        
      // 3. สร้างตัวอักษรย่อสำหรับกรณีที่โหลดรูปไม่สำเร็จ
      const initials = faculty.name_en ? faculty.name_en.split(' ').pop().substring(0, 2).toUpperCase() : 'TU';
        
      // สร้างหน้าตาของการ์ดและใส่ตัวแปรลงไป
      // ลิงก์ไปยังหน้าโปรไฟล์จะมีการแนบ ?id= เพื่อใช้ดึงข้อมูลต่อในหน้าถัดไป
      card.innerHTML = `
        <div class="avatar-placeholder" style="overflow: hidden;">
          <img src="${imgPath}" alt="${faculty.name_th}" 
                style="width: 90%; height: 100%; object-fit: cover; display: block;" 
                onerror="this.onerror=null; this.parentNode.innerHTML='${initials}';">
        </div>
        <h2 class="faculty-name-th">${faculty.name_th}</h2>
        <p class="faculty-name-en">${faculty.name_en}</p>
        <div class="position-badge">${faculty.academic_position}</div>
        <a href="profile.html?id=${faculty.faculty_id}" class="view-profile-btn">ดูประวัติและผลงาน</a>
      `;
        
      grid.appendChild(card);
    });
      
    // ปิดข้อความกำลังโหลด และเปิดการแสดงผล Grid
    loading.style.display = 'none';
    grid.style.display = 'grid';
}

// สั่งให้เริ่มดึงข้อมูลทันทีที่โครงสร้างหน้าเว็บโหลดเสร็จ
document.addEventListener('DOMContentLoaded', fetchFaculties);