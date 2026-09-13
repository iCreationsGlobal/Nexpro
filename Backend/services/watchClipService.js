const path = require('path');
const fs = require('fs');
const { VisionIncident } = require('../models');
const { baseUploadDir, ensureDirExists } = require('../middleware/upload');
const { copyForKind } = require('./watchMatching');
const { sanitizeClipReference } = require('../utils/watchClipReference');
const {
  ALLOWED_CLIP_MIMES,
  ALLOWED_CLIP_EXTENSIONS,
  MAX_CLIP_BYTES,
} = require('../config/watchConstants');

const isServerless = () => !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/**
 * @param {{ originalname?: string, mimetype?: string, size?: number }|null|undefined} file
 * @returns {boolean}
 */
const isAllowedWatchClip = (file) => {
  if (!file) return false;
  const mime = String(file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimeOk = ALLOWED_CLIP_MIMES.includes(mime);
  const extOk = ALLOWED_CLIP_EXTENSIONS.includes(ext);
  return mimeOk || extOk;
};

/**
 * Write a short shop clip under uploads/watch/{tenantId}/ and return a same-origin URL.
 *
 * @param {{ tenantId: string, file: { originalname?: string, mimetype?: string, size?: number, buffer?: Buffer } }} args
 * @returns {Promise<{ success: boolean, data?: { clipUrl: string, clipReference: string }, error?: string }>}
 */
const saveWatchClip = async ({ tenantId, file } = {}) => {
  if (!tenantId) {
    return { success: false, error: 'tenantId is required' };
  }
  if (!file) {
    return { success: false, error: 'Choose a short MP4 or WebM clip.' };
  }
  if (isServerless()) {
    return { success: false, error: 'Watch clips need disk storage on this server.' };
  }
  if (file.size && file.size > MAX_CLIP_BYTES) {
    return { success: false, error: 'Clip is too large. Use a short clip up to 30 MB.' };
  }
  if (!isAllowedWatchClip(file)) {
    return { success: false, error: 'Use a short MP4 or WebM clip (max 30 MB).' };
  }
  if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
    return { success: false, error: 'Clip file is missing.' };
  }

  const ext = ALLOWED_CLIP_EXTENSIONS.includes(path.extname(file.originalname || '').toLowerCase())
    ? path.extname(file.originalname).toLowerCase()
    : '.mp4';
  const stem = String(file.originalname || 'clip')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9.\-_]/g, '_')
    .slice(0, 60) || 'clip';
  const filename = `${Date.now()}-${stem}${ext}`;
  const subDir = path.join('watch', tenantId);
  const uploadPath = path.join(baseUploadDir, subDir);
  ensureDirExists(uploadPath);
  fs.writeFileSync(path.join(uploadPath, filename), file.buffer);

  const clipUrl = `/uploads/watch/${tenantId}/${filename}`;
  return { success: true, data: { clipUrl, clipReference: clipUrl } };
};

/**
 * Set clipReference on an existing incident after a Review attach.
 *
 * @param {{ tenantId: string, incidentId: string, clipReference: string }} args
 */
const attachIncidentClip = async ({ tenantId, incidentId, clipReference } = {}) => {
  const sanitized = sanitizeClipReference(clipReference, { tenantId });
  if (!sanitized) {
    return { success: false, error: 'Clip must be a YouTube id, http(s) URL, or an uploaded Watch clip.' };
  }
  if (!incidentId) {
    return { success: false, error: 'Incident is required' };
  }

  const incident = await VisionIncident.findOne({ where: { id: incidentId, tenantId } });
  if (!incident) {
    return { success: false, error: 'Incident not found' };
  }

  await incident.update({ clipReference: sanitized });
  const plain = incident.toJSON ? incident.toJSON() : incident;
  return {
    success: true,
    data: {
      ...plain,
      copy: copyForKind(plain.kind),
    },
  };
};

module.exports = {
  isAllowedWatchClip,
  saveWatchClip,
  attachIncidentClip,
};
