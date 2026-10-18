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

// ============================================================
// Workload Management (แก้ไขปัญหาปุ่มกดไม่ติด + ดึงข้อมูลวิชาจริง)
// ============================================================
const urlParams = new URLSearchParams(window.location.search);
const pageFacultyId = urlParams.get("id") || "prof_003";

// 1. ผูกฟังก์ชันเข้ากับ window ทันที ป้องกันปัญหา type="module"
window.openWorkloadModal = function() {
    let modal = document.getElementById("workload-modal");
    if (!modal) {
        injectWorkloadModal(); // ดักกรณีใน HTML ไม่มี Modal ให้สร้างให้อัตโนมัติ
        modal = document.getElementById("workload-modal");
    }
    modal.style.display = "flex";
};

window.closeWorkloadModal = function() {
    const modal = document.getElementById("workload-modal");
    if (modal) modal.style.display = "none";
};

window.submitForReview = function(id) {
    const all = JSON.parse(sessionStorage.getItem("mock_workloads") || "[]");
    const target = all.find(w => String(w.id || w.workload_id) === String(id));
    if (target) {
        target.workflow_status = "Pending_Review";
        sessionStorage.setItem("mock_workloads", JSON.stringify(all));
        renderWorkloads();
        alert("ส่งภาระงานเพื่อรอการตรวจสอบเรียบร้อยแล้ว");
    }
};

window.removeWorkload = function(id) {
    if (!confirm("ต้องการลบรายการภาระงานนี้หรือไม่?")) return;
    let all = JSON.parse(sessionStorage.getItem("mock_workloads") || "[]");
    all = all.filter(w => String(w.id || w.workload_id) !== String(id));
    sessionStorage.setItem("mock_workloads", JSON.stringify(all));
    renderWorkloads();
};

document.addEventListener("DOMContentLoaded", async () => {
    // ผูก Event Listener กับปุ่มโดยตรง
    const btnAdd = document.getElementById("btn-add-workload");
    if (btnAdd) {
        btnAdd.onclick = window.openWorkloadModal;
        btnAdd.style.display = "inline-flex"; // แสดงปุ่มให้กดบันทึกได้เสมอ
    }

    await renderWorkloads();
    bindFormSubmit();
});

// ดึงข้อมูลวิชาหรือหัวข้อจริง ไม่ให้ขึ้น "ไม่มีชื่อหัวข้อ"
function extractWorkloadDetails(item) {
    let category = item.category || item.workload_type || item.type;
    let title = item.title || item.title_th || item.course_name || item.course_name_th || item.name || item.topic;
    let desc = item.description || item.detail || item.course_id || "-";

    // กรณีข้อมูลซ้อนอยู่ในอาเรย์ teaching, research, academic_service
    if (!title) {
        if (Array.isArray(item.teaching) && item.teaching.length > 0) {
            category = category || "การสอน (Teaching)";
            const t = item.teaching[0];
            title = t.course_name || t.course_name_th || t.name || (t.course_id ? `รายวิชา ${t.course_id}` : null);
            desc = t.course_id ? `รหัสวิชา: ${t.course_id} (${t.credits || 3} หน่วยกิต)` : desc;
        } else if (Array.isArray(item.research) && item.research.length > 0) {
            category = category || "งานวิจัย (Research)";
            const r = item.research[0];
            title = r.title || r.title_th || r.name || r.project_name;
            desc = r.fund || r.journal || desc;
        } else if (Array.isArray(item.academic_service) && item.academic_service.length > 0) {
            category = category || "บริการวิชาการ (Academic Service)";
            title = item.academic_service[0].title || item.academic_service[0].name;
        } else if (Array.isArray(item.professional_development) && item.professional_development.length > 0) {
            category = category || "พัฒนาวิชาชีพ (Professional Development)";
            title = item.professional_development[0].title || item.professional_development[0].name;
        }
    }

    return {
        category: category || "ภาระงาน",
        title: title || "ภาระงานวิชาการประจำปี",
        desc: desc,
        year: item.academic_year || "2568",
        status: item.workflow_status || item.status || "Draft",
        evidence: item.evidence_name || item.evidence_key || null
    };
}

async function getStoredWorkloads() {
    if (!sessionStorage.getItem("mock_workloads") || sessionStorage.getItem("mock_workloads") === "[]") {
        try {
            const res = await fetch("faculties-workloads-mock.json");
            const data = await res.json();
            sessionStorage.setItem("mock_workloads", JSON.stringify(data));
        } catch (e) {
            console.error("Failed to load workloads", e);
        }
    }
    return JSON.parse(sessionStorage.getItem("mock_workloads") || "[]");
}

async function renderWorkloads() {
    const listContainer = document.getElementById("workload-list-container");
    if (!listContainer) return;

    const all = await getStoredWorkloads();
    const targetId = String(pageFacultyId).trim().toLowerCase();

    // กรองภาระงานตาม ID ของอาจารย์หน้านี้
    const myWorkloads = all.filter(w => {
        const itemFacId = String(w.faculty_id || "").trim().toLowerCase();
        return itemFacId === targetId ||
               itemFacId.replace("prof_img_", "prof_") === targetId.replace("prof_img_", "prof_");
    });

    if (myWorkloads.length === 0) {
        listContainer.innerHTML = `<p style="color:#64748b; text-align:center; padding:1.5rem;">ยังไม่มีรายการภาระงาน</p>`;
        return;
    }

    listContainer.innerHTML = myWorkloads.map(item => {
        const info = extractWorkloadDetails(item);
        const itemId = item.id || item.workload_id || ("wl_" + Math.random().toString(36).substr(2, 9));

        return `
            <div class="tu-item-row" style="border:1px solid #e2e8f0; border-radius:8px; padding:1rem 1.25rem; margin-bottom:0.75rem; display:flex; justify-content:space-between; align-items:center; background:#fff;">
                <div>
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
                        <span class="tu-badge" style="background:#fef2f2; color:#c51a2e; border:1px solid #fecaca; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:600;">${info.category}</span>
                        <span style="font-size:0.8rem; color:#64748b;">ปีการศึกษา ${info.year}</span>
                    </div>
                    <h4 style="margin:0 0 0.25rem 0; font-size:1.05rem; color:#1e293b;">${info.title}</h4>
                    <p style="margin:0; font-size:0.85rem; color:#64748b;">${info.desc}</p>
                    ${info.evidence ? `<p style="margin:0.35rem 0 0; font-size:0.8rem; color:#16a34a;">📎 หลักฐาน: ${info.evidence}</p>` : ''}
                </div>

                <div style="display:flex; align-items:center; gap:0.6rem;">
                    <span class="tu-badge tu-badge-${info.status.toLowerCase()}" style="padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:600;">
                        ${info.status}
                    </span>

                    ${info.status === 'Draft' ? `
                        <button class="tu-btn tu-btn-sm" style="background:#d97706; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" onclick="window.submitForReview('${itemId}')">ส่งตรวจ</button>
                        <button class="tu-btn tu-btn-danger tu-btn-sm" style="background:#dc2626; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" onclick="window.removeWorkload('${itemId}')">ลบ</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join("");
}

function bindFormSubmit() {
    const form = document.getElementById("workload-form");
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const file = document.getElementById("wl-file")?.files[0];

        const newItem = {
            id: "wl_" + Date.now(),
            faculty_id: pageFacultyId,
            category: document.getElementById("wl-category").value,
            title: document.getElementById("wl-title").value,
            description: document.getElementById("wl-desc").value,
            academic_year: document.getElementById("wl-year").value,
            semester: document.getElementById("wl-semester").value,
            workflow_status: "Draft",
            evidence_name: file ? file.name : null
        };

        const all = await getStoredWorkloads();
        all.unshift(newItem);
        sessionStorage.setItem("mock_workloads", JSON.stringify(all));

        window.closeWorkloadModal();
        renderWorkloads();
        form.reset();
        alert("บันทึกภาระงานฉบับร่างเรียบร้อยแล้ว");
    };
}

// สคริปต์สำรองฉุกเฉิน: สร้าง Modal ให้อัตโนมัติหากไม่มีอยู่ใน HTML
function injectWorkloadModal() {
    const div = document.createElement("div");
    div.id = "workload-modal";
    div.className = "tu-modal";
    div.style.cssText = "display:none; position:fixed; inset:0; background:rgba(15,23,42,0.6); z-index:9999; justify-content:center; align-items:center;";
    div.innerHTML = `
        <div style="background:#fff; border-radius:10px; width:100%; max-width:500px; padding:1.75rem; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);">
            <h3 style="margin-top:0; font-size:1.15rem; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:0.75rem;">บันทึกรายการภาระงาน</h3>
            <form id="workload-form">
                <div style="margin-bottom:1rem;">
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.35rem;">หมวดหมู่ภาระงาน</label>
                    <select id="wl-category" class="tu-form-control" required style="width:100%; padding:0.5rem;">
                        <option value="Teaching">การสอน (Teaching)</option>
                        <option value="Research">งานวิจัย (Research)</option>
                        <option value="Academic Service">บริการวิชาการ (Academic Service)</option>
                        <option value="Professional Development">พัฒนาวิชาชีพ (Professional Development)</option>
                    </select>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.35rem;">หัวข้อ / ชื่องาน / รหัสวิชา</label>
                    <input type="text" id="wl-title" class="tu-form-control" placeholder="เช่น บรรยายวิชา CS361" required style="width:100%; padding:0.5rem; box-sizing:border-box;">
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.35rem;">รายละเอียดประกอบ</label>
                    <textarea id="wl-desc" class="tu-form-control" rows="3" style="width:100%; padding:0.5rem; box-sizing:border-box;"></textarea>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
                    <div>
                        <label style="display:block; font-size:0.85rem; font-weight:600;">ปีการศึกษา</label>
                        <input type="text" id="wl-year" value="2568" required style="width:100%; padding:0.5rem; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.85rem; font-weight:600;">ภาคการศึกษา</label>
                        <select id="wl-semester" style="width:100%; padding:0.5rem;">
                            <option value="1">ภาคเรียนที่ 1</option>
                            <option value="2">ภาคเรียนที่ 2</option>
                        </select>
                    </div>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="display:block; font-size:0.85rem; font-weight:600;">แนบไฟล์หลักฐาน (PDF/รูปภาพ)</label>
                    <input type="file" id="wl-file" style="width:100%;">
                </div>
                <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.25rem;">
                    <button type="button" class="tu-btn tu-btn-secondary" onclick="window.closeWorkloadModal()" style="padding:6px 12px; cursor:pointer;">ยกเลิก</button>
                    <button type="submit" class="tu-btn" style="background:#c51a2e; color:#fff; border:none; padding:6px 14px; border-radius:4px; cursor:pointer;">บันทึก (Save Draft)</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(div);
    bindFormSubmit();
}