(() => {
    const $ = id => document.getElementById(id);
    const EDITABLE = ["Draft", "Rejected", "Pending_Review"];   // ตัด "Approved" ออก เพื่อล็อกไม่ให้แก้ไข/ลบเมื่ออนุมัติแล้ว
    const PUB_PAGE = 10;

    let faculty = null;
    let records = [];            
    let selectedTerm = "all";    
    let activeCat = CATEGORIES[0].key;
    let editing = null;          
    let deadlineInfo = null;     // ผล GET /settings/deadline (#83)
    let dlState = { level: "none", locked: false, msLeft: Infinity };
    let lockTimer = null;

    const isOwner = () => !!faculty && Auth.isOwner(faculty.faculty_id);
    const isStaff = () => Auth.isStaffOrAdmin();
    const canSeeStatus = () => isOwner() || isStaff();
    const canEditRecord = rec => isOwner() && EDITABLE.includes(rec.workflow_status);
    const currentRecord = () => records.find(r => r.term_id === selectedTerm) || null;

    // #83: หมดเขตส่งงาน -> อาจารย์ดูได้อย่างเดียว (Staff/Admin ไม่ถูกล็อก) — Backend ตรวจซ้ำเสมอ
    const LOCK_MSG = "หมดเขตการส่ง/แก้ไขภาระงานแล้ว";
    const isLocked = () => !isStaff() && dlState.locked;
    const lockAttr = () => isLocked() ? ` disabled aria-disabled="true" title="${LOCK_MSG}"` : "";
    function blockIfLocked() {
        if (!isLocked()) return false;
        toast(LOCK_MSG, "error");
        return true;
    }

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        await Auth.ready;
        const me = Auth.getUser();
        if (!me) {
            if (typeof Auth !== 'undefined' && Auth.login) Auth.login();
            return;
        }

        const loading = $("loading-state");
        const mainEl = document.querySelector("main");

        try {
            const res = await fetch("faculties.json");
            if (!res.ok) throw new Error("Cannot load faculties.json");
            const faculties = await res.json();
            
            const id = new URLSearchParams(window.location.search).get("id") || me?.faculty_id || "prof_001";
            faculty = faculties.find(f => f.faculty_id === id);
            
            if (!faculty) {
                mainEl.innerHTML = `<p style="color: var(--tu-red); text-align: center; padding: 3rem;">ไม่พบข้อมูลอาจารย์รหัส: ${escapeHtml(id)}</p>`;
                mainEl.style.display = "block";
                return;
            }
        } catch (err) {
            console.error(err);
            mainEl.innerHTML = `<p style="color: var(--tu-red); text-align: center; padding: 3rem;">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>`;
            mainEl.style.display = "block";
            return;
        }

        if ($("btn-view-profile")) $("btn-view-profile").href = `profile.html?id=${faculty.faculty_id}`;
        if ($("wl-owner-name")) $("wl-owner-name").textContent = `อาจารย์: ${faculty.name_th} (${faculty.faculty_id})`;

        bindEvents();
        [deadlineInfo] = await Promise.all([fetchDeadline(), loadWorkloads()]);
        renderWorkloads();
        setInterval(tickDeadline, 60 * 1000);   // นับถอยหลังบนแถบประกาศทุก 1 นาที

        if (loading) loading.style.display = "none";
        if (mainEl) mainEl.style.display = "block";
    }

    async function loadWorkloads() {
        try {
            records = (await Api.listWorkloads({ faculty_id: faculty.faculty_id })).sort(sortTermsDesc);
            $("wl-notice").innerHTML = "";
        } catch (e) {
            $("wl-notice").innerHTML = `<div class="notice notice-warn">${escapeHtml(
                e.status === 401 || e.status === 403 ? "ไม่มีสิทธิ์ดูข้อมูลภาระงาน — กรุณาเข้าสู่ระบบ" : e.message)}</div>`;
        }
        selectedTerm = records[0]?.term_id || "all";
        renderWorkloads();
    }

    function renderDeadline() {
        dlState = renderDeadlineBanner($("deadline-banner"), canSeeStatus() ? deadlineInfo : null,
            { staffView: isStaff() && !isOwner() });
        scheduleLockTimer();
    }

    // เรียกทุก 1 นาที: อัปเดตตัวนับถอยหลัง และล็อกปุ่มทันทีถ้าเพิ่งเลยกำหนดระหว่างเปิดหน้า
    function tickDeadline() {
        const wasLocked = dlState.locked;
        renderDeadline();
        if (dlState.locked !== wasLocked) renderWorkloads();
    }

    function scheduleLockTimer() {
        clearTimeout(lockTimer);
        lockTimer = null;
        if (dlState.locked || !Number.isFinite(dlState.msLeft)) return;
        // setTimeout รองรับสูงสุด ~24.8 วัน ถ้าไกลกว่านั้น setInterval รายนาทีจะจัดการให้
        if (dlState.msLeft < 2 ** 31 - 1) {
            lockTimer = setTimeout(() => {
                renderWorkloads();
                if (isLocked()) { closeModal($("item-modal")); toast(LOCK_MSG, "error"); }
            }, dlState.msLeft + 500);
        }
    }

    async function handleLockError(err) {
        if (err?.status !== 403 || !String(err.message).includes("หมดเขต")) return false;
        deadlineInfo = (await fetchDeadline()) || { deadline: new Date().toISOString(), is_locked: true };
        closeModal($("item-modal"));
        renderWorkloads();
        toast(LOCK_MSG, "error");
        return true;
    }

    function renderWorkloads() {
        renderDeadline();
        renderSubtitle();
        renderTermSelect();
        renderStatusBar();
        renderTabs();
        renderList();
    }

    function renderSubtitle() {
        const el = $("wl-subtitle");
        const rec = currentRecord();
        if (rec && rec.workflow_status === "Approved") {
            el.innerHTML = `<span style="color: var(--tu-red, #c00); font-weight: 600;">🔒 รายการนี้ได้รับการอนุมัติแล้ว ไม่สามารถแก้ไขได้</span>`;
        } else if (isOwner() && isLocked()) {
            el.textContent = "";
        } else if (isOwner()) {
            el.textContent = "ภาระงานของคุณ — เพิ่ม/แก้ไขได้ไม่จำกัด (เมื่อเพิ่มแล้วจะขึ้นเป็น “รอการตรวจสอบ” ที่ Dashboard)";
        } else if (isStaff()) {
            el.textContent = "มุมมองสำหรับผู้ตรวจสอบ — อนุมัติ/ส่งกลับได้ที่หน้า Dashboard";
        } else {
            el.textContent = "แสดงเฉพาะภาระงานที่ได้รับการอนุมัติแล้ว";
        }
        $("btn-new-term").hidden = !isOwner() || (rec && rec.workflow_status === "Approved");
        $("btn-new-term").disabled = isLocked();
        if (isLocked() && isOwner()) el.insertAdjacentHTML("beforeend",
            `${el.textContent ? "<br>" : ""}<span class="muted-text">🔒 ${LOCK_MSG} — ดูข้อมูลได้อย่างเดียว</span>`);
    }

    function renderTermSelect() {
        const sel = $("select-term");
        sel.innerHTML = `<option value="all">ทั้งหมด (All Terms)</option>` + records.map(r =>
            `<option value="${escapeHtml(r.term_id)}">${r.semester}/${r.academic_year}${canSeeStatus() ? " · " + escapeHtml(STATUS[r.workflow_status]?.label || "") : ""}</option>`
        ).join("");
        sel.value = selectedTerm;
    }

    function renderStatusBar() {
        const bar = $("term-status-bar");
        const rec = currentRecord();
        if (!rec) { bar.innerHTML = ""; return; }
        let html = `<div class="term-status">
            <div>${statusBadge(rec.workflow_status)}
                <span class="muted-text">รอบประเมิน: ${escapeHtml(rec.evaluation_period || "-")}</span></div>`;
        if (isOwner() && ["Draft", "Rejected"].includes(rec.workflow_status)) {
            const submitAttr = isLocked() ? lockAttr()
                : countItems(rec) === 0 ? ` disabled title="ต้องมีอย่างน้อย 1 รายการ"` : "";
            html += `<button type="button" class="tu-btn tu-btn-sm" id="btn-submit-review"${submitAttr}>ส่งตรวจ (Submit for Review)</button>`;
        }
        html += `</div>`;
        if (rec.workflow_status === "Approved") {
            html += `<div class="notice notice-ok"><b>สถานะ:</b> รายการนี้ได้รับการอนุมัติแล้ว ไม่สามารถแก้ไขหรือลบรายการได้</div>`;
        }
        if (rec.workflow_status === "Rejected" && rec.review_comment && canSeeStatus()) {
            html += `<div class="notice notice-error"><b>เหตุผลที่ส่งกลับแก้ไข:</b> ${escapeHtml(rec.review_comment)}
                ${rec.reviewed_by ? `<br><small>โดย ${escapeHtml(rec.reviewed_by)} · ${escapeHtml(formatDateTime(rec.reviewed_at))}</small>` : ""}</div>`;
        }
        if (rec.workflow_status === "Approved" && rec.reviewed_by && canSeeStatus()) {
            html += `<div class="notice notice-ok">อนุมัติโดย ${escapeHtml(rec.reviewed_by)} · ${escapeHtml(formatDateTime(rec.reviewed_at))}</div>`;
        }
        bar.innerHTML = html;
    }

    const scopeRecords = () => selectedTerm === "all" ? records : records.filter(r => r.term_id === selectedTerm);

    function renderTabs() {
        const scope = scopeRecords();
        $("wl-tabs").innerHTML = CATEGORIES.map((c, i) => {
            const n = scope.reduce((s, r) => s + ((r.workloads?.[c.key]) || []).length, 0);
            return `<button type="button" class="tab-btn ${c.key === activeCat ? "active" : ""}" role="tab"
                aria-selected="${c.key === activeCat}" data-cat="${c.key}">${i + 1}. ${escapeHtml(c.label)} (${n})</button>`;
        }).join("");
    }

    function renderList() {
        const cat = getCategory(activeCat);
        const query = $("repo-search").value.toLowerCase().trim();
        const rec = currentRecord();
        
        // ซ่อนปุ่มเพิ่มรายการทันทีหากสถานะเป็น Approved หรือไม่อยู่ในสถานะแก้ไขได้
        $("btn-add-item").hidden = !(isOwner() && (rec ? canEditRecord(rec) : records.length > 0));
        $("btn-add-item").disabled = isLocked();

        const rows = [];
        scopeRecords().forEach(r => (r.workloads?.[cat.key] || []).forEach((item, idx) => rows.push({ r, item, idx })));
        const shown = rows.filter(({ item }) => !query || Object.values(item).join(" ").toLowerCase().includes(query));

        if (!shown.length) {
            $("wl-list").innerHTML = `<p class="empty-note">${rows.length ? "ไม่พบรายการที่ตรงกับคำค้น" : "ไม่มีข้อมูลในหมวดนี้"}</p>`;
            return;
        }
        $("wl-list").innerHTML = shown.map(({ r, item, idx }) => {
            const s = cat.summarize(item);
            const editable = canEditRecord(r);
            return `
            <li class="repo-card-item">
                <div class="repo-badge-row">
                    <span class="badge-term">${r.semester}/${r.academic_year}</span>
                    ${selectedTerm === "all" && canSeeStatus() ? statusBadge(r.workflow_status) : ""}
                    ${item.evidence_key && canSeeStatus() ? `<button type="button" class="link-btn" data-action="evidence" data-key="${escapeHtml(item.evidence_key)}">📎 ${escapeHtml(item.evidence_name || "ดูไฟล์หลักฐาน")}</button>` : ""}
                </div>
                <div class="repo-title">${escapeHtml(s.title)}</div>
                <div class="repo-sub-info">${escapeHtml(s.sub)}</div>
                ${editable ? `<div class="item-actions">
                    <button type="button" class="tu-btn tu-btn-secondary tu-btn-sm" data-action="edit" data-term="${escapeHtml(r.term_id)}" data-idx="${idx}"${lockAttr()}>แก้ไข</button>
                    <button type="button" class="tu-btn tu-btn-danger tu-btn-sm" data-action="delete" data-term="${escapeHtml(r.term_id)}" data-idx="${idx}"${lockAttr()}>ลบ</button>
                </div>` : (r.workflow_status === "Approved" ? `<div class="item-actions"><span class="muted-text" style="font-size: 0.85rem; color: var(--tu-red, rgb(0, 204, 10));">อนุมัติแล้ว</span></div>` : "")}
            </li>`;
        }).join("");
    }

    function bindEvents() {
        $("select-term").addEventListener("change", e => { selectedTerm = e.target.value; renderWorkloads(); });
        $("repo-search").addEventListener("input", renderList);
        $("btn-new-term").addEventListener("click", () => { if (!blockIfLocked()) openTermModal(); });
        $("btn-add-item").addEventListener("click", () => {
            if (blockIfLocked()) return;
            const rec = currentRecord();
            if (rec && !canEditRecord(rec)) {
                toast("รายการนี้ได้รับการอนุมัติแล้ว ไม่สามารถเพิ่มหรือแก้ไขได้", "error");
                return;
            }
            if (!rec && records.length) { selectedTerm = records[0].term_id; renderWorkloads(); }
            openItemForm(activeCat, null);
        });
        $("item-form").addEventListener("submit", onSaveItem);
        $("term-form").addEventListener("submit", onCreateTerm);

        $("wl-tabs").addEventListener("click", e => {
            const b = e.target.closest("[data-cat]");
            if (!b) return;
            activeCat = b.dataset.cat;
            renderTabs();
            renderList();
        });
        $("term-status-bar").addEventListener("click", e => {
            if (e.target.closest("#btn-submit-review")) onSubmitForReview();
        });
        $("wl-list").addEventListener("click", e => {
            const b = e.target.closest("[data-action]");
            if (!b) return;
            if (b.dataset.action === "evidence") Api.openEvidence(b.dataset.key);
            if ((b.dataset.action === "edit" || b.dataset.action === "delete") && blockIfLocked()) return;
            if (b.dataset.action === "edit") {
                const rec = records.find(r => r.term_id === b.dataset.term);
                if (rec && !canEditRecord(rec)) {
                    toast("รายการนี้ได้รับการอนุมัติแล้ว ไม่สามารถแก้ไขได้", "error");
                    renderWorkloads();
                    return;
                }
                selectedTerm = b.dataset.term; 
                openItemForm(activeCat, Number(b.dataset.idx));
            }
            if (b.dataset.action === "delete") onDeleteItem(b.dataset.term, Number(b.dataset.idx));
        });
    }

    function fieldHtml(f, value) {
        const id = `f_${f.name}`;
        const req = f.required ? " required" : "";
        const label = `<label for="${id}">${escapeHtml(f.label)}${f.required ? ' <span class="req">*</span>' : ""}</label>`;
        let input;
        if (f.type === "select") {
            const opts = [...f.options];
            if (value && !opts.includes(value)) opts.push(value);          
            input = `<select id="${id}" class="tu-form-control"${req}>${opts.map(o =>
                `<option value="${escapeHtml(o)}" ${o === value ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`;
        } else if (f.type === "textarea") {
            input = `<textarea id="${id}" class="tu-form-control" rows="3">${escapeHtml(value)}</textarea>`;
        } else {
            const attrs = f.type === "number"
                ? ` min="${f.min ?? ""}" ${f.max !== undefined ? `max="${f.max}"` : ""} step="${f.step ?? "any"}"` : "";
            input = `<input id="${id}" class="tu-form-control" type="${f.type}" value="${escapeHtml(value)}"
                placeholder="${escapeHtml(f.placeholder || "")}"${attrs}${req}>`;
        }
        const help = f.help ? `<small class="field-help">${escapeHtml(f.help)}</small>` : "";
        return `<div class="tu-form-group">${label}${input}${help}</div>`;
    }

    function openItemForm(catKey, idx) {
        if (blockIfLocked()) return;
        const rec = currentRecord();
        if (!rec || !canEditRecord(rec)) {
            toast("รายการนี้ได้รับการอนุมัติแล้ว ไม่สามารถแก้ไขได้", "error");
            return;
        }
        const cat = getCategory(catKey);
        const item = idx === null ? {} : (rec.workloads[catKey][idx] || {});
        editing = { termId: rec.term_id, catKey, idx };

        $("item-modal-title").textContent =
            `${idx === null ? "เพิ่มรายการ" : "แก้ไขรายการ"}: ${cat.label} — ภาค ${rec.semester}/${rec.academic_year}`;
        const fieldMarkup = cat.fields.map(f => fieldHtml(f, item[f.name] ?? f.default ?? ""));
        $("item-fields").innerHTML = catKey === "academic_outputs"
            ? `<section class="form-section"><h4>รายละเอียดผลงาน</h4><div class="form-section-grid">${fieldMarkup.slice(0, 2).join("")}${fieldMarkup[3] || ""}</div></section><section class="form-section"><h4>สัดส่วนการมีส่วนร่วม</h4>${fieldMarkup[2] || ""}</section>`
            : fieldMarkup.join("");
        $("wl-file").value = "";
        $("existing-evidence").innerHTML = item.evidence_key
            ? `ไฟล์เดิม: <b>${escapeHtml(item.evidence_name || item.evidence_key)}</b> (เลือกไฟล์ใหม่เพื่อแทนที่)
               <label class="inline-check"><input type="checkbox" id="remove-evidence"> ลบไฟล์แนบเดิม</label>`
            : "";
        showFormError("");
        $("item-save-btn").disabled = isLocked();
        openModal($("item-modal"));
        $("item-fields").querySelector("input, select, textarea")?.focus();
    }

    function showFormError(msg) {
        const el = $("item-form-error");
        el.textContent = msg;
        el.hidden = !msg;
    }

    function readAndValidate(cat) {
        const values = {};
        for (const f of cat.fields) {
            const el = $(`f_${f.name}`);
            el.removeAttribute("aria-invalid");
            let v = el.value.trim();
            const fail = msg => { el.setAttribute("aria-invalid", "true"); el.focus(); throw new Error(msg); };
            if (f.required && v === "") fail(`กรุณากรอก "${f.label}"`);
            if (f.type === "number") {
                if (v === "") { values[f.name] = 0; continue; }
                const n = Number(v);
                if (!Number.isFinite(n)) fail(`"${f.label}" ต้องเป็นตัวเลข`);
                if (f.min !== undefined && n < f.min) fail(`"${f.label}" ต้องไม่น้อยกว่า ${f.min}`);
                if (f.max !== undefined && n > f.max) fail(`"${f.label}" ต้องไม่เกิน ${f.max}`);
                values[f.name] = n;
            } else {
                values[f.name] = v;
            }
        }
        return values;
    }

    async function onSaveItem(e) {
        e.preventDefault();
        if (blockIfLocked()) return;
        const rec = records.find(r => r.term_id === editing?.termId);
        if (!rec || !canEditRecord(rec)) {
            toast("รายการนี้ได้รับการอนุมัติแล้ว ไม่สามารถบันทึกการเปลี่ยนแปลงได้", "error");
            return;
        }
        const cat = getCategory(editing.catKey);
        const btn = $("item-save-btn");

        let values;
        try {
            values = readAndValidate(cat);
            if (editing.catKey === "academic_outputs" && values.title) {
                const normalizedTitle = values.title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
                const duplicate = records.some(record => (record.workloads.academic_outputs || []).some((entry, index) =>
                    !(record.term_id === editing.termId && index === editing.idx) &&
                    entry.title?.trim().replace(/\s+/g, " ").toLocaleLowerCase() === normalizedTitle));
                if (duplicate) throw new Error("พบงานวิจัยชื่อเดียวกันในระบบแล้ว กรุณาตรวจสอบรายการเดิมก่อนบันทึก");
            }
            const file = $("wl-file").files[0];
            if (file) { const err = Api.validateEvidenceFile(file); if (err) throw new Error(err); }
        } catch (err) { showFormError(err.message); return; }

        btn.disabled = true; btn.textContent = "กำลังบันทึก...";
        try {
            const old = editing.idx === null ? {} : rec.workloads[editing.catKey][editing.idx];
            const item = { ...values };
            const file = $("wl-file").files[0];
            if (file) {
                item.evidence_key = await Api.uploadEvidence(file, { faculty_id: rec.faculty_id, term_id: rec.term_id });
                item.evidence_name = file.name;
            } else if (old.evidence_key && !$("remove-evidence")?.checked) {
                item.evidence_key = old.evidence_key;
                item.evidence_name = old.evidence_name;
            }

            const workloads = structuredClone({ ...emptyWorkloads(), ...rec.workloads });
            if (editing.idx === null) workloads[editing.catKey].push(item);
            else workloads[editing.catKey][editing.idx] = item;

            await persist(rec, workloads);
            closeModal($("item-modal"));
            toast("บันทึกเรียบร้อยแล้ว — สถานะ: รอการตรวจสอบ", "success");
        } catch (err) {
            if (!(await handleLockError(err))) showFormError(err.message);
        } finally {
            btn.disabled = isLocked(); btn.textContent = "บันทึก";
        }
    }

    async function persist(rec, workloads) {
        const res = await Api.saveWorkload({ ...rec, workloads });
        let saved = res && res.faculty_id ? res : { ...rec, workloads };
        records = records.map(r => r.term_id === rec.term_id ? saved : r);
        renderWorkloads();
    }

    async function onDeleteItem(termId, idx) {
        if (blockIfLocked()) return;
        const rec = records.find(r => r.term_id === termId);
        if (!rec || !canEditRecord(rec)) {
            toast("รายการนี้ได้รับการอนุมัติแล้ว ไม่สามารถลบได้", "error");
            return;
        }
        if (!confirm("ต้องการลบรายการภาระงานนี้หรือไม่?")) return;
        const workloads = structuredClone({ ...emptyWorkloads(), ...rec.workloads });
        workloads[activeCat].splice(idx, 1);
        try {
            await persist(rec, workloads);
            toast("ลบรายการแล้ว", "success");
        } catch (err) { if (!(await handleLockError(err))) toast(err.message, "error"); }
    }

    async function onSubmitForReview() {
        if (blockIfLocked()) return;
        const rec = currentRecord();
        if (!rec || !canEditRecord(rec)) return;
        if (!confirm(`ส่งภาระงานภาค ${rec.semester}/${rec.academic_year} เพื่อตรวจสอบ?\nหลังส่งแล้วจะแก้ไขไม่ได้จนกว่าจะถูกส่งกลับ`)) return;
        const btn = $("btn-submit-review");
        btn.disabled = true;
        try {
            const res = await Api.submitForReview(rec.faculty_id, rec.term_id);
            const saved = res && res.workflow_status ? res : { ...rec, workflow_status: "Pending_Review" };
            records = records.map(r => r.term_id === rec.term_id ? { ...r, ...saved } : r);
            renderWorkloads();
            toast("ส่งตรวจเรียบร้อยแล้ว — สถานะ: รอการตรวจสอบ", "success");
        } catch (err) {
            btn.disabled = false;
            if (!(await handleLockError(err))) toast(err.message, "error");
        }
    }

    function openTermModal() {
        $("new-year").value = currentBuddhistYear();
        $("new-semester").value = "1";
        openModal($("term-modal"));
    }

    async function onCreateTerm(e) {
        e.preventDefault();
        const submitButton = e.submitter || $("term-form").querySelector('[type="submit"]');
        const originalLabel = submitButton?.textContent;
        if (submitButton) { submitButton.disabled = true; submitButton.textContent = "กำลังบันทึก..."; }
        const year = Number($("new-year").value);
        const semester = Number($("new-semester").value);
        if (!Number.isInteger(year) || year < 2500 || year > 2700) {
            toast("ปีการศึกษาไม่ถูกต้อง", "error");
            if (submitButton) { submitButton.disabled = false; submitButton.textContent = originalLabel; }
            return;
        }
        const term_id = makeTermId(year, semester);
        const alreadyExists = records.some(r => r.term_id === term_id);
        // #83: หมดเขตแล้วเปิดดูภาคเดิมได้ แต่สร้างภาคใหม่ไม่ได้
        if (!alreadyExists && blockIfLocked()) {
            closeModal($("term-modal"));
            if (submitButton) { submitButton.disabled = false; submitButton.textContent = originalLabel; }
            return;
        }
        try {
            if (!alreadyExists) {
                const created = await Api.saveWorkload({
                    faculty_id: faculty.faculty_id, term_id, academic_year: year, semester,
                    evaluation_period: evaluationPeriod(year, semester), workloads: emptyWorkloads()
                });
                records = [...records, created && created.faculty_id ? created : {
                    faculty_id: faculty.faculty_id, term_id, academic_year: year, semester,
                    evaluation_period: evaluationPeriod(year, semester), workflow_status: "Draft", workloads: emptyWorkloads()
                }].sort(sortTermsDesc);
            }
            selectedTerm = term_id;
            closeModal($("term-modal"));
            renderWorkloads();
            toast(alreadyExists ? "เปิดภาคการศึกษาที่เลือกแล้ว" : "สร้างภาคการศึกษาแล้ว", "success");
        } catch (err) {
            if (await handleLockError(err)) closeModal($("term-modal"));
            else toast(err.message, "error");
        }
        finally { if (submitButton) { submitButton.disabled = false; submitButton.textContent = originalLabel; } }
    }
})();