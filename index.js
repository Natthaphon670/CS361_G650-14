let allFaculties = [];


async function fetchFaculties() {
  const loading = document.getElementById('loading-state');
  try {
    const response = await fetch('faculties.json');
    if (!response.ok) throw new Error('Network error');
    
    
    allFaculties = await response.json();
        
    renderFaculties(allFaculties);
  } catch (error) {
    console.error('ไม่สามารถดึงไฟล์ faculties.json ได้:', error);
    if (loading) {
      loading.innerHTML = '<p style="color: var(--tu-red);">เกิดข้อผิดพลาดในการโหลดข้อมูลอาจารย์</p>';
    }
  }
}


function renderFaculties(faculties) {
  const grid = document.getElementById('faculty-grid');
  const loading = document.getElementById('loading-state');
      
  grid.innerHTML = ''; 
      
  if (faculties.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">ไม่พบรายชื่ออาจารย์ที่ตรงกับคำค้นหา</p>';
    if (loading) loading.style.display = 'none';
    grid.style.display = 'grid';
    
    // ปลดซ่อน <main> ด้วย
    const main = document.querySelector('main');
    if (main) main.style.display = '';
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
              class="faculty-img" data-initials="${initials}"
              style="width: 100%; height: 100%; object-fit: cover; display: block;">
      </div>
      <h2 class="faculty-name-th">${escapeHtml(faculty.name_th)}</h2>
      <p class="faculty-name-en">${escapeHtml(faculty.name_en)}</p>
      <div class="position-badge">${escapeHtml(faculty.academic_position || 'อาจารย์')}</div>
      <a href="profile.html?id=${encodeURIComponent(faculty.faculty_id)}" class="view-profile-btn">ดูประวัติและผลงาน</a>
    `;
    
    const imgEl = card.querySelector('.faculty-img');
    if (imgEl) {
        imgEl.addEventListener('error', function() {
            this.parentNode.innerHTML = this.dataset.initials;
        });
    }
        
    grid.appendChild(card);
  });
      
  if (loading) loading.style.display = 'none';
  grid.style.display = 'grid';
  const main = document.querySelector('main');
  if (main) main.style.display = '';
}


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



document.addEventListener('DOMContentLoaded', () => {
  fetchFaculties();
  const searchInput = document.getElementById('faculty-search');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }
});