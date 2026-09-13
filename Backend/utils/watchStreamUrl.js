const ALLOWED_PROTOCOLS = new Set(['rtsp:', 'rtsps:', 'http:', 'https:']);

/**
 * Optional shop camera URL for the local edge runner.
 * Rejects javascript:, file://, and local disk paths.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
const sanitizeStreamUrl = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (text.length > 500) return null;
  if (/^(javascript|data|blob|file):/i.test(text)) return null;
  if (/^[a-zA-Z]:[\\/]/.test(text) || text.includes('\\')) return null;
  if (text.startsWith('./') || text.startsWith('../')) return null;
  if (text.includes('..')) return null;
  try {
    const parsed = new URL(text);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
    return text;
  } catch {
    return null;
  }
};

module.exports = { sanitizeStreamUrl };
