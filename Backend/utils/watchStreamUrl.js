const ALLOWED_PROTOCOLS = new Set(['rtsp:', 'rtsps:', 'http:', 'https:']);

/**
 * Drop any `user:password@` from a camera stream URL. Camera logins stay on the shop's Watch agent;
 * the cloud only needs the address. Greedy up to the last "@" before the path, because camera
 * passwords often contain a raw "@".
 * @param {string} url
 * @returns {string}
 */
const stripStreamCredentials = (url) => String(url || '').replace(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/]*@/, '$1');

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
    return stripStreamCredentials(text);
  } catch {
    return null;
  }
};

module.exports = { sanitizeStreamUrl, stripStreamCredentials };
