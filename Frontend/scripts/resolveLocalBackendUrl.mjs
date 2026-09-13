/**
 * Find the local ABS backend for Vite dev proxy (macOS often uses :5000 for AirPlay).
 * @module resolveLocalBackendUrl
 */
import http from 'node:http';

/** Prefer 5002 before 5001 — on some Macs :5001 is occupied by unrelated Python apps. */
const PREFERRED_LOCAL_PORTS = [5002, 5001, 5000];
const PROBE_PORTS = [
  ...PREFERRED_LOCAL_PORTS,
  5003,
  5004,
  5005,
  5006,
  5007,
  5008,
  5009,
  5010,
];
const FALLBACK_ORIGIN = 'http://127.0.0.1:5002';

/**
 * @param {number} port
 * @param {string} [host]
 * @returns {Promise<boolean>}
 */
export function probeBackendHealth(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: host,
        port,
        path: '/health',
        method: 'GET',
        timeout: 500,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve(
              res.statusCode === 200 &&
                json?.success === true &&
                String(json?.message || '')
                  .toLowerCase()
                  .includes('running')
            );
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * @param {string} origin
 * @returns {Promise<boolean>}
 */
export async function probeBackendOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    if (!port) return false;
    return probeBackendHealth(port, parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * @param {string} hostname
 * @returns {boolean}
 */
const isLocalHostname = (hostname) =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname.startsWith('192.168.');

const PRODUCTION_API_HOSTS = new Set(['api.africanbusinesssuite.com']);

/** Long POSTs that must not trigger a proxy port flap. */
export const LONG_WATCH_PROXY_PATHS = [
  '/api/watch/clips/process',
  '/api/watch/demo-clip',
];

/**
 * @param {string} [url]
 * @returns {boolean}
 */
export function isLongWatchProxyPath(url) {
  const path = String(url || '').split('?')[0];
  return path.includes('/watch/clips/process') || path.includes('/watch/demo-clip');
}

/**
 * @param {Error|{ code?: string, message?: string }} [err]
 * @returns {boolean}
 */
export function isTransientProxyError(err) {
  const code = err?.code;
  const message = String(err?.message || '');
  return (
    code === 'ECONNRESET'
    || code === 'ETIMEDOUT'
    || code === 'EPIPE'
    || /socket hang up|timed out|timeout/i.test(message)
  );
}

/**
 * Hang-up on Watch detect must not retarget 5001↔5002. Only ECONNREFUSED / dead backend should.
 *
 * @param {{ err?: Error, reqUrl?: string }} args
 * @returns {boolean}
 */
export function shouldRetargetAfterProxyError({ err, reqUrl } = {}) {
  if (isLongWatchProxyPath(reqUrl)) return false;
  if (isTransientProxyError(err)) return false;
  return true;
}

/**
 * Resolve the backend origin for local development (Vite proxy target).
 * @param {{ envUrl?: string }} [options]
 * @returns {Promise<string>}
 */
export async function resolveLocalBackendUrl({ envUrl } = {}) {
  if (envUrl) {
    try {
      let normalized = envUrl.trim().replace(/\/$/, '').replace(/\/api\/?$/i, '');
      if (normalized && !/^https?:\/\//i.test(normalized)) {
        const localhostLike = /^(localhost|127(?:\.\d{1,3}){3}|192\.168\.)/i.test(normalized);
        normalized = `${localhostLike ? 'http' : 'https'}://${normalized}`;
      }
      const parsed = new URL(normalized);
      if (!PRODUCTION_API_HOSTS.has(parsed.hostname) && isLocalHostname(parsed.hostname)) {
        const port = Number(parsed.port || 80);
        if (port && (await probeBackendHealth(port, parsed.hostname))) {
          return parsed.origin;
        }
      }
    } catch {
      // fall through to port scan
    }
  }

  for (const port of PROBE_PORTS) {
    if (await probeBackendHealth(port)) {
      return `http://127.0.0.1:${port}`;
    }
  }

  return FALLBACK_ORIGIN;
}
