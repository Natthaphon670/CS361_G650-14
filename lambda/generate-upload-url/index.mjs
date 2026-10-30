import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({});
const BUCKET = process.env.EVIDENCE_BUCKET;
// Upload links are also bearer credentials, so enforce the same short lifetime.
const configuredTtl = Number(process.env.UPLOAD_URL_TTL_SECONDS);
const URL_TTL_SECONDS = Number.isFinite(configuredTtl) ? Math.trunc(configuredTtl) : 300;
const MIN_URL_TTL_SECONDS = 120;
const MAX_URL_TTL_SECONDS = 300;
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 10485760);
const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

const response = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

function claimsFrom(event) {
  // API Gateway HTTP API JWT authorizer validates signature, issuer, expiry and audience.
  return event?.requestContext?.authorizer?.jwt?.claims || {};
}

function safeFilename(name) {
  const base = String(name || 'evidence').split(/[\\/]/).pop();
  const safe = base.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^\.+/, '').slice(0, 120);
  return safe || 'evidence';
}

export const handler = async (event) => {
  try {
    if (!BUCKET) return response(500, { message: 'เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง' });
    const claims = claimsFrom(event);
    const tokenFacultyId = claims['custom:faculty_id'] || claims.faculty_id;
    if (!claims.sub || !tokenFacultyId) {
      return response(403, { message: 'Token must contain a verified faculty_id claim' });
    }

    let input;
    try { input = JSON.parse(event.body || '{}'); }
    catch { return response(400, { message: 'Request body must be valid JSON' }); }

    const facultyId = String(input.faculty_id || '');
    const termId = String(input.term_id || '');
    const fileName = safeFilename(input.file_name);
    const contentType = String(input.content_type || '').toLowerCase();
    const size = Number(input.size);

    // BOLA protection: the client cannot request a key for another faculty member.
    if (facultyId !== String(tokenFacultyId)) return response(403, { message: 'You may upload evidence only for your own faculty profile' });
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(facultyId)) return response(400, { message: 'Invalid faculty_id' });
    if (!/^[A-Za-z0-9#_-]{1,80}$/.test(termId)) return response(400, { message: 'Invalid term_id' });
    if (!ALLOWED_TYPES.has(contentType)) return response(400, { message: 'Only PDF, PNG and JPEG files are allowed' });
    if (!Number.isFinite(size) || size < 1 || size > MAX_FILE_BYTES) return response(400, { message: `File size must be between 1 and ${MAX_FILE_BYTES} bytes` });

    const key = `evidence/${facultyId}/${termId}/${randomUUID()}-${fileName}`;
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType
    });
    const expiresIn = Math.min(Math.max(URL_TTL_SECONDS, MIN_URL_TTL_SECONDS), MAX_URL_TTL_SECONDS);
    const upload_url = await getSignedUrl(s3, command, { expiresIn });
    return response(200, { upload_url, key, expires_in: expiresIn });
  } catch (error) {
    console.error('GenerateUploadUrl failed', { name: error?.name, message: error?.message });
    return response(500, { message: 'เกิดข้อผิดพลาดในการสร้างลิงก์อัปโหลด กรุณาลองใหม่อีกครั้ง' });
  }
};
