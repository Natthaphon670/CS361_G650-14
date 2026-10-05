import { loadWorkloadRepository } from './workload-repository.js';

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const facultyId = urlParams.get('id') || 'prof_001';

  const loadingState = document.getElementById('loading-state');
  const mainContent = document.getElementById('main-content');

  let currentFaculty = null;
  let facultyOutputs = [];

  // ใช้ Workload Repository Module (Issue #3) เป็นตัวกลางสำหรับข้อมูลภาระงาน
  Promise.all([
    fetch('faculties.json').then(res => {
      if (!res.ok) throw new Error('Cannot load faculties.json');
      return res.json();
    }),
    loadWorkloadRepository()
  ])
  .then(([faculties, workloadRepository]) => {
    currentFaculty = faculties.find(f => f.faculty_id === facultyId);
    if (!currentFaculty) {
      loadingState.innerHTML = `<p style="color: var(--tu-red);">ไม่พบข้อมูลอาจารย์รหัส: ${escapeHtml(facultyId)}</p>`;
      return;
    }

    // Repository เป็นผู้จัดการการกรองตาม faculty_id
    facultyOutputs = workloadRepository.getByFaculty(facultyId);

    renderFacultyBasic(currentFaculty);
    initRepositoryEvents();
    renderRepositoryOutputs();
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
    
    // รูปภาพ Avatar จาก S3 พร้อม Fallback เป็นตัวอักษรย่อ
    const avatarContainer = document.getElementById('f-avatar');
    const initials = f.name_en ? f.name_en.split(' ').pop().substring(0, 2).toUpperCase() : 'TU';
    const profNumber = f.faculty_id ? f.faculty_id.replace('prof_', '') : '001';
    const ext = profNumber === '022' ? '.png' : '.jpg';
    const imgPath = `https://faculty-output-and-workload-management-system-g14.s3.us-east-1.amazonaws.com/profile_image/prof_img_${profNumber}${ext}`;

    avatarContainer.innerHTML = `<img src="${imgPath}" alt="${escapeHtml(f.name_th)}" 
      style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" 
      onerror="this.onerror=null; this.parentNode.innerHTML='${initials}';">`;

    loadingState.style.display = 'none';
    mainContent.style.display = 'grid';

    // ข้อมูลติดต่อ
    const contact = f.contact_information || {};
    setTextOrHide('f-office', 'item-office', contact.office);
    setTextOrHide('f-phone', 'item-phone', contact.phone);
    setTextOrHide('f-email', 'item-email', contact.email);

    // ลิงก์ภายนอก
    const profiles = f.external_profiles || {};
    const scholarBtn = document.getElementById('link-scholar');
    const semanticBtn = document.getElementById('link-semantic');
    const rgBtn = document.getElementById('link-rg');

    if (profiles.google_scholar_url && profiles.google_scholar_url !== '-') {
      scholarBtn.href = profiles.google_scholar_url;
      scholarBtn.style.display = 'inline-flex';
    }
    if (semanticBtn && profiles.semanticscholar_url && profiles.semanticscholar_url !== '-') {
      semanticBtn.href = profiles.semanticscholar_url;
      semanticBtn.style.display = 'inline-flex';
    }
    if (profiles.researchgate_url && profiles.researchgate_url !== '-') {
      rgBtn.href = profiles.researchgate_url;
      rgBtn.style.display = 'inline-flex';
    }

    renderSections(f);
  }

  function renderSections(f) {
    // ความสนใจงานวิจัย
    const interestsContainer = document.getElementById('f-interests');
    if (f.research_interests && f.research_interests.length > 0 && f.research_interests[0] !== '-') {
      interestsContainer.innerHTML = f.research_interests
        .map(item => `<span class="chip">${escapeHtml(item)}</span>`)
        .join('');
    } else {
      document.getElementById('block-interests').style.display = 'none';
    }

    // ความเชี่ยวชาญ
    const expContainer = document.getElementById('f-expertise-list');
    if (f.expertise && f.expertise.length > 0 && f.expertise[0] !== '-') {
      expContainer.innerHTML = f.expertise
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
    } else {
      document.getElementById('block-expertise').style.display = 'none';
    }

    // ประวัติการศึกษา
    const eduContainer = document.getElementById('f-education-list');
    if (f.education && f.education.length > 0) {
      eduContainer.innerHTML = f.education
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
    } else {
      document.getElementById('block-education').style.display = 'none';
    }
  }

  
  function initRepositoryEvents() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    const termSelect = document.getElementById('select-term');
    const searchInput = document.getElementById('repo-search');

    if (termSelect) termSelect.addEventListener('change', renderRepositoryOutputs);
    if (searchInput) searchInput.addEventListener('input', renderRepositoryOutputs);
  }

  function renderRepositoryOutputs() {
    const termSelect = document.getElementById('select-term');
    const searchInput = document.getElementById('repo-search');

    const selectedTerm = termSelect ? termSelect.value : 'all';
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    // กรองตามภาค/ปีการศึกษา
    let filteredRecords = facultyOutputs;
    if (selectedTerm !== 'all') {
      const [sem, year] = selectedTerm.split('/');
      filteredRecords = facultyOutputs.filter(o => 
        String(o.semester) === String(sem) && String(o.academic_year) === String(year)
      );
    }

    let teachingList = [];
    let advisingList = [];
    let researchList = [];
    let servicesList = [];

    // ดึงข้อมูลจาก faculties-workloads-mock.json
    filteredRecords.forEach(rec => {
      const termLabel = `${rec.semester}/${rec.academic_year}`;
      const wl = rec.workloads || {};

      (wl.teaching || []).forEach(item => teachingList.push({ ...item, term: termLabel }));
      (wl.student_advising || []).forEach(item => advisingList.push({ ...item, term: termLabel }));
      (wl.services_and_admin || []).forEach(item => servicesList.push({ ...item, term: termLabel }));

      // หมวดงานวิจัย/วิชาการ: แม็ปตาม faculties-workloads-mock.json
      (wl.academic_outputs || []).forEach(item => {
        researchList.push({
          title: item.title,
          type: item.output_type || 'บทความวิจัย',
          category: item.category || 'งานวิชาการ',
          percent: item.participation_percentage,
          term: termLabel,
          source: 'แบบรายงานภาระงาน',
          citation_count: 0,
          url: ''
        });
      });
    });

    // แสดงงานวิจัยจาก faculties.json (Google Scholar / Semantic Scholar) เสริมเมื่อเลือกดูทั้งหมด
    if (selectedTerm === 'all' && currentFaculty && currentFaculty.publications) {
      currentFaculty.publications.forEach(pub => {
        researchList.push({
          title: pub.title,
          type: pub.venue && pub.venue !== 'N/A' ? pub.venue : 'งานวิจัยที่ได้รับการตีพิมพ์',
          category: pub.source || 'ฐานข้อมูลวิชาการ',
          term: pub.year ? String(pub.year) : 'ผลงานตีพิมพ์',
          source: pub.source || 'Scholar',
          citation_count: pub.citation_count || 0,
          url: pub.url || ''
        });
      });
    }

    // หมวดงานสอน
    const tContainer = document.getElementById('list-teaching');
    if (tContainer) {
      const filteredT = teachingList.filter(i => (i.course_code + (i.course_type || '') + (i.detail || '')).toLowerCase().includes(query));
      tContainer.innerHTML = filteredT.length ? filteredT.map(i => `
        <li class="repo-card-item">
          <div class="repo-badge-row">
            <span class="badge-term">${escapeHtml(i.term)}</span>
            <span class="badge-credit">${i.credits || 0} หน่วยกิต (${i.hours || 45} ชม.)</span>
          </div>
          <div class="repo-title"><strong>${escapeHtml(i.course_code)}</strong>: ${escapeHtml(i.course_type || 'วิชาบรรยาย')}</div>
          <div class="repo-sub-info">สัดส่วนการสอน: ${i.teaching_ratio || 1}</div>
        </li>
      `).join('') : '<p class="empty-note">ไม่มีข้อมูลในหมวดนี้</p>';
    }

    // หมวดการดูแลนักศึกษา
    const advContainer = document.getElementById('list-advising');
    if (advContainer) {
      const filteredAdv = advisingList.filter(i => ((i.advising_type || '') + (i.student_or_project_detail || '') + (i.role || '')).toLowerCase().includes(query));
      advContainer.innerHTML = filteredAdv.length ? filteredAdv.map(i => `
        <li class="repo-card-item">
          <div class="repo-badge-row">
            <span class="badge-term">${escapeHtml(i.term)}</span>
            <span class="badge-credit">${escapeHtml(i.advising_type || 'การดูแลนักศึกษา')}</span>
          </div>
          <div class="repo-title">${i.course_code && i.course_code !== '-' ? `<strong>${escapeHtml(i.course_code)}</strong> ` : ''}${escapeHtml(i.student_or_project_detail || '-')}</div>
          <div class="repo-sub-info">บทบาท: ${escapeHtml(i.role || 'อาจารย์ที่ปรึกษา')} | จำนวนเรื่อง/หน่วยกิต: ${i.count_or_credits || 1}</div>
        </li>
      `).join('') : '<p class="empty-note">ไม่มีข้อมูลในหมวดนี้</p>';
    }

    // หมวดงานวิจัย/วิชาการ
    const resContainer = document.getElementById('list-research');
    if (resContainer) {
      const filteredRes = researchList.filter(i => 
        ((i.title || '') + (i.type || '') + (i.category || '')).toLowerCase().includes(query)
      );
      resContainer.innerHTML = filteredRes.length ? filteredRes.map(i => `
        <li class="repo-card-item">
          <div class="repo-badge-row">
            <span class="badge-term">${escapeHtml(i.term)}</span>
            <span class="badge-credit">${escapeHtml(i.category)}</span>
            ${i.percent ? `<span class="badge-source">สัดส่วน ${i.percent}%</span>` : ''}
            ${i.citation_count > 0 ? `<span class="badge-source">อ้างอิง ${i.citation_count} ครั้ง</span>` : ''}
          </div>
          <div class="repo-title">${escapeHtml(i.title)}</div>
          <div class="repo-sub-info">ประเภท: ${escapeHtml(i.type)} | แหล่งอ้างอิง: ${escapeHtml(i.source)}</div>
          ${i.url ? `
            <div style="margin-top: 0.5rem;">
              <a href="${escapeHtml(i.url)}" target="_blank" rel="noopener noreferrer" style="color: var(--tu-red); font-size: 0.85rem; font-weight: 600; text-decoration: none;">
                เปิดดูผลงานวิจัย ↗
              </a>
            </div>` : ''}
        </li>
      `).join('') : '<p class="empty-note">ไม่มีข้อมูลในหมวดนี้</p>';
    }

    // หมวดงานบริการและบริหาร
    const srvContainer = document.getElementById('list-services');
    if (srvContainer) {
      const filteredSrv = servicesList.filter(i => ((i.detail || '') + (i.service_category || '') + (i.role || '')).toLowerCase().includes(query));
      srvContainer.innerHTML = filteredSrv.length ? filteredSrv.map(i => `
        <li class="repo-card-item">
          <div class="repo-badge-row">
            <span class="badge-term">${escapeHtml(i.term)}</span>
            <span class="badge-credit">${escapeHtml(i.service_category || 'งานบริการ/บริหาร')}</span>
          </div>
          <div class="repo-title">${escapeHtml(i.detail || '-')}</div>
          <div class="repo-sub-info">บทบาท/หน้าที่: ${escapeHtml(i.role || '-')}</div>
        </li>
      `).join('') : '<p class="empty-note">ไม่มีข้อมูลในหมวดนี้</p>';
    }
  }

  function setTextOrHide(spanId, wrapperId, val) {
    const wrap = document.getElementById(wrapperId);
    if (!val || val === '-') {
      if (wrap) wrap.style.display = 'none';
    } else {
      const span = document.getElementById(spanId);
      if (span) span.textContent = val;
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, match => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[match]);
  }
});