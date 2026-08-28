document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const facultyId = urlParams.get('id') || 'prof_001';

  const loadingState = document.getElementById('loading-state');
  const mainContent = document.getElementById('main-content');

  fetch('faculties.json')
    .then(res => {
      if (!res.ok) throw new Error('Network error');
      return res.json();
    })
    .then(data => {
      const faculty = data.find(f => f.faculty_id === facultyId);
      if (!faculty) {
        loadingState.innerHTML = `<p style="color: var(--tu-red);">ไม่พบข้อมูลอาจารย์รหัส: ${escapeHtml(facultyId)}</p>`;
        return;
      }
      renderFacultyBasic(faculty);
    })
    .catch(err => {
      console.error(err);
      loadingState.innerHTML = `<p style="color: var(--tu-red);">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>`;
    });

  function renderFacultyBasic(f) {
    document.title = `${f.name_th} | มหาวิทยาลัยธรรมศาสตร์`;
    document.getElementById('f-name-th').textContent = f.name_th || '-';
    document.getElementById('f-name-en').textContent = f.name_en || '-';
    document.getElementById('f-position').textContent = f.academic_position || 'อาจารย์';
    
    const initials = f.name_en ? f.name_en.split(' ').pop().substring(0, 2).toUpperCase() : 'TU';
    document.getElementById('f-avatar').textContent = initials;

    loadingState.style.display = 'none';
    mainContent.style.display = 'grid';
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, match => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[match]);
  }
});