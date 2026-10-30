import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({});
const BUCKET = process.env.EVIDENCE_BUCKET;
// Keep evidence links short-lived even if an unsafe value is supplied through
// the environment. The hard upper bound is the security control.
const configuredTtl = Number(process.env.DOWNLOAD_URL_TTL_SECONDS);
const URL_TTL_SECONDS = Number.isFinite(configuredTtl) ? Math.trunc(configuredTtl) : 300;
const MIN_URL_TTL_SECONDS = 120;
const MAX_URL_TTL_SECONDS = 300;
const response = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});
const claimsFrom = event => event?.requestContext?.authorizer?.jwt?.claims || {};
function groupsFrom(claims) {
  const raw = claims['cognito:groups'] || [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; } catch {}
    return raw.split(',').map(x => x.trim()).filter(Boolean);
  }
  return [];
}

export const handler = async (event) => {
  try {
    if (!BUCKET) return response(500, { message: 'เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง' });
    const claims = claimsFrom(event);
    if (!claims.sub) return response(401, { message: 'Authentication required' });
    const key = String(event?.queryStringParameters?.key || '');
    if (!key || key.length > 1024 || key.startsWith('/') || key.includes('..') || !key.startsWith('evidence/')) {
      return response(400, { message: 'Invalid evidence key' });
    }

    const groups = groupsFrom(claims);
    const isReviewer = groups.some(g => ['Staff', 'Admin'].includes(g));
    const facultyId = claims['custom:faculty_id'] || claims.faculty_id;
    // BOLA: faculty users may request only keys in their own prefix. Staff/Admin may review any faculty's evidence.
    if (!isReviewer && (!facultyId || !key.startsWith(`evidence/${facultyId}/`))) {
      return response(403, { message: 'You do not have permission to view this evidence' });
    }

    // Do not mint links for keys that do not exist. IAM still restricts this Lambda to this bucket/prefix.
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    const expiresIn = Math.min(Math.max(URL_TTL_SECONDS, MIN_URL_TTL_SECONDS), MAX_URL_TTL_SECONDS);
    const download_url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
    return response(200, { download_url, key, expires_in: expiresIn });
  } catch (error) {
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) return response(404, { message: 'Evidence file not found' });
    console.error('GenerateDownloadUrl failed', { name: error?.name, message: error?.message });
    return response(500, { message: 'เกิดข้อผิดพลาดในการสร้างลิงก์ดาวน์โหลด กรุณาลองใหม่อีกครั้ง' });
  }
};
