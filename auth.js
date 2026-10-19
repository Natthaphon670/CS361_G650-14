

const MOCK_USERS = {
    prof_001: { username: "lumpapun", name: "ผศ.ดร.ลัมพาพรรณ พันธ์ชูจิตร์", groups: ["Faculty"], faculty_id: "prof_001" },
    prof_002: { username: "prapaporn", name: "ผศ.ดร.ประภาพร รัตนธำรง", groups: ["Faculty"], faculty_id: "prof_002" },
    prof_003: { username: "songsakdi", name: "ผศ.ดร.ทรงศักดิ์ รองวิริยะพานิช", groups: ["Faculty"], faculty_id: "prof_003" },
    prof_004: { username: "kasidit", name: "ผศ.ดร.กษิดิศ ชาญเชี่ยว", groups: ["Faculty"], faculty_id: "prof_004" },
    staff: { username: "staff_cs", name: "เจ้าหน้าที่ภาควิชา (Staff)", groups: ["Staff"], faculty_id: null },
    admin: { username: "admin_dean", name: "หัวหน้าภาควิชา (Admin)", groups: ["Admin"], faculty_id: null }
};

const Auth = (() => {
    const A = APP_CONFIG.auth;
    const isMock = APP_CONFIG.isMock;
    const K_TOKENS = "auth.tokens";
    const K_USER = "auth.mock_user";
    const K_PKCE = "auth.pkce";
    const K_RETURN = "auth.return_to";

    
    const store = {
        get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
        set(k, v) { sessionStorage.setItem(k, JSON.stringify(v)); },
        del(k) { sessionStorage.removeItem(k); }
    };

    function b64url(bytes) {
        let s = "";
        bytes.forEach(b => (s += String.fromCharCode(b)));
        return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    function randomString(len = 64) {
        const a = new Uint8Array(len);
        crypto.getRandomValues(a);
        return b64url(a).slice(0, len);
    }
    async function sha256(str) {
        return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)));
    }

    
    function decodeJwt(token) {
        try {
            const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            const bin = atob(part.padEnd(part.length + (4 - (part.length % 4)) % 4, "="));
            return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
        } catch {
            return null;
        }
    }

    function userFromIdToken(idToken) {
        const p = decodeJwt(idToken);
        if (!p) return null;
        let groups = p["cognito:groups"] || [];
        if (typeof groups === "string") groups = groups.split(",").map(s => s.trim()).filter(Boolean);
        return {
            sub: p.sub,
            username: p["cognito:username"] || p.email || p.sub,
            name: p.name || p.email || p["cognito:username"] || "ผู้ใช้งาน",
            email: p.email || null,
            groups,
            faculty_id: p["custom:faculty_id"] || null
        };
    }

    function tokenValid(t) {
        return !!(t && t.id_token && t.expires_at && Date.now() < t.expires_at - 10_000);
    }

    
    async function login(returnTo = window.location.href) {
        if (isMock) return; 
        if (!window.crypto?.subtle) {
            alert("เบราว์เซอร์นี้ไม่รองรับ Web Crypto (ต้องเปิดผ่าน HTTPS หรือ localhost)");
            return;
        }
        const verifier = randomString(96);
        const state = randomString(32);
        store.set(K_PKCE, { verifier, state });
        store.set(K_RETURN, returnTo);
        const challenge = b64url(await sha256(verifier));
        const url = new URL(`${A.cognitoDomain}/oauth2/authorize`);
        url.search = new URLSearchParams({
            response_type: "code",
            client_id: A.clientId,
            redirect_uri: A.redirectUri,
            scope: A.scope,
            state,
            code_challenge: challenge,
            code_challenge_method: "S256"
        }).toString();
        window.location.assign(url.toString());
    }

    let callbackPromise = null;
    function handleCallback() {
        if (!callbackPromise) callbackPromise = (async () => {
            if (isMock) return;
            const q = new URLSearchParams(window.location.search);
            const code = q.get("code");
            if (!code && !q.get("error")) return;

            const cleanUrl = window.location.origin + window.location.pathname;
            if (q.get("error")) {
                window.history.replaceState({}, "", cleanUrl);
                console.error("Cognito error:", q.get("error"), q.get("error_description"));
                return;
            }
            const pkce = store.get(K_PKCE);
            store.del(K_PKCE);
            if (!pkce || pkce.state !== q.get("state")) {
                window.history.replaceState({}, "", cleanUrl);
                console.error("OAuth state ไม่ตรงกัน — ยกเลิกการ login");
                return;
            }
            try {
                const res = await fetch(`${A.cognitoDomain}/oauth2/token`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        grant_type: "authorization_code",
                        client_id: A.clientId,
                        code,
                        redirect_uri: A.redirectUri,
                        code_verifier: pkce.verifier
                    })
                });
                if (!res.ok) throw new Error(`token endpoint ${res.status}`);
                const t = await res.json();
                store.set(K_TOKENS, {
                    id_token: t.id_token,
                    access_token: t.access_token,
                    expires_at: Date.now() + (Number(t.expires_in) || 3600) * 1000
                });
            } catch (e) {
                console.error("แลก token ไม่สำเร็จ:", e);
            }
            window.history.replaceState({}, "", cleanUrl);
            const back = store.get(K_RETURN);
            store.del(K_RETURN);
            if (back && back !== window.location.href) window.location.replace(back);
        })();
        return callbackPromise;
    }

    
    function getUser() {
        if (isMock) return store.get(K_USER);
        const t = store.get(K_TOKENS);
        if (!tokenValid(t)) { store.del(K_TOKENS); return null; }
        return userFromIdToken(t.id_token);
    }

    
    function getToken() {
        if (isMock) return getUser() ? "mock-token" : null;
        const t = store.get(K_TOKENS);
        if (!tokenValid(t)) return null;
        return A.apiTokenType === "access" ? t.access_token : t.id_token;
    }

    function loginMock(key) {
        const u = MOCK_USERS[key];
        if (!u) return;
        store.set(K_USER, u);
        window.location.reload();
    }

    function logout() {
        store.del(K_TOKENS);
        store.del(K_USER);
        store.del("mock_workloads_v2");      
        store.del("mock_evidence_v1");
        if (isMock) {
            window.location.href = "index.html";
            return;
        }
        const url = new URL(`${A.cognitoDomain}/logout`);
        url.search = new URLSearchParams({ client_id: A.clientId, logout_uri: A.logoutUri }).toString();
        window.location.assign(url.toString());
    }

   
    function hasRole(roles = []) {
        const u = getUser();
        return !!u && (u.groups || []).some(r => roles.includes(r));
    }
    const isStaffOrAdmin = () => hasRole(["Staff", "Admin"]);
    
    function isOwner(facultyId) {
        const u = getUser();
        return !!u && !!u.faculty_id && String(u.faculty_id) === String(facultyId);
    }
    const primaryRole = u => ["Admin", "Staff", "Faculty"].find(r => (u?.groups || []).includes(r)) || (u?.groups?.[0] ?? "ผู้ใช้");

    
    function applyRoleVisibility(root = document) {
        root.querySelectorAll("[data-roles]").forEach(el => {
            const roles = el.dataset.roles.split(/\s+/).filter(Boolean);
            el.hidden = !hasRole(roles);
        });
    }

   
    function showBlocked(title, message, withLogin) {
        const main = document.querySelector("main") || document.body;
        main.innerHTML = `
            <div class="blocked-panel">
                <h2>${escapeHtml(title)}</h2>
                <p>${escapeHtml(message)}</p>
                <div class="blocked-actions">
                    ${withLogin && !isMock ? '<button class="tu-btn" id="blocked-login">เข้าสู่ระบบ</button>' : ""}
                    <a class="tu-btn tu-btn-secondary" href="index.html">กลับหน้ารายชื่ออาจารย์</a>
                </div>
            </div>`;
        document.getElementById("blocked-login")?.addEventListener("click", () => login(window.location.href));
    }

  
    async function guard(roles = []) {
        await ready;
        const u = getUser();
        if (!u) {
            if (!isMock) { await login(window.location.href); return false; }  
            showBlocked("กรุณาเข้าสู่ระบบ", "เลือกผู้ใช้จำลองที่แถบด้านบน แล้วกด Login เพื่อเข้าหน้านี้", false);
            return false;
        }
        if (roles.length && !hasRole(roles)) {
            showBlocked("ไม่มีสิทธิ์เข้าถึงหน้านี้", `หน้านี้สำหรับผู้ใช้กลุ่ม ${roles.join(" / ")} เท่านั้น`, false);
            return false;
        }
        return true;
    }

    
    function renderNav() {
        const slot = document.getElementById("auth-header-slot");
        if (!slot) return;
        const u = getUser();
        const links = [`<a class="tu-nav-item" href="index.html">รายชื่อคณาจารย์</a>`];
        if (u?.faculty_id) {
            links.push(`<a class="tu-nav-item" href="profile.html?id=${encodeURIComponent(u.faculty_id)}">ภาระงานของฉัน</a>`);
        }
        links.push(`<a class="tu-nav-item tu-nav-highlight" data-roles="Staff Admin" href="dashboard.html">📊 จัดการภาพรวมสาขา</a>`);

        let right;
        if (u) {
            right = `
                <span class="tu-user-pill"><span>👤 ${escapeHtml(u.name)}</span><span class="tu-role-badge">${escapeHtml(primaryRole(u))}</span></span>
                <button class="tu-btn-outline-sm" id="btn-logout">ออกจากระบบ</button>`;
        } else if (isMock) {
            right = `
                <span class="tu-mock-label">จำลองเข้าสู่ระบบ:</span>
                <select id="mock-role-input" class="tu-select-sm" aria-label="เลือกผู้ใช้จำลอง">
                    ${Object.entries(MOCK_USERS).map(([k, v]) =>
                        `<option value="${escapeHtml(k)}">${escapeHtml(v.name)}</option>`).join("")}
                </select>
                <button class="tu-btn-primary-sm" id="btn-login-mock">Login</button>`;
        } else {
            right = `<button class="tu-btn-primary-sm" id="btn-login">เข้าสู่ระบบ</button>`;
        }

        slot.innerHTML = `
            <div class="tu-auth-bar"><div class="tu-auth-container">
                <div class="tu-auth-left">
                    <a class="tu-auth-brand" href="index.html">🏛️ ภาควิชาวิทยาการคอมพิวเตอร์ มธ.</a>
                    <nav class="tu-nav-links">${links.join("")}</nav>
                </div>
                <div class="tu-auth-right">${right}</div>
            </div></div>`;

        document.getElementById("btn-logout")?.addEventListener("click", logout);
        document.getElementById("btn-login")?.addEventListener("click", () => login(window.location.href));
        document.getElementById("btn-login-mock")?.addEventListener("click",
            () => loginMock(document.getElementById("mock-role-input").value));
        applyRoleVisibility(slot);
    }

    const ready = handleCallback();
    document.addEventListener("DOMContentLoaded", async () => { await ready; renderNav(); });

    return {
        isMock, ready, login, logout, loginMock, getUser, getToken, hasRole,
        isStaffOrAdmin, isOwner, guard, applyRoleVisibility, renderNav, primaryRole
    };
})();