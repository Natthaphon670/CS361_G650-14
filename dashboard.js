(() => {
    const $ = id => document.getElementById(id);

    let names = {};            
    let scoped = [];           
    let rows = [];             
    let openRecord = null;     
    let yearsLoaded = false;

    document.addEventListener("DOMContentLoaded", async () => {
        // ตรวจสอบสิทธิ์ผ่าน Auth.guard ถ้าไม่ผ่านจะถูกเตะออกทันทีโดยไม่แสดงหน้า Dashboard ค้าง
        if (!(await Auth.guard(["Staff", "Admin"]))) return;   
        
        try {
            const faculties = await (await fetch("faculties.json")).json();
            names = Object.fromEntries(faculties.map(f => [f.faculty_id, { th: f.name_th, en: f.name_en || "" }]));
        } catch { /* ใช้ faculty_id แทนชื่อ */ }

        ["filter-year", "filter-semester", "filter-status"].forEach(id => $(id).addEventListener("change", load));
        let t;
        $("filter-search").addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 150); });
        $("filter-form").addEventListener("submit", e => e.preventDefault());
        $("btn-reset").addEventListener("click", () => {
            $("filter-year").value = ""; $("filter-semester").value = ""; $("filter-status").value = ""; $("filter-search").value = "";
            load();
        });
        $("btn-export").addEventListener("click", exportCsv);
        $("dashboard-tbody").addEventListener("click", onRowClick);
        $("btn-modal-approve").addEventListener("click", () => review(openRecord, "Approved"));
        $("btn-modal-reject").addEventListener("click", () => review(openRecord, "Rejected"));
        $("detail-body").addEventListener("click", e => {
            const b = e.target.closest("[data-evidence]");
            if (b) Api.openEvidence(b.dataset.evidence);
        });

        await load();

        // โหลดเสร็จและผ่านการตรวจสอบสิทธิ์แล้ว ค่อยเปิดแสดงผลหน้า Dashboard และซ่อน Loading
        $("loading-screen")?.remove();
        const mainEl = $("app-main");
        if (mainEl) mainEl.style.display = "block";
    });

    const nameOf = id => names[id]?.th || id;
    const keyOf = r => `${r.faculty_id}|${r.term_id}`;
    const findRec = k => [...rows, ...scoped].find(r => keyOf(r) === k);
    const notDraft = r => r.workflow_status !== "Draft";   

    async function load() {
        const year = $("filter-year").value;
        const semester = $("filter-semester").value;
        const status = $("filter-status").value;

        $("dash-error").innerHTML = "";
        $("dashboard-tbody").innerHTML = `<tr><td colspan="7" class="empty-cell">กำลังโหลด...</td></tr>`;
        try {
            const rawData = (await Api.listWorkloads({ academic_year: year, semester: semester })).filter(notDraft);

            scoped = rawData.filter(r =>
                (!year || String(r.academic_year) === String(year)) &&
                (!semester || String(r.semester) === String(semester))
            );

            rows = status
                ? scoped.filter(r => r.workflow_status === status)
                : scoped;

            if (!yearsLoaded) populateYears();
        } catch (e) {
            scoped = []; rows = [];
            $("dash-error").innerHTML = `<div class="notice notice-error">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
        }
        render();
    }

    function populateYears() {
        const years = [...new Set(scoped.map(r => Number(r.academic_year)))].sort((a, b) => b - a);
        $("filter-year").innerHTML = `<option value="">ทุกปี</option>` + years.map(y => `<option value="${y}">${y}</option>`).join("");
        yearsLoaded = true;
    }

    function visibleRows() {
        const q = $("filter-search").value.toLowerCase().trim();
        if (!q) return rows;
        return rows.filter(r => {
            const n = names[r.faculty_id];
            return `${n?.th || ""} ${n?.en || ""} ${r.faculty_id}`.toLowerCase().includes(q);
        });
    }

    function render() {
        const list = visibleRows().slice().sort((a, b) =>
            (a.workflow_status === "Pending_Review" ? 0 : 1) - (b.workflow_status === "Pending_Review" ? 0 : 1) ||
            sortTermsDesc(a, b) || a.faculty_id.localeCompare(b.faculty_id));

        const count = s => scoped.filter(r => r.workflow_status === s).length;
        $("stat-pending").textContent = count("Pending_Review");
        $("stat-approved").textContent = count("Approved");
        $("stat-rejected").textContent = count("Rejected");
        renderCharts(list);

        $("result-count").textContent = `แสดง ${list.length} จาก ${rows.length} รายการ`;
        if (!list.length) {
            $("dashboard-tbody").innerHTML = `<tr><td colspan="7" class="empty-cell">ไม่พบรายการภาระงานตามเงื่อนไขที่เลือก</td></tr>`;
            return;
        }
        $("dashboard-tbody").innerHTML = list.map(r => {
            const chips = CATEGORIES.map(c => {
                const n = (r.workloads?.[c.key] || []).length;
                return n ? `<span class="chip-sm" title="${escapeHtml(c.label)}">${escapeHtml(c.en.split(" ")[0])} ${n}</span>` : "";
            }).join("");
            const k = escapeHtml(keyOf(r));
            const pending = r.workflow_status === "Pending_Review";
            return `<tr>
                <td><b>${escapeHtml(nameOf(r.faculty_id))}</b><br><small class="muted-text">${escapeHtml(r.faculty_id)}</small></td>
                <td>${r.semester}/${r.academic_year}</td>
                <td><div class="chip-row">${chips || '<span class="muted-text">-</span>'}</div></td>
                <td>${countEvidence(r) ? `📎 ${countEvidence(r)} ไฟล์` : '<span class="muted-text">-</span>'}</td>
                <td>${statusBadge(r.workflow_status)}</td>
                <td><small>${escapeHtml(formatDateTime(r.updated_at))}</small></td>
                <td class="td-right">
                    <button type="button" class="tu-btn tu-btn-secondary tu-btn-sm" data-act="detail" data-key="${k}">ดูรายละเอียด</button>
                    ${pending ? `
                        <button type="button" class="tu-btn tu-btn-success tu-btn-sm" data-act="approve" data-key="${k}">Approve</button>
                        <button type="button" class="tu-btn tu-btn-danger tu-btn-sm" data-act="reject" data-key="${k}">Reject</button>` : ""}
                </td>
            </tr>`;
        }).join("");
    }

    function bar(label, value, max, cls) {
        const pct = max ? Math.round((value / max) * 100) : 0;
        return `<div class="bar-row"><span class="bar-label">${escapeHtml(label)}</span>
            <span class="bar-track"><span class="bar-fill ${cls}" style="width:${pct}%"></span></span>
            <span class="bar-value">${value}</span></div>`;
    }

    function renderCharts(list) {
        const st = ["Pending_Review", "Approved", "Rejected"];
        const sv = st.map(s => scoped.filter(r => r.workflow_status === s).length);
        const smax = Math.max(1, ...sv);
        $("chart-status").innerHTML = st.map((s, i) => bar(STATUS[s].label, sv[i], smax, `fill-${s.toLowerCase()}`)).join("");

        const cv = CATEGORIES.map(c => list.reduce((n, r) => n + ((r.workloads?.[c.key]) || []).length, 0));
        const cmax = Math.max(1, ...cv);
        $("chart-category").innerHTML = CATEGORIES.map((c, i) => bar(c.label, cv[i], cmax, "fill-cat")).join("");
    }

    function onRowClick(e) {
        const b = e.target.closest("[data-act]");
        if (!b) return;
        const rec = findRec(b.dataset.key);
        if (!rec) return;
        if (b.dataset.act === "detail") showDetail(rec);
        if (b.dataset.act === "approve") review(rec, "Approved");
        if (b.dataset.act === "reject") { showDetail(rec); $("reject-comment").focus(); }
    }

    function showDetail(rec) {
        openRecord = rec;
        $("detail-title").textContent = nameOf(rec.faculty_id);
        $("detail-meta").innerHTML = `ภาค ${rec.semester}/${rec.academic_year} · ${escapeHtml(rec.evaluation_period || "")} · ${statusBadge(rec.workflow_status)}`;

        let html = "";
        if (rec.workflow_status === "Rejected" && rec.review_comment)
            html += `<div class="notice notice-error"><b>เหตุผลที่ส่งกลับ:</b> ${escapeHtml(rec.review_comment)}</div>`;
        html += CATEGORIES.map(c => {
            const items = rec.workloads?.[c.key] || [];
            return `<section class="detail-cat"><h4>${escapeHtml(c.label)} <small>(${escapeHtml(c.en)}) · ${items.length} รายการ</small></h4>
                ${items.length ? `<ul class="detail-list">${items.map(it => {
                    const s = c.summarize(it);
                    return `<li><div class="repo-title">${escapeHtml(s.title)}</div>
                        <div class="repo-sub-info">${escapeHtml(s.sub)}</div>
                        ${it.evidence_key ? `<button type="button" class="link-btn" data-evidence="${escapeHtml(it.evidence_key)}">📎 ${escapeHtml(it.evidence_name || "ดูไฟล์หลักฐาน")}</button>` : `<span class="muted-text">ไม่มีไฟล์แนบ</span>`}</li>`;
                }).join("")}</ul>` : `<p class="muted-text">ไม่มีรายการ</p>`}</section>`;
        }).join("");
        $("detail-body").innerHTML = html;

        $("detail-review").hidden = !(Auth.isStaffOrAdmin() && rec.workflow_status === "Pending_Review");
        $("reject-comment").value = "";
        $("review-error").hidden = true;
        openModal($("detail-modal"));
    }

    async function review(rec, decision) {
        if (!rec || !Auth.isStaffOrAdmin()) return;
        const inModal = $("detail-modal").classList.contains("is-open");
        const comment = inModal ? $("reject-comment").value.trim() : "";
        if (decision === "Rejected" && !comment) {
            if (!inModal) { showDetail(rec); }
            $("review-error").textContent = "กรุณาระบุเหตุผลที่ส่งกลับแก้ไข";
            $("review-error").hidden = false;
            $("reject-comment").focus();
            return;
        }
        const label = decision === "Approved" ? "อนุมัติ" : "ส่งกลับแก้ไข";
        if (!confirm(`ยืนยัน${label}ภาระงานของ ${nameOf(rec.faculty_id)} ภาค ${rec.semester}/${rec.academic_year}?`)) return;
        try {
            await Api.reviewWorkload(rec.faculty_id, rec.term_id, decision, comment);
            closeModal($("detail-modal"));
            toast(`${label}เรียบร้อยแล้ว`, "success");
            await load();
        } catch (e) {
            if (inModal) { $("review-error").textContent = e.message; $("review-error").hidden = false; }
            else toast(e.message, "error");
        }
    }

    function csvCell(v) {
        let s = String(v ?? "");
        if (/^[=+@\t\r]|^-(?!$)/.test(s)) s = "'" + s;          
        return `"${s.replace(/"/g, '""')}"`;
    }

    function exportCsv() {
        const list = visibleRows();
        if (!list.length) { toast("ไม่มีข้อมูลให้ Export", "error"); return; }
        const head = ["faculty_id", "ชื่ออาจารย์", "ปีการศึกษา", "ภาคการศึกษา", "สถานะ", "หมวด", "หัวข้อ", "รายละเอียด", "ไฟล์หลักฐาน"];
        const lines = [head.map(csvCell).join(",")];
        list.forEach(r => CATEGORIES.forEach(c => (r.workloads?.[c.key] || []).forEach(it => {
            const s = c.summarize(it);
            lines.push([r.faculty_id, nameOf(r.faculty_id), r.academic_year, r.semester, r.workflow_status,
                c.en, s.title, s.sub, it.evidence_name || ""].map(csvCell).join(","));
        })));
        const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `workloads_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
})();