// Issue 5.2: ทดสอบว่า Throttling ทำงาน — ยิง request พร้อมกันแล้วนับจำนวน 429
// ใช้: node infra/load-test.mjs [url] [total] [concurrency]
//   ค่า default ยิง GET /profiles (public endpoint) 200 ครั้ง พร้อมกัน 50
//   ถ้าต้องการทดสอบ endpoint ที่ต้อง login ให้ตั้ง TOKEN=<id_token> และ API_KEY=<key> (ถ้าบังคับ)
const url = process.argv[2] || 'https://qzleoa96f4.execute-api.us-east-1.amazonaws.com/prod/profiles';
const total = Number(process.argv[3] || 200);
const concurrency = Number(process.argv[4] || 50);

const headers = {};
if (process.env.TOKEN) headers.Authorization = `Bearer ${process.env.TOKEN}`;
if (process.env.API_KEY) headers['x-api-key'] = process.env.API_KEY;

const counts = new Map();
let sent = 0;
const started = Date.now();

async function worker() {
  while (sent < total) {
    sent++;
    let status;
    try {
      status = (await fetch(url, { headers })).status;
    } catch {
      status = 'network_error';
    }
    counts.set(status, (counts.get(status) || 0) + 1);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

const secs = (Date.now() - started) / 1000;
console.log(`${total} requests in ${secs.toFixed(1)}s (${(total / secs).toFixed(1)} rps) -> ${url}`);
for (const [status, n] of [...counts].sort()) console.log(`  HTTP ${status}: ${n}`);
console.log(counts.get(429) ? 'PASS: throttling active (got 429)' : 'NOTE: no 429 — limit not reached or throttling not applied');
