const YOUTUBE_PREFIX = /^youtube:([\w-]{11})$/i;
const VIDEO_ID = /^[\w-]{11}$/;

/**
 * Persistable clipReference: youtube:id, http(s) URL, or /uploads/watch/{tenantId}/file.
 * Rejects file://, local disk paths, and other tenants' upload folders.
 *
 * @param {string|null|undefined} raw
 * @param {{ tenantId?: string }} [options]
 * @returns {string|null}
 */
const sanitizeClipReference = (raw, { tenantId } = {}) => {
  const text = String(raw || '').trim();
  if (!text || text.length > 255) return null;
  if (/^(file|javascript|data|blob):/i.test(text)) return null;
  if (/^[a-zA-Z]:[\\/]/.test(text) || text.includes('\\')) return null;
  if (text.startsWith('./') || text.startsWith('../')) return null;
  if (text.includes('..')) return null;

  const prefixed = text.match(YOUTUBE_PREFIX);
  if (prefixed) return `youtube:${prefixed[1]}`;
  if (VIDEO_ID.test(text)) return `youtube:${text}`;

  if (/^https?:\/\//i.test(text)) {
    try {
      const parsed = new URL(text);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return text;
    } catch {
      return null;
    }
  }

  if (text.startsWith('/uploads/watch/')) {
    if (tenantId && !text.startsWith(`/uploads/watch/${tenantId}/`)) return null;
    if (!/^\/uploads\/watch\/[^/]+\/[^/]+$/.test(text)) return null;
    return text;
  }

  return null;
};

/**
 * Apply a batch clip URL to events that do not already have a persistable clipReference.
 * Existing youtube:… or http(s) values are kept.
 *
 * @param {object[]} events
 * @param {string|null|undefined} batchClipReference
 * @param {{ tenantId?: string }} [options]
 * @returns {object[]}
 */
const applyBatchClipReference = (events, batchClipReference, options = {}) => {
  const batch = sanitizeClipReference(batchClipReference, options);
  return (Array.isArray(events) ? events : []).map((event) => {
    if (!event || typeof event !== 'object') return event;
    const existing = sanitizeClipReference(
      event.clipReference || event.clip_reference,
      options
    );
    if (existing) {
      return { ...event, clipReference: existing };
    }
    if (!batch) return event;
    return { ...event, clipReference: batch };
  });
};

module.exports = {
  sanitizeClipReference,
  applyBatchClipReference,
};
