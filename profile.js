(() => {
    const $ = id => document.getElementById(id);
    const EDITABLE = ["Draft", "Rejected", "Pending_Review", "Approved"];   // เจ้าของเพิ่ม/แก้ภาระงานได้ทุกสถานะ ไม่จำกัด
    const PUB_PAGE = 10;

    let faculty = null;
    let records = [];            
    let selectedTerm = "all";    
    let activeCat = CATEGORIES[0].key;
    let pubShown = PUB_PAGE;
    let editing = null;          

    const isOwner = () => !!faculty && Auth.isOwner(faculty.faculty_id);
    const isStaff = () => Auth.isStaffOrAdmin();
    const canSeeStatus = () => isOwner() || isStaff();
    const canEditRecord = rec => isOwner() && EDITABLE.includes(rec.workflow_status);
    const currentRecord = () => records.find(r => r.term_id === selectedTerm) || null;

    document.addEventListener("DOMContentLoaded", init);

    
    async function init() {
        if (!(await Auth.guard([]))) return;

        try {
            const res = await fetch("faculties.json");
            if (!res.ok) throw new Error("Cannot load faculties.json");
            const faculties = await res.json();
            const me = Auth.getUser();
            const id = new URLSearchParams(window.location.search).get("id") || me?.faculty_id || "prof_001";
            faculty = faculties.find(f => f.faculty_id === id);
            
            if (!faculty) {
                document.querySelector("main").innerHTML = `<p style="color: var(--tu-red); text-align: center; padding: 3rem;">ไม่พบข้อมูลอาจารย์รหัส: ${escapeHtml(id)}</p>`;
                return;
            }
        } catch (err) {
            console.error(err);
            document.querySelector("main").innerHTML = `<p style="color: var(--tu-red); text-align: center; padding: 3rem;">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>`;
            return;
        }

        renderFacultyBasic(faculty);
        renderPublications();
        bindEvents();
        await loadWorkloads();
    }

    
    function renderFacultyBasic(f) {
        document.title = `${f.name_th} | มหาวิทยาลัยธรรมศาสตร์`;
        $("f-name-th").textContent = f.name_th || "-";
        $("f-name-en").textContent = f.name_en || "-";
        $("f-position").textContent = f.academic_position || "อาจารย์";

        const initials = f.name_en ? f.name_en.split(" ").pop().substring(0, 2).toUpperCase() : "TU";
        const profNumber = f.faculty_id ? f.faculty_id.replace("prof_", "") : "001";
        const ext = profNumber === "022" ? ".png" : ".jpg";
        const imgPath = `https://faculty-output-and-workload-management-system-g14.s3.us-east-1.amazonaws.com/profile_image/prof_img_${profNumber}${ext}`;
        const avatar = $("f-avatar");
        avatar.innerHTML = `<img src="${escapeHtml(imgPath)}" alt="${escapeHtml(f.name_th)}"
            style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        avatar.querySelector("img").addEventListener("error", () => { avatar.textContent = initials; }, { once: true });

        const contact = f.contact_information || {};
        setTextOrHide("f-office", "item-office", contact.office);
        setTextOrHide("f-phone", "item-phone", contact.phone);
        setTextOrHide("f-email", "item-email", contact.email);

        const p = f.external_profiles || {};
        [["link-scholar", p.google_scholar_url], ["link-semantic", p.semanticscholar_url], ["link-rg", p.researchgate_url]]
            .forEach(([id, url]) => {
                const a = $(id);
                if (a && url && url !== "-") { a.href = url; a.rel = "noopener noreferrer"; a.style.display = "inline-flex"; }
            });

        fillList("f-interests", "block-interests", f.research_interests, v => `<span class="chip">${escapeHtml(v)}</span>`);
        fillList("f-expertise-list", "block-expertise", f.expertise, v => `<li>${escapeHtml(v)}</li>`);
        fillList("f-education-list", "block-education", f.education, v => `<li>${escapeHtml(v)}</li>`, true);
    }

    function fillList(containerId, blockId, arr, tpl, allowDash) {
        const ok = Array.isArray(arr) && arr.length > 0 && (allowDash || arr[0] !== "-");
        if (ok) $(containerId).innerHTML = arr.map(tpl).join("");
        else $(blockId).style.display = "none";
    }

    function setTextOrHide(spanId, wrapperId, val) {
        if (!val || val === "-") { $(wrapperId).style.display = "none"; return; }
        $(spanId).textContent = val;
    }

    function renderPublications() {
        const pubs = faculty.publications || [];
        if (!pubs.length) return;
        $("block-publications").style.display = "";
        $("pub-count").textContent = `${pubs.length} รายการ`;
        $("list-publications").innerHTML = pubs.slice(0, pubShown).map(pub => `
            <li class="repo-card-item">
                <div class="repo-badge-row">
                    <span class="badge-term">${escapeHtml(pub.year || "-")}</span>
                    <span class="badge-credit">${escapeHtml(pub.source || "Scholar")}</span>
                    ${pub.citation_count > 0 ? `<span class="badge-source">อ้างอิง ${Number(pub.citation_count)} ครั้ง</span>` : ""}
                </div>
                <div class="repo-title">${escapeHtml(pub.title)}</div>
                ${pub.venue && pub.venue !== "N/A" ? `<div class="repo-sub-info">${escapeHtml(pub.venue)}</div>` : ""}
                ${safeUrl(pub.url) ? `<div style="margin-top:0.5rem;"><a class="pub-link" href="${escapeHtml(safeUrl(pub.url))}" target="_blank" rel="noopener noreferrer">เปิดดูผลงาน ↗</a></div>` : ""}
            </li>`).join("");
        $("btn-more-pubs").hidden = pubShown >= pubs.length;
    }

    function safeUrl(u) {
        try { const x = new URL(u); return ["http:", "https:"].includes(x.protocol) ? x.href : ""; } catch { return ""; }
    }

    
    async function loadWorkloads() {
        try {
            records = (await Api.listWorkloads({ faculty_id: faculty.faculty_id })).sort(sortTermsDesc);
            $("wl-notice").innerHTML = "";
        } catch (e) {
            records = [];
            $("wl-notice").innerHTML = `<div class="notice notice-warn">${escapeHtml(
                e.status === 401 || e.status === 403 ? "ไม่มีสิทธิ์ดูข้อมูลภาระงาน — กรุณาเข้าสู่ระบบ" : e.message)}</div>`;
        }
        selectedTerm = records[0]?.term_id || "all";
        renderWorkloads();
    }

    function renderWorkloads() {
        renderSubtitle();
        renderTermSelect();
        renderStatusBar();
        renderTabs();
        renderList();
    }

    function renderSubtitle() {
        const el = $("wl-subtitle");
        if (isOwner()) el.textContent = "ภาระงานของคุณ — เพิ่ม/แก้ไขได้ไม่จำกัด (เมื่อเพิ่มแล้วจะขึ้นเป็น “รอการตรวจสอบ” ที่ Dashboard)";
        else if (isStaff()) el.textContent = "มุมมองสำหรับผู้ตรวจสอบ — อนุมัติ/ส่งกลับได้ที่หน้า Dashboard";
        else el.textContent = "แสดงเฉพาะภาระงานที่ได้รับการอนุมัติแล้ว";
        $("btn-new-term").hidden = !isOwner();
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
            html += `<button type="button" class="tu-btn tu-btn-sm" id="btn-submit-review" ${countItems(rec) === 0 ? "disabled title=\"ต้องมีอย่างน้อย 1 รายการ\"" : ""}>ส่งตรวจ (Submit for Review)</button>`;
        }
        html += `</div>`;
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
        $("btn-add-item").hidden = !(isOwner() && (rec ? canEditRecord(rec) : records.length > 0));

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
                    <button type="button" class="tu-btn tu-btn-secondary tu-btn-sm" data-action="edit" data-term="${escapeHtml(r.term_id)}" data-idx="${idx}">แก้ไข</button>
                    <button type="button" class="tu-btn tu-btn-danger tu-btn-sm" data-action="delete" data-term="${escapeHtml(r.term_id)}" data-idx="${idx}">ลบ</button>
                </div>` : ""}
            </li>`;
        }).join("");
    }

    
    function bindEvents() {
        $("select-term").addEventListener("change", e => { selectedTerm = e.target.value; renderWorkloads(); });
        $("repo-search").addEventListener("input", renderList);
        $("btn-more-pubs").addEventListener("click", () => { pubShown += PUB_PAGE; renderPublications(); });
        $("btn-new-term").addEventListener("click", openTermModal);
        $("btn-add-item").addEventListener("click", () => {
            if (!currentRecord() && records.length) { selectedTerm = records[0].term_id; renderWorkloads(); }   // มุมมอง "ทั้งหมด" → เพิ่มในภาคล่าสุด (เปลี่ยนภาคได้ที่ตัวเลือกด้านบน)
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
            if (b.dataset.action === "edit") { selectedTerm = b.dataset.term; openItemForm(activeCat, Number(b.dataset.idx)); }
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
        return `<div class="tu-form-group">${label}${input}</div>`;
    }

    function openItemForm(catKey, idx) {
        const rec = currentRecord();
        if (!rec || !canEditRecord(rec)) return;
        const cat = getCategory(catKey);
        const item = idx === null ? {} : (rec.workloads[catKey][idx] || {});
        editing = { termId: rec.term_id, catKey, idx };

        $("item-modal-title").textContent =
            `${idx === null ? "เพิ่มรายการ" : "แก้ไขรายการ"}: ${cat.label} — ภาค ${rec.semester}/${rec.academic_year}`;
        $("item-fields").innerHTML = cat.fields.map(f => fieldHtml(f, item[f.name] ?? f.default ?? "")).join("");
        $("wl-file").value = "";
        $("existing-evidence").innerHTML = item.evidence_key
            ? `ไฟล์เดิม: <b>${escapeHtml(item.evidence_name || item.evidence_key)}</b> (เลือกไฟล์ใหม่เพื่อแทนที่)
               <label class="inline-check"><input type="checkbox" id="remove-evidence"> ลบไฟล์แนบเดิม</label>`
            : "";
        showFormError("");
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
        const rec = records.find(r => r.term_id === editing?.termId);
        if (!rec || !canEditRecord(rec)) return;
        const cat = getCategory(editing.catKey);
        const btn = $("item-save-btn");

        let values;
        try {
            values = readAndValidate(cat);
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
            showFormError(err.message);
        } finally {
            btn.disabled = false; btn.textContent = "บันทึก";
        }
    }

    async function persist(rec, workloads) {
        const res = await Api.saveWorkload({ ...rec, workloads });
        let saved = res && res.faculty_id ? res : { ...rec, workloads };
        records = records.map(r => r.term_id === rec.term_id ? saved : r);
        renderWorkloads();
    }

    async function onDeleteItem(termId, idx) {
        const rec = records.find(r => r.term_id === termId);
        if (!rec || !canEditRecord(rec)) return;
        if (!confirm("ต้องการลบรายการภาระงานนี้หรือไม่?")) return;
        const workloads = structuredClone({ ...emptyWorkloads(), ...rec.workloads });
        workloads[activeCat].splice(idx, 1);
        try {
            await persist(rec, workloads);
            toast("ลบรายการแล้ว", "success");
        } catch (err) { toast(err.message, "error"); }
    }

    async function onSubmitForReview() {
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
            toast(err.message, "error");
        }
    }

    
    function openTermModal() {
        $("new-year").value = currentBuddhistYear();
        $("new-semester").value = "1";
        openModal($("term-modal"));
    }

    async function onCreateTerm(e) {
        e.preventDefault();
        const year = Number($("new-year").value);
        const semester = Number($("new-semester").value);
        if (!Number.isInteger(year) || year < 2500 || year > 2700) { toast("ปีการศึกษาไม่ถูกต้อง", "error"); return; }
        const term_id = makeTermId(year, semester);
        try {
            if (!records.some(r => r.term_id === term_id)) {
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
        } catch (err) { toast(err.message, "error"); }
    }
})();