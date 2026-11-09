(() => {
    const $ = id => document.getElementById(id);
    const PUB_PAGE = 10;

    let faculty = null;
    let publications = [];
    let pubShown = PUB_PAGE;
    
    // สถานะตัวกรองผลงาน
    let currentSearch = "";
    let currentYear = "all";
    let currentType = "all";
    let currentQuickYears = "all"; // "all" | 3 | 5

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        await Auth.ready;
        const loading = $("loading-state");
        const mainEl = document.querySelector("main");

        try {
            const res = await fetch("faculties.json");
            if (!res.ok) throw new Error("Cannot load faculties.json");
            const faculties = await res.json();
            const me = Auth.getUser();
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

        renderFacultyBasic(faculty);
        initPublications();
        bindEvents();

        if (loading) loading.style.display = "none";
        if (mainEl) mainEl.style.display = "block";
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

    // --- ส่วนจัดการผลงานตลอดชีพ (Lifetime Academic Outputs) และตัวกรอง ---
    function initPublications() {
        publications = faculty.publications || [];
        if (!publications.length) return;
        
        $("block-publications").style.display = "";

        // เติมข้อมูลลงใน Dropdown ปีการศึกษา
        const years = [...new Set(publications.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);
        const yearSelect = $("select-pub-year");
        yearSelect.innerHTML = `<option value="all">ทุกปี (All Years)</option>` + 
            years.map(y => `<option value="${y}">${y}</option>`).join("");

        // เติมข้อมูลลงใน Dropdown ประเภท/แหล่งตีพิมพ์ (Source)
        const sources = [...new Set(publications.map(p => p.source).filter(Boolean))].sort();
        const typeSelect = $("select-pub-type");
        typeSelect.innerHTML = `<option value="all">ทุกประเภท/แหล่งตีพิมพ์</option>` + 
            sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

        renderPublications();
    }

    function getFilteredPublications() {
        return publications.filter(pub => {
            // ค้นหาข้อความ
            if (currentSearch) {
                const q = currentSearch.toLowerCase();
                const matchTitle = pub.title?.toLowerCase().includes(q);
                const matchVenue = pub.venue?.toLowerCase().includes(q);
                const matchSource = pub.source?.toLowerCase().includes(q);
                if (!matchTitle && !matchVenue && !matchSource) return false;
            }

            // กรองตามปีที่เลือกจาก Dropdown
            if (currentYear !== "all" && String(pub.year) !== String(currentYear)) {
                return false;
            }

            // กรองตามประเภท (Source)
            if (currentType !== "all" && pub.source !== currentType) {
                return false;
            }

            // กรองด่วน (Quick Filter ย้อนหลัง 3 ปี / 5 ปี)
            if (currentQuickYears !== "all" && pub.year) {
                const currentThYear = new Date().getFullYear() + 543; // ปีพุทธศักราชปัจจุบัน (หรือปรับตาม ค.ศ. หากข้อมูลเป็น ค.ศ.)
                // ตรวจสอบว่าข้อมูลใน pub.year เป็น ค.ศ. หรือ พ.ศ. (สมมติว่าเป็นปี ค.ศ. หรือ พ.ศ. ใกล้เคียงกัน ใช้เปรียบเทียบตัวเลขตรงๆ)
                const pubYrNum = Number(pub.year);
                const maxYear = Math.max(...publications.map(p => Number(p.year) || 0), currentThYear - 543);
                const limitYear = maxYear - Number(currentQuickYears);
                if (pubYrNum < limitYear) return false;
            }

            return true;
        });
    }

    function renderPublications() {
        const filtered = getFilteredPublications();
        $("pub-count").textContent = `${filtered.length} รายการ`;

        const sliceData = filtered.slice(0, pubShown);
        const listEl = $("list-publications");

        if (!sliceData.length) {
            listEl.innerHTML = `<p class="empty-note" style="text-align: center; padding: 2rem; color: var(--tu-text-muted);">ไม่พบผลงานตีพิมพ์ที่ตรงกับเงื่อนไขการค้นหา</p>`;
            $("btn-more-pubs").hidden = true;
            return;
        }

        listEl.innerHTML = sliceData.map(pub => `
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

        $("btn-more-pubs").hidden = pubShown >= filtered.length;
    }

    function safeUrl(u) {
        try { const x = new URL(u); return ["http:", "https:"].includes(x.protocol) ? x.href : ""; } catch { return ""; }
    }

    function bindEvents() {
        // ค้นหาข้อความ
        $("pub-search").addEventListener("input", e => {
            currentSearch = e.target.value.trim();
            pubShown = PUB_PAGE;
            renderPublications();
        });

        // กรองตามปี
        $("select-pub-year").addEventListener("change", e => {
            currentYear = e.target.value;
            pubShown = PUB_PAGE;
            renderPublications();
        });

        // กรองตามประเภท
        $("select-pub-type").addEventListener("change", e => {
            currentType = e.target.value;
            pubShown = PUB_PAGE;
            renderPublications();
        });

        // ปุ่ม Quick Filter (ทั้งหมด / ย้อนหลัง 3 ปี / 5 ปี)
        document.querySelectorAll(".pub-quick-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                document.querySelectorAll(".pub-quick-btn").forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                currentQuickYears = e.target.dataset.years;
                pubShown = PUB_PAGE;
                renderPublications();
            });
        });

        // ปุ่มแสดงเพิ่มเติม (Pagination)
        $("btn-more-pubs").addEventListener("click", () => {
            pubShown += PUB_PAGE;
            renderPublications();
        });
    }
})();