
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] || "dist";
const env = name => {
    const v = (process.env[name] || "").trim();
    if (!v || v === "None") { console.error(`Missing env ${name}`); process.exit(1); }
    return v.replace(/\/$/, "");
};
const cfg = {
    apiUrl: env("API_URL"),
    frontendUrl: env("FRONTEND_URL"),
    clientId: env("CLIENT_ID"),
    cognitoDomain: env("COGNITO_DOMAIN"),
};

// เฉพาะไฟล์ที่หน้าเว็บใช้จริง (ไม่อัปโหลดโค้ด Backend, test, schema)
const WEB_FILE = /\.(html|css|js)$/;
const EXCLUDE = new Set(["workload-repository.js"]);
const DATA_FILES = ["faculties.json", "faculties-workloads-mock.json"];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of readdirSync(".")) {
    if ((WEB_FILE.test(f) && !EXCLUDE.has(f)) || DATA_FILES.includes(f)) cpSync(f, join(out, f));
}
if (existsSync("profile_image")) cpSync("profile_image", join(out, "profile_image"), { recursive: true });

// แทนค่าใน config.js — ล้มเหลวทันทีถ้าหา key ไม่เจอ เพื่อไม่ให้ deploy เว็บที่ชี้ไป API ผิดตัว
let config = readFileSync("config.js", "utf8");
const replace = (pattern, value, label) => {
    if (!pattern.test(config)) { console.error(`config.js: ไม่พบ ${label}`); process.exit(1); }
    config = config.replace(pattern, value);
};
const q = JSON.stringify;
replace(/useMock:\s*(true|false)/, "useMock: false", "useMock");
replace(/cognitoDomain:\s*"[^"]*"/, `cognitoDomain: ${q(cfg.cognitoDomain)}`, "cognitoDomain");
replace(/clientId:\s*"[^"]*"/, `clientId: ${q(cfg.clientId)}`, "clientId");
replace(/logoutUri:\s*"[^"]*"/, `logoutUri: ${q(cfg.frontendUrl + "/index.html")}`, "logoutUri");
replace(/baseUrl:\s*"[^"]*"/, `baseUrl: ${q(cfg.apiUrl)}`, "baseUrl");
writeFileSync(join(out, "config.js"), `// สร้างอัตโนมัติโดย scripts/build-frontend.mjs — ห้ามแก้ไฟล์นี้บน S3\n${config}`);

console.log(`Built ${readdirSync(out).length} entries into ${out}/`);
console.log(cfg);