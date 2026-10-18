// dashboard.js - ระบบตรวจสอบภาระงานสาขาวิชา (Staff / Admin Dashboard)
document.addEventListener("DOMContentLoaded", async () => {
    // ตรวจสอบสิทธิ์เฉพาะ Staff หรือ Admin เท่านั้น
    if (!Auth.requireAuth(["Staff", "Admin"])) return;
    await renderTable();

    // ดักจับเมื่อผู้ใช้เปลี่ยน Dropdown ให้ตารางอัปเดตค้นหาทันทีโดยไม่ต้องรอกดปุ่ม
    document.getElementById("filter-status")?.addEventListener("change", renderTable);
    document.getElementById("filter-category")?.addEventListener("change", renderTable);
});

const FACULTY_NAMES = {
    "prof_001": "ผศ.ดร.ลัมพาพรรณ พันธ์ชูจิตร์",
    "prof_img_001": "ผศ.ดร.ลัมพาพรรณ พันธ์ชูจิตร์",
    "prof_002": "ผศ.ดร.ประภาพร รัตนธำรง",
    "prof_img_002": "ผศ.ดร.ประภาพร รัตนธำรง",
    "prof_003": "ผศ.ดร.ทรงศักดิ์ รองวิริยะพานิช",
    "prof_img_003": "ผศ.ดร.ทรงศักดิ์ รองวิริยะพานิช"
};

// ดึงข้อมูล Workloads จาก sessionStorage หรือโหลดไฟล์ Mock หากยังไม่มี
async function getWorkloads() {
    let stored = sessionStorage.getItem("mock_workloads");
    if (!stored || stored === "[]") {
        try {
            const res = await fetch("faculties-workloads-mock.json");
            const data = await res.json();
            sessionStorage.setItem("mock_workloads", JSON.stringify(data));
            return data;
        } catch (e) {
            return [];
        }
    }
    return JSON.parse(stored);
}

// ปรับโครงสร้างข้อมูลให้อ่านค่าได้แม่นยำ 100% ไม่หลุดตัวกรอง
function normalizeItem(item) {
    const id = item.id || item.workload_id || ("wl_" + Math.random().toString(36).substr(2, 9));
    
    // แปลงสถานะให้เป็นมาตรฐาน
    let rawStatus = item.workflow_status || item.status || "Draft";
    let status = "Draft";
    const sLower = String(rawStatus).toLowerCase().replace(/[\s_-]+/g, "");
    if (sLower === "approved") status = "Approved";
    else if (sLower.includes("pending")) status = "Pending_Review";
    else if (sLower.includes("reject")) status = "Rejected";

    // แปลงหมวดหมู่งานและชื่อวิชา (รองรับทั้ง Array เดิม และฟิลด์ใหม่)
    let cat = item.category || item.workload_type || item.type || "";
    let title = item.title || item.title_th || item.course_name || item.course_name_th || item.name || "";
    let desc = item.description || item.detail || item.course_id || "-";

    if (Array.isArray(item.teaching) && item.teaching.length > 0) {
        cat = cat || "Teaching";
        const t = item.teaching[0];
        title = title || t.course_name || t.course_name_th || t.name || (t.course_id ? `วิชา ${t.course_id}` : "");
        desc = (desc === "-") ? (t.course_id ? `รหัสวิชา: ${t.course_id}` : "-") : desc;
    } else if (Array.isArray(item.research) && item.research.length > 0) {
        cat = cat || "Research";
        const r = item.research[0];
        title = title || r.title || r.title_th || r.name;
    } else if (Array.isArray(item.academic_service) && item.academic_service.length > 0) {
        cat = cat || "Academic Service";
        title = title || item.academic_service[0].title || item.academic_service[0].name;
    } else if (Array.isArray(item.professional_development) && item.professional_development.length > 0) {
        cat = cat || "Professional Development";
        title = title || item.professional_development[0].title || item.professional_development[0].name;
    }

    // จัดกลุ่มหมวดหมู่เป็น 4 กลุ่มหลัก
    const cLower = String(cat).toLowerCase();
    let normalizedCat = "Teaching";
    if (cLower.includes("teach") || cLower.includes("สอน")) normalizedCat = "Teaching";
    else if (cLower.includes("research") || cLower.includes("วิจัย")) normalizedCat = "Research";
    else if (cLower.includes("service") || cLower.includes("บริการ")) normalizedCat = "Academic Service";
    else if (cLower.includes("develop") || cLower.includes("พัฒนา")) normalizedCat = "Professional Development";
    else if (cat) normalizedCat = cat;

    return {
        ...item,
        id: String(id),
        faculty_id: item.faculty_id || "prof_003",
        category: normalizedCat,
        title: title || "ภาระงานวิชาการ",
        description: desc,
        workflow_status: status,
        evidence_name: item.evidence_name || (item.evidence_key ? item.evidence_key.split('/').pop() : null),
        evidence_data: item.evidence_data || null
    };
}

function updateStats(items) {
    document.getElementById("stat-pending").textContent = items.filter(x => x.workflow_status === "Pending_Review").length;
    document.getElementById("stat-approved").textContent = items.filter(x => x.workflow_status === "Approved").length;
    document.getElementById("stat-rejected").textContent = items.filter(x => x.workflow_status === "Rejected").length;
}

// เปิดดูไฟล์หลักฐานในแท็บใหม่
window.viewEvidence = function(id) {
    const rawList = JSON.parse(sessionStorage.getItem("mock_workloads") || "[]");
    const item = rawList.map(normalizeItem).find(w => w.id === String(id));
    if (!item) return;

    if (item.evidence_data) {
        const win = window.open();
        win.document.write(`
            <html>
                <head><title>${item.evidence_name || "ไฟล์หลักฐาน"}</title></head>
                <body style="margin:0; height:100vh;">
                    <iframe src="${item.evidence_data}" style="border:none; width:100%; height:100%;" allowfullscreen></iframe>
                </body>
            </html>
        `);
    } else {
        alert("ไฟล์หลักฐาน: " + (item.evidence_name || "ไม่มีชื่อไฟล์") + "\n\n(รายการนี้เป็นข้อมูลระบบตั้งต้น จึงไม่มีไฟล์จำลองแนบมา หากต้องการทดสอบดูไฟล์จริง ให้ไปที่หน้า Profile แล้วกดเพิ่มภาระงานพร้อมเลือกแนบไฟล์จากในเครื่องครับ)");
    }
};

window.renderTable = async function() {
    const rawList = await getWorkloads();
    const all = rawList.map(normalizeItem);
    updateStats(all);

    const filterStatus = (document.getElementById("filter-status")?.value || "").trim().toLowerCase();
    const filterCat = (document.getElementById("filter-category")?.value || "").trim().toLowerCase();
    const tbody = document.getElementById("dashboard-tbody");
    if (!tbody) return;

    // กรองข้อมูลแบบ Case-insensitive ไม่ให้หลุด
    const filtered = all.filter(item => {
        let matchStatus = true;
        if (filterStatus) {
            const itemS = item.workflow_status.toLowerCase().replace(/[\s_-]+/g, "");
            const filterS = filterStatus.toLowerCase().replace(/[\s_-]+/g, "");
            matchStatus = (itemS === filterS);
        }

        let matchCat = true;
        if (filterCat) {
            const itemC = item.category.toLowerCase();
            const filterC = filterCat.toLowerCase();
            matchCat = itemC.includes(filterC) || filterC.includes(itemC);
        }

        return matchStatus && matchCat;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:#94a3b8;">ไม่พบรายการภาระงาน</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        const facId = String(item.faculty_id || "").toLowerCase().replace("prof_img_", "prof_");
        const status = item.workflow_status;

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:0.85rem 1rem;"><b>${FACULTY_NAMES[facId] || facId}</b></td>
                <td style="padding:0.85rem 1rem;">
                    <span style="background:#fef2f2; color:#c51a2e; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:600;">
                        ${item.category}
                    </span>
                </td>
                <td style="padding:0.85rem 1rem;">
                    <div><b>${item.title}</b></div>
                    <small style="color:#64748b;">${item.description}</small>
                </td>
                <td style="padding:0.85rem 1rem;">
                    ${item.evidence_name || item.evidence_data ? `
                        <button onclick="window.viewEvidence('${item.id}')" style="background:none; border:none; color:#c51a2e; font-weight:600; cursor:pointer; text-decoration:underline; padding:0;">
                            📎 ${item.evidence_name || "ดูไฟล์แนบ"}
                        </button>
                    ` : '<span style="color:#94a3b8;">-</span>'}
                </td>
                <td style="padding:0.85rem 1rem;">
                    <span style="padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:600;
                        ${status === 'Approved' ? 'background:#dcfce7; color:#15803d;' : 
                          status === 'Pending_Review' ? 'background:#fef3c7; color:#92400e;' : 'background:#fee2e2; color:#b91c1c;'}">
                        ${status}
                    </span>
                </td>
                <td style="padding:0.85rem 1rem; text-align:right;">
                    ${status === 'Pending_Review' ? `
                        <button onclick="window.setStatus('${item.id}', 'Approved')" style="background:#16a34a; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:600;">Approve</button>
                        <button onclick="window.setStatus('${item.id}', 'Rejected')" style="background:#dc2626; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:600;">Reject</button>
                    ` : `
                        <span style="font-size:0.8rem; font-weight:600; color:${status === 'Approved' ? '#16a34a' : '#dc2626'};">
                            ${status === 'Approved' ? '✓ อนุมัติแล้ว' : '✕ ส่งกลับแก้ไข'}
                        </span>
                    `}
                </td>
            </tr>
        `;
    }).join("");
};

window.setStatus = function(id, newStatus) {
    let all = JSON.parse(sessionStorage.getItem("mock_workloads") || "[]");
    const target = all.find(w => String(w.id || w.workload_id) === String(id));
    if (target) {
        target.workflow_status = newStatus;
        sessionStorage.setItem("mock_workloads", JSON.stringify(all));
        window.renderTable();
    }
};