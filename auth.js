// auth.js
const AUTH_CONFIG = {
    useMock: true,
    cognitoDomain: "https://<your-domain>.auth.ap-southeast-1.amazoncognito.com",
    clientId: "<YOUR_CLIENT_ID>",
    redirectUri: window.location.origin + "/index.html",
    apiBaseUrl: "https://<your-api-id>.execute-api.ap-southeast-1.amazonaws.com/prod"
};

// แก้ไขชื่อให้ตรงตามหน้าบัตรจริง: ผศ.ดร.ลัมพาพรรณ พันธ์ชูจิตร์
const MOCK_USERS = {
    prof_001: {
        username: "lumpapun",
        name: "ผศ.ดร.ลัมพาพรรณ พันธ์ชูจิตร์",
        groups: ["Faculty"],
        faculty_id: "prof_001",
        aliases: ["prof_001", "prof_img_001", "ผศ.ดร.ลัมพาพรรณ พันธ์ชูจิตร์"]
    },
    prof_002: {
        username: "prapaporn",
        name: "ผศ.ดร.ประภาพร รัตนธำรง",
        groups: ["Faculty"],
        faculty_id: "prof_002",
        aliases: ["prof_002", "prof_img_002", "ผศ.ดร.ประภาพร รัตนธำรง"]
    },
    prof_003: {
        username: "songsakdi",
        name: "ผศ.ดร.ทรงศักดิ์ รองวิริยะพานิช",
        groups: ["Faculty"],
        faculty_id: "prof_003",
        aliases: ["prof_003", "prof_img_003", "ผศ.ดร.ทรงศักดิ์ รองวิริยะพานิช"]
    },
    staff: {
        username: "staff_cs",
        name: "เจ้าหน้าที่ภาควิชา (Staff)",
        groups: ["Staff"],
        faculty_id: null
    },
    admin: {
        username: "admin_dean",
        name: "หัวหน้าภาควิชา (Admin)",
        groups: ["Admin"],
        faculty_id: null
    }
};

const Auth = {
    loginMock(key) {
        const user = MOCK_USERS[key];
        if (user) {
            sessionStorage.setItem("auth_user", JSON.stringify(user));
            sessionStorage.setItem("access_token", "mock-token-" + Date.now());
            window.location.reload();
        }
    },

    logout() {
        sessionStorage.removeItem("auth_user");
        sessionStorage.removeItem("access_token");
        window.location.reload();
    },

    getUser() {
        const u = sessionStorage.getItem("auth_user");
        return u ? JSON.parse(u) : null;
    },

    hasRole(roles = []) {
        const user = this.getUser();
        if (!user || !user.groups) return false;
        return user.groups.some(r => roles.includes(r));
    },

    // เช็คสิทธิ์ Ownership ยืดหยุ่น รองรับทั้ง prof_001, prof_img_001 และชื่อภาษาไทย
    isOwner(facultyId) {
        const user = this.getUser();
        if (!user || !user.faculty_id) return false;
        
        const target = String(facultyId || "").trim().toLowerCase();
        const userFacId = String(user.faculty_id).trim().toLowerCase();
        
        if (target === userFacId) return true;
        if (target.replace("prof_img_", "prof_") === userFacId.replace("prof_img_", "prof_")) return true;
        if (user.aliases && user.aliases.some(a => a.toLowerCase() === target)) return true;
        
        return false;
    },

    requireAuth(roles = []) {
        const user = this.getUser();
        if (!user) {
            alert("กรุณาเข้าสู่ระบบก่อน");
            window.location.href = "index.html";
            return false;
        }
        if (roles.length > 0 && !this.hasRole(roles)) {
            alert("คุณไม่มีสิทธิ์เข้าถึงหน้านี้");
            window.location.href = "index.html";
            return false;
        }
        return true;
    },

    renderNav() {
        const container = document.getElementById("auth-header-slot");
        if (!container) return;

        const user = this.getUser();
        const isStaffOrAdmin = this.hasRole(["Staff", "Admin"]);

        container.innerHTML = `
            <div class="tu-auth-bar" style="background:#fff; border-bottom:2px solid #ffc72c; padding:0.6rem 1.5rem; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:1.5rem;">
                    <a href="index.html" style="font-weight:700; color:#c51a2e; text-decoration:none;">🏛️ ภาควิชาวิทยาการคอมพิวเตอร์ มธ.</a>
                    <a href="index.html" style="color:#475569; text-decoration:none; font-size:0.9rem;">รายชื่อคณาจารย์</a>
                    ${isStaffOrAdmin ? '<a href="dashboard.html" style="color:#c51a2e; font-weight:700; text-decoration:none; font-size:0.9rem;">📊 Dashboard ตรวจสอบภาระงาน</a>' : ''}
                </div>

                <div style="display:flex; align-items:center; gap:0.6rem;">
                    ${user ? `
                        <span style="font-size:0.85rem; background:#fdf2f2; color:#c51a2e; padding:4px 10px; border-radius:20px; border:1px solid #fecaca;">
                            👤 <b>${user.name}</b> (${user.groups[0]})
                        </span>
                        <button onclick="Auth.logout()" class="tu-btn-outline-sm" style="cursor:pointer; padding:4px 8px;">ออกจากระบบ</button>
                    ` : `
                        <span style="font-size:0.8rem; color:#64748b;">จำลองเข้าสู่ระบบ:</span>
                        <select id="mock-role-input" style="padding:4px; font-size:0.85rem; border-radius:4px; border:1px solid #cbd5e1;">
                            <option value="prof_001">ผศ.ดร.ลัมพาพรรณ (prof_001)</option>
                            <option value="prof_002">ผศ.ดร.ประภาพร (prof_002)</option>
                            <option value="prof_003">ผศ.ดร.ทรงศักดิ์ (prof_003)</option>
                            <option value="staff">เจ้าหน้าที่ตรวจงาน (Staff)</option>
                            <option value="admin">หัวหน้าภาควิชา (Admin)</option>
                        </select>
                        <button onclick="Auth.loginMock(document.getElementById('mock-role-input').value)" class="tu-btn tu-btn-sm" style="cursor:pointer; padding:4px 12px; background:#c51a2e; color:#fff; border:none; border-radius:4px;">Login</button>
                    `}
                </div>
            </div>
        `;
    }
};

document.addEventListener("DOMContentLoaded", () => Auth.renderNav());