class ApiError extends Error {
    constructor(message, status = 0) { super(message); this.name = "ApiError"; this.status = status; }
}

const Api = (() => {
    const isMock = APP_CONFIG.isMock;
    const EVIDENCE = APP_CONFIG.evidence;

    
    async function request(method, path, { query, body } = {}) {
        const url = new URL(APP_CONFIG.api.baseUrl.replace(/\/$/, "") + path);
        Object.entries(query || {}).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
        });
        const headers = {};
        const token = Auth.getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        if (body !== undefined) headers["Content-Type"] = "application/json";

        let res;
        try {
            res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
        } catch {
            throw new ApiError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
        }
        if (res.status === 401 && token) {          
            await Auth.login(window.location.href);
            throw new ApiError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", 401);
        }
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { /* ไม่ใช่ JSON */ }
        if (!res.ok) throw new ApiError(data?.message || data?.error || `เกิดข้อผิดพลาด (${res.status})`, res.status);
        return data;
    }

    const real = {
        async listWorkloads(filters = {}) {
            const data = await request("GET", "/workloads", { query: filters });
            return Array.isArray(data) ? data : (data?.items || []);
        },
        saveWorkload(rec) {
            const { faculty_id, term_id, ...rest } = rec;
            return request("PUT", `/workloads/${encodeURIComponent(faculty_id)}/${encodeURIComponent(term_id)}`, {
                body: {
                    academic_year: rest.academic_year, semester: rest.semester,
                    evaluation_period: rest.evaluation_period, workloads: rest.workloads
                }
            });
        },
        submitForReview(fid, tid) {
            return request("POST", `/workloads/${encodeURIComponent(fid)}/${encodeURIComponent(tid)}/submit`);
        },
        reviewWorkload(fid, tid, decision, comment) {
            return request("POST", `/workloads/${encodeURIComponent(fid)}/${encodeURIComponent(tid)}/review`,
                { body: { decision, comment: comment || "" } });
        },
        async uploadEvidence(file, { faculty_id, term_id }) {
            const { upload_url, key } = await request("POST", "/evidence/upload-url", {
                body: { faculty_id, term_id, file_name: file.name, content_type: file.type, size: file.size }
            });
            let res;
            try {
                res = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
            } catch {
                throw new ApiError("อัปโหลดไฟล์ไม่สำเร็จ (เชื่อมต่อ S3 ไม่ได้ — ตรวจสอบ CORS ของ bucket)");
            }
            if (!res.ok) throw new ApiError(`อัปโหลดไฟล์ไม่สำเร็จ (${res.status})`, res.status);
            return key;
        },
        async getEvidenceUrl(key) {
            const data = await request("GET", "/evidence/download-url", { query: { key } });
            return data.download_url;
        }
    };

    
    const K_DATA = "mock_workloads_v3";
    const K_EVID = "mock_evidence_v1";
    const readJson = (k, d) => { try { return JSON.parse(sessionStorage.getItem(k)) ?? d; } catch { return d; } };
    function writeJson(k, v) {
        try { sessionStorage.setItem(k, JSON.stringify(v)); }
        catch { throw new ApiError("พื้นที่จัดเก็บจำลองเต็ม (ไฟล์ใหญ่เกินไปสำหรับโหมดทดสอบ)"); }
    }

    
    async function loadAll() {
        let data = readJson(K_DATA, null);
        if (data) return data;
        const res = await fetch("faculties-workloads-mock.json");
        if (!res.ok) throw new ApiError("โหลดข้อมูลจำลองไม่ได้");
        const raw = await res.json();
        const now = new Date().toISOString();
        data = raw.map(r => {
            const term_id = makeTermId(r.academic_year, r.semester);
            // ข้อมูลเดิมจากไฟล์ถือว่าอนุมัติแล้ว (ตรงกับ migrate_workloads_to_dynamo.py) ไม่สร้างสถานะสมมติ
            const status = r.workflow_status || "Approved";
            const rec = {
                ...r, term_id, workflow_status: status,
                workloads: { ...emptyWorkloads(), ...(r.workloads || {}) },
                created_at: now, updated_at: now
            };
            return rec;
        });
        writeJson(K_DATA, data);
        return data;
    }

    function requireUser() {
        const u = Auth.getUser();
        if (!u) throw new ApiError("กรุณาเข้าสู่ระบบ", 401);
        return u;
    }
    function canSee(rec, u) {
        return rec.workflow_status === "Approved" || (u && (Auth.isStaffOrAdmin() || u.faculty_id === rec.faculty_id));
    }
    const sameKey = (a, fid, tid) => a.faculty_id === fid && a.term_id === tid;
    const clone = x => JSON.parse(JSON.stringify(x));

    const mock = {
        async listWorkloads(f = {}) {
            const u = Auth.getUser();
            return clone((await loadAll()).filter(r =>
                canSee(r, u) &&
                (!f.faculty_id || r.faculty_id === f.faculty_id) &&
                (!f.academic_year || Number(r.academic_year) === Number(f.academic_year)) &&
                (!f.semester || Number(r.semester) === Number(f.semester)) &&
                (!f.workflow_status || r.workflow_status === f.workflow_status)
            ));
        },
        async saveWorkload(rec) {
            const u = requireUser();
            if (u.faculty_id !== rec.faculty_id) throw new ApiError("แก้ไขได้เฉพาะภาระงานของตนเอง", 403);
            const all = await loadAll();
            const now = new Date().toISOString();
            const idx = all.findIndex(a => sameKey(a, rec.faculty_id, rec.term_id));
            let saved;
            if (idx >= 0) {
                saved = { ...all[idx], workloads: { ...emptyWorkloads(), ...rec.workloads }, updated_at: now };
                all[idx] = saved;
            } else {
                saved = {
                    faculty_id: rec.faculty_id, term_id: rec.term_id,
                    academic_year: Number(rec.academic_year), semester: Number(rec.semester),
                    evaluation_period: rec.evaluation_period || evaluationPeriod(rec.academic_year, rec.semester),
                    workflow_status: "Draft",
                    workloads: { ...emptyWorkloads(), ...rec.workloads },
                    created_at: now, updated_at: now
                };
                all.push(saved);
            }
            writeJson(K_DATA, all);
            return clone(saved);
        },
        async submitForReview(fid, tid) {
            const u = requireUser();
            if (u.faculty_id !== fid) throw new ApiError("ส่งตรวจได้เฉพาะภาระงานของตนเอง", 403);
            const all = await loadAll();
            const rec = all.find(a => sameKey(a, fid, tid));
            if (!rec) throw new ApiError("ไม่พบข้อมูล", 404);
            if (rec.workflow_status === "Pending_Review") throw new ApiError("สถานะปัจจุบันส่งตรวจไม่ได้", 409);
            if (countItems(rec) === 0) throw new ApiError("ยังไม่มีรายการภาระงาน", 400);
            rec.workflow_status = "Pending_Review";
            rec.updated_at = new Date().toISOString();
            writeJson(K_DATA, all);
            return clone(rec);
        },
        async reviewWorkload(fid, tid, decision, comment) {
            const u = requireUser();
            if (!Auth.isStaffOrAdmin()) throw new ApiError("เฉพาะ Staff/Admin เท่านั้นที่ตรวจสอบได้", 403);
            if (!["Approved", "Rejected"].includes(decision)) throw new ApiError("decision ไม่ถูกต้อง", 400);
            if (decision === "Rejected" && !String(comment || "").trim()) throw new ApiError("กรุณาระบุเหตุผลที่ส่งกลับ", 400);
            const all = await loadAll();
            const rec = all.find(a => sameKey(a, fid, tid));
            if (!rec) throw new ApiError("ไม่พบข้อมูล", 404);
            if (rec.workflow_status !== "Pending_Review") throw new ApiError("รายการนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ", 409);
            rec.workflow_status = decision;
            rec.review_comment = decision === "Rejected" ? String(comment).trim() : "";
            rec.reviewed_by = u.name;
            rec.reviewed_at = rec.updated_at = new Date().toISOString();
            writeJson(K_DATA, all);
            return clone(rec);
        },
        async uploadEvidence(file, { faculty_id }) {
            const u = requireUser();
            if (u.faculty_id !== faculty_id) throw new ApiError("อัปโหลดได้เฉพาะหลักฐานของตนเอง", 403);
            if (file.size > EVIDENCE.mockMaxBytes)
                throw new ApiError(`โหมดทดสอบรองรับไฟล์ไม่เกิน ${EVIDENCE.mockMaxBytes / 1024 / 1024} MB`);
            const dataUrl = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(fr.result);
                fr.onerror = () => reject(new ApiError("อ่านไฟล์ไม่สำเร็จ"));
                fr.readAsDataURL(file);
            });
            const key = `evidence/${faculty_id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
            const evid = readJson(K_EVID, {});
            evid[key] = { name: file.name, dataUrl };
            writeJson(K_EVID, evid);
            return key;
        },
        async getEvidenceUrl(key) {
            const u = requireUser();
            const fid = key.split("/")[1];
            if (!Auth.isStaffOrAdmin() && u.faculty_id !== fid) throw new ApiError("ไม่มีสิทธิ์ดูไฟล์นี้", 403);
            const item = readJson(K_EVID, {})[key];
            if (!item) throw new ApiError("ไม่พบไฟล์หลักฐาน (ข้อมูลตั้งต้นของระบบจำลองไม่มีไฟล์จริง)", 404);
            const blob = await (await fetch(item.dataUrl)).blob();   // data: URL เปิดตรง ๆ ไม่ได้ จึงแปลงเป็น blob URL
            return URL.createObjectURL(blob);
        }
    };

    
    const impl = isMock ? mock : real;

    function validateEvidenceFile(file) {
        if (!EVIDENCE.allowedTypes.includes(file.type)) return "รองรับเฉพาะไฟล์ PDF, PNG, JPG";
        if (file.size > EVIDENCE.maxBytes) return `ไฟล์ต้องมีขนาดไม่เกิน ${EVIDENCE.maxBytes / 1024 / 1024} MB`;
        return null;
    }

    
    async function openEvidence(key) {
        const w = window.open("about:blank", "_blank");          
        try {
            const url = await impl.getEvidenceUrl(key);
            if (w) { w.opener = null; w.location.href = url; } else { window.location.href = url; }
        } catch (e) {
            w?.close();
            toast(e.message, "error");
        }
    }

    return { ...impl, validateEvidenceFile, openEvidence, isMock };
})();