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
            { name: "output_type", label: "ประเภทผลงาน", type: "select", required: true,
              options: ["บทความวิจัย", "วารสารวิชาการ", "หนังสือ/ตำรา"] },
            { name: "title", label: "ชื่อผลงาน", type: "text", required: true },
            { name: "participation_percentage", label: "สัดส่วนการมีส่วนร่วม (%)", type: "number", required: true, min: 0, max: 100, step: 1, default: 100,
              help: "ระบุเปอร์เซ็นต์ส่วนร่วมของคุณในผลงานนี้ ตั้งแต่ 0–100%" },
            { name: "category", label: "ระดับการตีพิมพ์", type: "select", required: true,
              options: ["ระดับนานาชาติ (International)", "ระดับชาติ (National)", "TCI กลุ่ม 1", "TCI กลุ่ม 2"] }
        ],
        summarize: i => ({
            title: i.title || "-",
            sub: `${i.output_type || "-"} · ${i.category || "-"} · สัดส่วน ${i.participation_percentage ?? 0}%`
        })
    },
    {
        key: "services_and_admin", en: "Academic Service", label: "บริการวิชาการและงานบริหาร",
        fields: [
            { name: "service_category", label: "หมวดหมู่งานบริการ", type: "select", required: true,
              options: ["บริการวิชาการแก่สังคม", "งานบริหารภายในภาควิชา", "งานคณะกรรมการระดับคณะ/มหาวิทยาลัย"] },
            { name: "role", label: "ตำแหน่ง / หน้าที่", type: "select", required: true,
              options: ["ประธานกรรมการ", "กรรมการและเลขานุการ", "กรรมการ", "ผู้รับผิดชอบโครงการ"] },
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
            { name: "advising_type", label: "ประเภท", type: "select", required: true,
              options: ["วิทยานิพนธ์ (Thesis)", "สารนิพนธ์ (Thematic Paper)", "โครงงานพิเศษ (Senior Project)", "อาจารย์ที่ปรึกษาประจำชั้นปี"] },
            { name: "course_code", label: "รหัสวิชา (ถ้ามี)", type: "text", placeholder: "ไม่มีให้ใส่ -" },
            { name: "student_or_project_detail", label: "ชื่อนักศึกษา / โครงงาน / จำนวนเรื่อง", type: "text", required: true },
            { name: "role", label: "บทบาท", type: "select", required: true,
              options: ["ที่ปรึกษาหลัก", "ที่ปรึกษาร่วม", "กรรมการสอบคุมโครงงาน"] },
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

// =============================================================================
// กำหนดส่งภาระงาน (Sub-Issue 2.6 / #83) — เวลาไทย UTC+07:00
// =============================================================================
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** 23:59:59 วันศุกร์ของสัปดาห์นี้ตามเวลาไทย (เสาร์/อาทิตย์ = ศุกร์หน้า) — ตรงกับ deadline_config.end_of_friday */
function endOfFridayBkk(now = new Date()) {
    const bkk = new Date(now.getTime() + BKK_OFFSET_MS);              // อ่านค่า UTC* = เวลาไทย
    const daysAhead = (5 - bkk.getUTCDay() + 7) % 7;                    // getUTCDay: อาทิตย์=0, ศุกร์=5
    const friday = Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate() + daysAhead, 23, 59, 59);
    return new Date(friday - BKK_OFFSET_MS);
}

function formatThaiDeadline(iso) {
    const d = new Date(iso);
    const day = d.toLocaleDateString("th-TH", { weekday: "long", timeZone: "Asia/Bangkok" });
    const date = d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" });
    const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
    return `${day}ที่ ${date} เวลา ${time} น.`;
}

/**
 * สรุปสถานะกำหนดส่งจากผล GET /settings/deadline
 * level: "none" | "info" (เหลือ > 3 วัน) | "warn" (≤ 3 วัน) | "urgent" (≤ 24 ชม.) | "locked"
 * คำนวณเวลาที่เหลือจาก server_time เพื่อไม่ให้นาฬิกาเครื่องผู้ใช้ที่ตั้งผิดทำให้ปุ่มเปิด/ปิดผิด
 */
function deadlineState(info, clientNow = Date.now()) {
    if (!info || !info.deadline) return { level: "none", locked: false, msLeft: Infinity };
    const skew = info.server_time ? new Date(info.server_time).getTime() - (info._fetched_at ?? clientNow) : 0;
    const msLeft = new Date(info.deadline).getTime() - (clientNow + skew);
    const locked = !!info.is_locked || msLeft <= 0;
    const DAY = 86400000;
    const level = locked ? "locked" : msLeft <= DAY ? "urgent" : msLeft <= 3 * DAY ? "warn" : "info";
    return { level, locked, msLeft, deadline: info.deadline };
}

function formatTimeLeft(ms) {
    const mins = Math.floor(ms / 60000);
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    if (d > 0) return `${d} วัน${h ? ` ${h} ชั่วโมง` : ""}`;
    if (h > 0) return `${h} ชั่วโมง ${m} นาที`;
    return `${Math.max(m, 1)} นาที`;
}

/** แสดงแถบประกาศกำหนดส่งใน element ที่ระบุ คืนค่า state ไว้ใช้ล็อกปุ่ม */
function renderDeadlineBanner(el, info, { staffView = false } = {}) {
    const st = deadlineState(info);
    if (!el) return st;
    if (st.level === "none") { el.innerHTML = ""; return st; }
    const when = formatThaiDeadline(st.deadline);
    let cls, text;
    if (st.locked) {
        cls = "deadline-banner deadline-locked";
        text = staffView
            ? `⛔ ปิดรับการส่งภาระงานแล้ว (หมดเขต${when}) — อาจารย์จะแก้ไข/ส่งตรวจไม่ได้จนกว่าจะขยายเวลา`
            : `⛔ หมดเขตการส่ง/แก้ไขภาระงานแล้ว (สิ้นสุด${when}) หากต้องการแก้ไขกรุณาติดต่อเจ้าหน้าที่`;
    } else {
        // ตาม #83: สีเหลือง = ยังเปิดรับ, สีแดง = เหลือไม่เกิน 24 ชม.
        cls = `deadline-banner deadline-${st.level === "urgent" ? "urgent" : "warn"}`;
        text = `⏰ เหลือเวลาส่งภาระงานอีก ${formatTimeLeft(st.msLeft)} (สิ้นสุด${when})`;
    }
    el.innerHTML = `<div class="${cls}" role="status">${escapeHtml(text)}</div>`;
    return st;
}

/** โหลดกำหนดส่ง (ล้มเหลวได้โดยไม่ทำให้หน้าเว็บพัง — backend ยังบังคับใช้กำหนดส่งเสมอ) */
async function fetchDeadline() {
    try {
        const info = await Api.getDeadline();
        return info ? { ...info, _fetched_at: Date.now() } : null;
    } catch (e) {
        console.warn("โหลดกำหนดส่งไม่สำเร็จ", e);
        return null;
    }
}