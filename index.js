let allFaculties = [];

// ฟังก์ชันหลักสำหรับดึงข้อมูล
async function fetchFaculties() {
  const loading = document.getElementById('loading-state');
  try {
    const response = await fetch('faculties.json');
    if (!response.ok) throw new Error('Network error');
    
    // 2. บันทึกข้อมูลลงใน allFaculties
    allFaculties = await response.json();
        
    renderFaculties(allFaculties);
  } catch (error) {
    console.error('ไม่สามารถดึงไฟล์ faculties.json ได้:', error);
    if (loading) {
      loading.innerHTML = '<p style="color: var(--tu-red);">เกิดข้อผิดพลาดในการโหลดข้อมูลอาจารย์</p>';
    }
  }
}

// ฟังก์ชันสำหรับนำข้อมูลมาสร้างเป็นการ์ด HTML
function renderFaculties(faculties) {
  const grid = document.getElementById('faculty-grid');
  const loading = document.getElementById('loading-state');
      
  grid.innerHTML = ''; // ล้างพื้นที่ก่อนใส่ข้อมูล
      
  if (faculties.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">ไม่พบรายชื่ออาจารย์ที่ตรงกับคำค้นหา</p>';
    loading.style.display = 'none';
    grid.style.display = 'grid';
    return;
  }

  faculties.forEach(faculty => {
    const card = document.createElement('div');
    card.className = 'faculty-card';
    
    const profNumber = faculty.faculty_id ? faculty.faculty_id.replace('prof_', '') : '001';
    const ext = profNumber === '022' ? '.png' : '.jpg';
    const imgPath = `https://faculty-output-and-workload-management-system-g14.s3.us-east-1.amazonaws.com/profile_image/prof_img_${profNumber}${ext}`;
    const initials = faculty.name_en ? faculty.name_en.split(' ').pop().substring(0, 2).toUpperCase() : 'TU';
        
    card.innerHTML = `
      <div class="avatar-placeholder" style="overflow: hidden;">
        <img src="${imgPath}" alt="${escapeHtml(faculty.name_th)}" 
              style="width: 100%; height: 100%; object-fit: cover; display: block;" 
              onerror="this.onerror=null; this.parentNode.innerHTML='${initials}';">
      </div>
      <h2 class="faculty-name-th">${escapeHtml(faculty.name_th)}</h2>
      <p class="faculty-name-en">${escapeHtml(faculty.name_en)}</p>
      <div class="position-badge">${escapeHtml(faculty.academic_position || 'อาจารย์')}</div>
      <a href="profile.html?id=${encodeURIComponent(faculty.faculty_id)}" class="view-profile-btn">ดูประวัติและผลงาน</a>
    `;
        
    grid.appendChild(card);
  });
      
  loading.style.display = 'none';
  grid.style.display = 'grid';
}

// ฟังก์ชันค้นหาเมื่อผู้ใช้พิมพ์ในกล่อง Search
function handleSearch() {
  const query = document.getElementById('faculty-search').value.toLowerCase().trim();
  const filtered = allFaculties.filter(faculty => {
    const nameTh = (faculty.name_th || '').toLowerCase();
    const nameEn = (faculty.name_en || '').toLowerCase();
    const pos = (faculty.academic_position || '').toLowerCase();
    return nameTh.includes(query) || nameEn.includes(query) || pos.includes(query);
  });
  renderFaculties(filtered);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, match => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[match]);
}

document.addEventListener('DOMContentLoaded', () => {
  fetchFaculties();
  const searchInput = document.getElementById('faculty-search');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }
});