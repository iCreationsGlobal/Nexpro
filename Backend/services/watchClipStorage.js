const crypto = require('crypto');
const { MAX_CLIP_BYTES } = require('../config/watchConstants');

/**
 * Where ABS Watch incident clips are stored.
 *  - "presigned": an S3-compatible bucket (Cloudflare R2, AWS S3, …) configured via WATCH_STORAGE_*.
 *    The agent uploads straight to the bucket with a short-lived signed URL, so clips never pass
 *    through the API (Vercel caps request bodies at ~4.5 MB). Viewing uses short-lived signed URLs.
 *    Set a lifecycle rule on the bucket to delete `watch/` objects after your retention period.
 *  - "direct": a server with a disk (self-hosted / local dev) accepts the upload itself.
 *  - "disabled": serverless without a bucket. Events still flow; incidents just have no clip.
 */
const STORAGE_PREFIX = 'storage:';
const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const VIEW_URL_TTL_SECONDS = 60 * 60;
const CLIP_CONTENT_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm' };

const storageConfig = () => ({
  bucket: process.env.WATCH_STORAGE_BUCKET,
  endpoint: process.env.WATCH_STORAGE_ENDPOINT,
  region: process.env.WATCH_STORAGE_REGION || 'auto',
  accessKeyId: process.env.WATCH_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.WATCH_STORAGE_SECRET_ACCESS_KEY,
});

const isBucketConfigured = () => {
  const config = storageConfig();
  return Boolean(config.bucket && config.accessKeyId && config.secretAccessKey);
};

const isServerless = () => !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/** @returns {'presigned'|'direct'|'disabled'} */
const clipUploadMode = () => {
  if (isBucketConfigured()) return 'presigned';
  return isServerless() ? 'disabled' : 'direct';
};

let s3Client = null;
const getS3Client = () => {
  if (!s3Client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    const config = storageConfig();
    s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      // R2/MinIO-style endpoints need path-style addressing
      forcePathStyle: Boolean(config.endpoint),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }
  return s3Client;
};

/**
 * Where the agent should send a clip.
 * @param {{ tenantId: string, cameraId?: string|null, contentType?: string, sizeBytes?: number }} args
 */
const createClipUpload = async ({ tenantId, cameraId = null, contentType = 'video/mp4', sizeBytes } = {}) => {
  const mode = clipUploadMode();
  if (mode !== 'presigned') return { mode, maxBytes: MAX_CLIP_BYTES };

  const type = CLIP_CONTENT_TYPES[contentType] ? contentType : 'video/mp4';
  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_CLIP_BYTES) {
    return { mode, error: 'Clip size must be between 1 byte and the 30 MB limit.', maxBytes: MAX_CLIP_BYTES };
  }

  const cameraPart = String(cameraId || 'camera').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40) || 'camera';
  const key = `watch/${tenantId}/${Date.now()}-${cameraPart}-${crypto.randomBytes(4).toString('hex')}.${CLIP_CONTENT_TYPES[type]}`;
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  // Signing ContentLength makes the bucket reject anything but the declared (size-checked) clip
  const uploadUrl = await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({ Bucket: storageConfig().bucket, Key: key, ContentType: type, ContentLength: size }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS }
  );
  return {
    mode,
    method: 'PUT',
    uploadUrl,
    headers: { 'Content-Type': type, 'Content-Length': String(size) },
    clipReference: `${STORAGE_PREFIX}${key}`,
    maxBytes: MAX_CLIP_BYTES,
  };
};

const isStoredClipReference = (clipReference) =>
  typeof clipReference === 'string' && clipReference.startsWith(STORAGE_PREFIX);

/**
 * Turn a stored clip reference into a short-lived URL the browser/app can play.
 * Other references (YouTube, http(s), /uploads/…) pass through unchanged.
 * @param {string|null|undefined} clipReference
 * @returns {Promise<string|null>}
 */
const resolveClipUrl = async (clipReference) => {
  if (!isStoredClipReference(clipReference)) return clipReference || null;
  if (!isBucketConfigured()) return null;
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: storageConfig().bucket, Key: clipReference.slice(STORAGE_PREFIX.length) }),
    { expiresIn: VIEW_URL_TTL_SECONDS }
  );
};

module.exports = {
  STORAGE_PREFIX,
  clipUploadMode,
  createClipUpload,
  isBucketConfigured,
  isStoredClipReference,
  resolveClipUrl,
};
