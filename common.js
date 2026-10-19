

function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, m => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[m]);
}


const STATUS = {
    Draft:          { label: "ฉบับร่าง" },
    Pending_Review: { label: "รอการตรวจสอบ" },
    Approved:       { label: "อนุมัติแล้ว" },
    Rejected:       { label: "ส่งกลับแก้ไข" }
};

function statusBadge(status) {
    const s = STATUS[status] ? status : "Draft";
    return `<span class="tu-badge tu-badge-${s.toLowerCase()}">${escapeHtml(STATUS[s].label)}</span>`;
}


const CATEGORIES = [
    {
        key: "teaching", en: "Teaching", label: "งานสอน",
        fields: [
            { name: "course_code", label: "รหัสวิชา", type: "text", required: true, placeholder: "เช่น CS213" },
            { name: "course_type", label: "ประเภทวิชา", type: "select", required: true,
              options: ["วิชาบรรยาย", "วิชาปฏิบัติการ", "วิชาบรรยายและปฏิบัติการ"] },
            { name: "credits", label: "หน่วยกิต", type: "number", required: true, min: 0, step: 0.5 },
            { name: "hours", label: "ชั่วโมง", type: "number", required: true, min: 0, step: 1 },
            { name: "teaching_ratio", label: "สัดส่วนการสอน (0-1)", type: "number", required: true, min: 0, max: 1, step: 0.01, default: 1 }
        ],
        summarize: i => ({
            title: `${i.course_code || "-"}: ${i.course_type || "-"}`,
            sub: `${i.credits ?? 0} หน่วยกิต (${i.hours ?? 0} ชม.) · สัดส่วนการสอน ${i.teaching_ratio ?? 1}`
        })
    },
    {
        key: "academic_outputs", en: "Research", label: "งานวิจัย / ผลงานวิชาการ",
        fields: [
            { name: "output_type", label: "ประเภทผลงาน", type: "text", required: true, placeholder: "เช่น บทความวิจัย, แบบบรรยาย" },
            { name: "title", label: "ชื่อผลงาน", type: "text", required: true },
            { name: "participation_percentage", label: "สัดส่วนการมีส่วนร่วม (%)", type: "number", required: true, min: 0, max: 100, step: 1, default: 100 },
            { name: "category", label: "ระดับการตีพิมพ์", type: "text", required: true, placeholder: "เช่น วารสารวิชาการระดับนานาชาติ" }
        ],
        summarize: i => ({
            title: i.title || "-",
            sub: `${i.output_type || "-"} · ${i.category || "-"} · สัดส่วน ${i.participation_percentage ?? 0}%`
        })
    },
    {
        key: "services_and_admin", en: "Academic Service", label: "บริการวิชาการและงานบริหาร",
        fields: [
            { name: "service_category", label: "หมวดหมู่งานบริการ", type: "text", required: true, placeholder: "เช่น บริการวิชาการแก่สังคม" },
            { name: "role", label: "ตำแหน่ง / หน้าที่", type: "text", required: true },
            { name: "detail", label: "รายละเอียดงาน", type: "textarea" }
        ],
        summarize: i => ({
            title: i.service_category || "-",
            sub: `บทบาท: ${i.role || "-"}${i.detail ? " · " + i.detail : ""}`
        })
    },
    {
        key: "student_advising", en: "Professional Development", label: "พัฒนาวิชาชีพ / ดูแลนักศึกษา",
        fields: [
            { name: "advising_type", label: "ประเภท", type: "text", required: true, placeholder: "เช่น วิทยานิพนธ์, ซีเนียร์โปรเจกต์" },
            { name: "course_code", label: "รหัสวิชา (ถ้ามี)", type: "text", placeholder: "ไม่มีให้ใส่ -" },
            { name: "student_or_project_detail", label: "ชื่อนักศึกษา / โครงงาน / จำนวนเรื่อง", type: "text", required: true },
            { name: "role", label: "บทบาท", type: "text", required: true, placeholder: "เช่น ที่ปรึกษาหลัก" },
            { name: "count_or_credits", label: "จำนวน / หน่วยกิต", type: "number", required: true, min: 0, step: 0.5, default: 1 }
        ],
        summarize: i => ({
            title: `${i.advising_type || "-"}${i.course_code && i.course_code !== "-" ? " (" + i.course_code + ")" : ""}`,
            sub: `${i.student_or_project_detail || "-"} · บทบาท: ${i.role || "-"} · จำนวน/หน่วยกิต: ${i.count_or_credits ?? 0}`
        })
    }
];

function getCategory(key) {
    return CATEGORIES.find(c => c.key === key);
}


function makeTermId(year, semester) { return `${Number(year)}#${Number(semester)}`; }

function evaluationPeriod(year, semester) {
    year = Number(year);
    return Number(semester) === 1
        ? `1 กรกฎาคม ${year} - 31 ธันวาคม ${year}`
        : `1 มกราคม ${year + 1} - 30 มิถุนายน ${year + 1}`;
}

function emptyWorkloads() {
    return Object.fromEntries(CATEGORIES.map(c => [c.key, []]));
}

function currentBuddhistYear() { return new Date().getFullYear() + 543; }

function sortTermsDesc(a, b) {
    return Number(b.academic_year) - Number(a.academic_year) || Number(b.semester) - Number(a.semester);
}

function countItems(record) {
    return CATEGORIES.reduce((n, c) => n + ((record.workloads || {})[c.key] || []).length, 0);
}

function countEvidence(record) {
    return CATEGORIES.reduce((n, c) =>
        n + (((record.workloads || {})[c.key] || []).filter(i => i.evidence_key).length), 0);
}

function formatDateTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return isNaN(d) ? "-" : d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}


function toast(message, type = "info") {
    let box = document.getElementById("toast-box");
    if (!box) {
        box = document.createElement("div");
        box.id = "toast-box";
        box.setAttribute("role", "status");
        box.setAttribute("aria-live", "polite");
        document.body.appendChild(box);
    }
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => el.remove(), type === "error" ? 6000 : 3500);
}

function openModal(el) { el?.classList.add("is-open"); }
function closeModal(el) { el?.classList.remove("is-open"); }

document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.querySelectorAll(".tu-modal.is-open").forEach(closeModal);
});
document.addEventListener("click", e => {
    if (e.target.classList?.contains("tu-modal")) closeModal(e.target);          // คลิกพื้นหลัง
    if (e.target.closest?.("[data-close-modal]")) closeModal(e.target.closest(".tu-modal"));
});