/**
 * Shared CORS utilities - single source of truth for allowed origins.
 * Used by config (cors middleware), CSRF, and explicit OPTIONS handler.
 *
 * Connected merchant custom domains (online_store_settings.customDomainStatus
 * = 'pending' | 'verified') are also allowed so storefronts on those hosts can
 * call the public resolve-domain + store APIs. Pending is included intentionally:
 * resolveStoreByDomain already serves pending hosts, and without CORS the browser
 * cannot call that API — so the SPA falls through to Sabito marketplace chrome.
 * Admins must still add the domain in Vercel (or the hosting DNS/proxy) manually.
 */

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:5173',
  'http://localhost:4321',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
  'http://127.0.0.1:5173',
  'https://demo.africanbusinesssuite.com',
  'https://myapp.africanbusinesssuite.com',
  'https://africanbusinesssuite.com',
  'https://www.africanbusinesssuite.com',
  'https://absghana.com',
  'https://www.absghana.com',
  'https://store.absghana.com',
  'https://www.store.absghana.com',
  'https://templates.absghana.com',
];

/** In-memory set of https:// / http:// origins for connected (pending|verified) custom domains. */
let verifiedDomainOrigins = new Set();
let verifiedOriginsLastRefresh = 0;
const VERIFIED_ORIGINS_TTL_MS = 5 * 60 * 1000;
let verifiedOriginsRefreshPromise = null;

/**
 * Normalize origin (trim, remove trailing slash)
 * @param {string} o - Raw origin string
 * @returns {string}
 */
const normalize = (o) => (o || '').trim().replace(/\/$/, '');

/**
 * Apex ↔ www host pair for a merchant domain (browsers often hit either).
 * @param {string} host
 * @returns {string[]}
 */
const hostVariants = (host) => {
  const h = String(host || '').trim().toLowerCase().replace(/\.$/, '');
  if (!h) return [];
  const variants = [h];
  if (h.startsWith('www.')) {
    const apex = h.slice(4);
    if (apex) variants.push(apex);
  } else if (h.includes('.')) {
    variants.push(`www.${h}`);
  }
  return [...new Set(variants)];
};

/**
 * Build http/https origin strings for a hostname (includes www/apex variants).
 * @param {string} host
 * @returns {string[]}
 */
const originsForHost = (host) => {
  const out = [];
  for (const h of hostVariants(host)) {
    out.push(`https://${h}`, `http://${h}`);
  }
  return out;
};

/**
 * Refresh the connected-custom-domain origin cache from the DB (pending + verified).
 * Safe to call often; coalesces concurrent refreshes.
 * @returns {Promise<void>}
 */
const refreshVerifiedDomainOrigins = async () => {
  if (verifiedOriginsRefreshPromise) return verifiedOriginsRefreshPromise;

  verifiedOriginsRefreshPromise = (async () => {
    try {
      // Lazy require to avoid circular deps at module load (models ↔ config ↔ cors).
      const { Op } = require('sequelize');
      const { OnlineStoreSettings } = require('../models');
      const rows = await OnlineStoreSettings.findAll({
        where: {
          customDomainStatus: { [Op.in]: ['verified', 'pending'] },
          customDomain: { [Op.ne]: null },
        },
        attributes: ['customDomain'],
        raw: true,
      });
      const next = new Set();
      for (const row of rows) {
        originsForHost(row.customDomain).forEach((o) => next.add(o));
      }
      verifiedDomainOrigins = next;
      verifiedOriginsLastRefresh = Date.now();
    } catch (err) {
      console.error('[CORS] Failed loading custom domain origins:', err?.message || err);
    } finally {
      verifiedOriginsRefreshPromise = null;
    }
  })();

  return verifiedOriginsRefreshPromise;
};

/**
 * Kick a background refresh when the cache is stale (non-blocking for CORS checks).
 */
const maybeRefreshVerifiedDomainOrigins = () => {
  if (Date.now() - verifiedOriginsLastRefresh < VERIFIED_ORIGINS_TTL_MS) return;
  refreshVerifiedDomainOrigins().catch(() => {});
};

/**
 * Get allowed origins from env (CORS_ORIGIN, FRONTEND_URL) + defaults.
 * @returns {string[]}
 */
const getAllowedOrigins = () => {
  const fromEnv = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(normalize).filter(Boolean)
    : [];
  const fromFrontend = process.env.FRONTEND_URL
    ? [normalize(process.env.FRONTEND_URL)]
    : [];
  return [...new Set([...fromEnv, ...fromFrontend, ...DEFAULT_ORIGINS])];
};

/**
 * Check if origin is a LAN address (mobile testing)
 * e.g. http://192.168.0.124:3000 or http://10.0.0.5:3000
 */
const isLanOrigin = (o) => {
  try {
    const u = new URL(o);
    const isPrivate =
      u.hostname.startsWith('192.168.') ||
      u.hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(u.hostname);
    const portOk = !u.port || /^\d+$/.test(u.port);
    return !!(isPrivate && portOk && (u.protocol === 'http:' || u.protocol === 'https:'));
  } catch {
    return false;
  }
};

/**
 * Static / env allowlist checks (no custom-domain DB cache).
 * @param {string} o - Normalized origin
 * @returns {boolean|null} true/false when decided; null when caller should check custom domains
 */
const checkStaticOrigin = (o) => {
  if (!o) return false;
  if (o.includes('vercel.app')) return true;
  if (o.includes('pages.dev')) return true;
  const notProduction = process.env.NODE_ENV !== 'production';
  if (notProduction && (o.includes('localhost') || o.includes('127.0.0.1'))) return true;
  if (notProduction && isLanOrigin(o)) return true;
  if (isLanOrigin(o)) {
    console.warn('[CORS] LAN origin rejected (NODE_ENV=%s). Set NODE_ENV=development for mobile testing: %s', process.env.NODE_ENV, o);
  }
  if (getAllowedOrigins().includes(o)) return true;
  return null;
};

/**
 * Sync check if an origin is allowed. Prefer isOriginAllowedAsync on request paths —
 * this sync variant can false-negative while the custom-domain cache is still loading.
 * @param {string} origin - Request origin
 * @returns {boolean}
 */
const isOriginAllowed = (origin) => {
  if (!origin) return false;
  const o = normalize(origin);
  const staticResult = checkStaticOrigin(o);
  if (staticResult !== null) return staticResult;
  maybeRefreshVerifiedDomainOrigins();
  return verifiedDomainOrigins.has(o);
};

/**
 * Async CORS check: awaits custom-domain cache load on cold start / in-flight refresh
 * before rejecting. Fixes browsers hitting merchant domains right after API restart
 * (sync check returned false → "Not allowed by CORS" → storefront "unavailable").
 * @param {string} origin - Request origin
 * @returns {Promise<boolean>}
 */
const isOriginAllowedAsync = async (origin) => {
  if (!origin) return false;
  const o = normalize(origin);
  const staticResult = checkStaticOrigin(o);
  if (staticResult !== null) return staticResult;

  if (verifiedDomainOrigins.has(o)) {
    maybeRefreshVerifiedDomainOrigins();
    return true;
  }

  const neverLoaded = verifiedOriginsLastRefresh === 0;
  const stale = Date.now() - verifiedOriginsLastRefresh >= VERIFIED_ORIGINS_TTL_MS;
  if (neverLoaded || stale || verifiedOriginsRefreshPromise) {
    await refreshVerifiedDomainOrigins();
  }
  return verifiedDomainOrigins.has(o);
};

/** Headers the web/mobile clients may send (must match Frontend/mobile api interceptors). */
const ALLOWED_CORS_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'x-tenant-id',
  'x-support-session-id',
  'x-studio-location-id',
  'x-shop-id',
  'x-storefront-channel',
  'x-commerce-channel',
  'Accept',
  'Accept-Language',
  'Accept-Encoding',
  'Cache-Control',
  'Pragma',
];

/**
 * CORS headers for preflight (OPTIONS) and normal responses.
 * Only sets Allow-Origin when origin is allowed; always sets Methods/Headers/Credentials/Max-Age.
 * @param {object} res - Express response
 * @param {string} origin - Request Origin header
 * @returns {boolean} - True if origin was allowed and Allow-Origin was set
 */
const setCorsHeaders = (res, origin) => {
  const allowed = !!(origin && isOriginAllowed(origin));
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', normalize(origin));
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_CORS_HEADERS.join(', '));
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  return allowed;
};

/**
 * Async variant of setCorsHeaders — awaits custom-domain cache when needed.
 * @param {object} res - Express response
 * @param {string} origin - Request Origin header
 * @returns {Promise<boolean>}
 */
const setCorsHeadersAsync = async (res, origin) => {
  const allowed = !!(origin && (await isOriginAllowedAsync(origin)));
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', normalize(origin));
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_CORS_HEADERS.join(', '));
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  return allowed;
};

module.exports = {
  getAllowedOrigins,
  isOriginAllowed,
  isOriginAllowedAsync,
  setCorsHeaders,
  setCorsHeadersAsync,
  normalize,
  hostVariants,
  originsForHost,
  ALLOWED_CORS_HEADERS,
  refreshVerifiedDomainOrigins,
};
