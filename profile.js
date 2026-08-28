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

    // Contact Information
    const contact = f.contact_information || {};
    setTextOrHide('f-office', 'item-office', contact.office);
    setTextOrHide('f-phone', 'item-phone', contact.phone);
    setTextOrHide('f-email', 'item-email', contact.email);

    // External Links
    const profiles = f.external_profiles || {};
    const scholarBtn = document.getElementById('link-scholar');
    const rgBtn = document.getElementById('link-rg');

    if (profiles.google_scholar_url && profiles.google_scholar_url !== '-') {
      scholarBtn.href = profiles.google_scholar_url;
      scholarBtn.style.display = 'inline-flex';
    }
    if (profiles.researchgate_url && profiles.researchgate_url !== '-') {
      rgBtn.href = profiles.researchgate_url;
      rgBtn.style.display = 'inline-flex';
    }

    renderSections(f);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, match => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[match]);
  }

  function renderSections(f) {
  // Interests
    const interestsContainer = document.getElementById('f-interests');
    if (f.research_interests && f.research_interests.length > 0 && f.research_interests[0] !== '-') {
      interestsContainer.innerHTML = f.research_interests
        .map(item => `<span class="chip">${escapeHtml(item)}</span>`)
        .join('');
    } else {
      document.getElementById('block-interests').style.display = 'none';
    }

    // Expertise
    const expContainer = document.getElementById('f-expertise-list');
    if (f.expertise && f.expertise.length > 0 && f.expertise[0] !== '-') {
      expContainer.innerHTML = f.expertise
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
    } else {
      document.getElementById('block-expertise').style.display = 'none';
    }

    // Education
    const eduContainer = document.getElementById('f-education-list');
    if (f.education && f.education.length > 0) {
      eduContainer.innerHTML = f.education
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
    } else {
      document.getElementById('block-education').style.display = 'none';
    }

    // Publications
    const pubContainer = document.getElementById('f-publications-list');
    const totalPub = f.total_publications || (f.publications ? f.publications.length : 0);
    document.getElementById('f-pub-count').textContent = `${totalPub} ผลงาน`;

    if (f.publications && f.publications.length > 0) {
      pubContainer.innerHTML = f.publications.map(pub => `
        <li class="pub-item">
          <div class="pub-badge-row">
            <span class="badge-year">${pub.year ? pub.year : 'N/A'}</span>
            ${pub.citation_count > 0 ? `<span class="badge-citation">การอ้างอิง: ${pub.citation_count} ครั้ง</span>` : ''}
          </div>
          <div class="pub-title">${escapeHtml(pub.title)}</div>
          ${pub.url ? `
            <a href="${escapeHtml(pub.url)}" target="_blank" rel="noopener noreferrer" class="pub-link">
              ดูรายละเอียดผลงาน
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>` : ''}
        </li>
      `).join('');
    } else {
      pubContainer.innerHTML = '<li style="color: var(--text-muted); font-size: 0.9rem;">ยังไม่มีข้อมูลผลงานที่เผยแพร่</li>';
    }
  }

  function setTextOrHide(spanId, wrapperId, val) {
    if (!val || val === '-') {
      document.getElementById(wrapperId).style.display = 'none';
    } else {
      document.getElementById(spanId).textContent = val;
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, match => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[match]);
  }
});