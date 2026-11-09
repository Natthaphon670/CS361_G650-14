

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
            { name: "participation_percentage", label: "สัดส่วนการมีส่วนร่วม (%)", type: "number", required: true, min: 0, max: 100, step: 1, default: 100 },
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