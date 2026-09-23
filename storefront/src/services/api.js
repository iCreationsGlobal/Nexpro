import axios from 'axios';

/** Local backend URL used when VITE_API_DIRECT=true without a VITE_API_URL override. */
const LOCAL_API_URL = 'http://localhost:5002';
const ABS_API_URL = 'https://api.africanbusinesssuite.com';
const PRODUCTION_API_HOSTS = new Set(['api.africanbusinesssuite.com']);

const normalizeEnvApiUrl = (envUrl) => {
  if (!envUrl) return '';
  let url = envUrl.trim().replace(/\/$/, '').replace(/\/api\/?$/i, '');
  if (url && !/^https?:\/\//i.test(url)) {
    const localhostLike = /^(localhost|127(?:\.\d{1,3}){3}|192\.168\.)/i.test(url);
    url = `${localhostLike ? 'http' : 'https'}://${url}`;
  }
  return url;
};

const isLocalHost = (hostname) => (
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname.startsWith('192.168.')
);

const getUrlHostname = (url) => {
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProtocol).hostname;
  } catch {
    return '';
  }
};

const isProductionApiUrl = (url) => PRODUCTION_API_HOSTS.has(getUrlHostname(url));

/**
 * Use same-origin /api in dev so Vite can proxy to the correct local backend port.
 * Avoids CORS and macOS AirPlay occupying port 5000 when the backend binds to 5001+.
 */
const useViteDevProxy = () => (
  import.meta.env.DEV && import.meta.env.VITE_API_DIRECT !== 'true'
);

const resolveLocalDevApiBaseUrl = (envUrl) => {
  if (useViteDevProxy()) {
    return '';
  }

  if (!envUrl) {
    return LOCAL_API_URL;
  }

  const normalized = normalizeEnvApiUrl(envUrl);
  if (isProductionApiUrl(normalized)) {
    console.warn(
      `[API] VITE_API_URL points at production (${normalized}) during local dev; using ${LOCAL_API_URL}.`
    );
    return LOCAL_API_URL;
  }

  return normalized || LOCAL_API_URL;
};

const deriveApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  if (isLocalHost(hostname)) {
    return resolveLocalDevApiBaseUrl(envUrl);
  }

  if (envUrl) {
    return normalizeEnvApiUrl(envUrl);
  }

  // Non-local hosts (including custom merchant domains like www.gapconnects.com) must
  // use the API origin. Vercel SPA rewrites turn relative /uploads into index.html, so
  // resolveImageUrl (heroes, products, logos) needs an absolute API base.
  return ABS_API_URL;
};

export const API_BASE_URL = deriveApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL ? `${API_BASE_URL}/api` : '/api',
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  timeout: 30000,
});

let hasDispatchedSessionExpired = false;

const isPublicAuthPath = (url = '') => (
  url.includes('/public/storefront/auth/login') ||
  url.includes('/public/storefront/auth/register') ||
  url.includes('/public/storefront/auth/google') ||
  url.includes('/public/storefront/auth/send-login-otp') ||
  url.includes('/public/storefront/auth/verify-login-otp') ||
  url.includes('/public/storefront/auth/verify-email') ||
  url.includes('/public/storefront/auth/resend-verification') ||
  url.includes('/public/storefront/auth/forgot-password') ||
  url.includes('/public/storefront/auth/reset-password') ||
  url.includes('/auth/config')
);

const getCurrentReturnTo = () => {
  if (typeof window === 'undefined') return '/';
  const path = `${window.location.pathname}${window.location.search || ''}`;
  return path.startsWith('/login') || path.startsWith('/signup') ? '/' : path;
};

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined'
    ? window.localStorage.getItem('sabito_storefront_token')
    : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    const host = (window.location.hostname || '').toLowerCase();
    const isAbsOnlineStoreHost = (
      host === 'store.absghana.com'
      || host === 'www.store.absghana.com'
      || host === 'store.africanbusinesssuite.com'
    );
    const isOnlineStorePath = path.startsWith('/shop/') || path === '/shop' || path.startsWith('/template/');
    let hasOnlineStoreSession = false;
    try {
      hasOnlineStoreSession = Boolean(window.sessionStorage?.getItem('sabito_online_store_session'));
    } catch {
      hasOnlineStoreSession = false;
    }
    const channel = (isAbsOnlineStoreHost || isOnlineStorePath || hasOnlineStoreSession)
      ? 'online_store'
      : 'sabito_marketplace';
    config.headers['X-Storefront-Channel'] = channel;

    // Shopper auth emails (codes, password reset) are branded with the store's name,
    // so tell the API which Online Store the shopper is on.
    const isAuthPost = String(config.method || '').toLowerCase() === 'post'
      && String(config.url || '').includes('/public/storefront/auth/');
    const body = config.data;
    const isPlainBody = body && typeof body === 'object' && !(typeof FormData !== 'undefined' && body instanceof FormData);
    if (channel === 'online_store' && isAuthPost && isPlainBody && !body.storeSlug) {
      const pathParts = path.split('/').filter(Boolean);
      const pathSlug = pathParts[0] === 'shop' ? pathParts[1] : null;
      let sessionSlug = null;
      try {
        sessionSlug = JSON.parse(window.sessionStorage?.getItem('sabito_online_store_session') || 'null')?.slug || null;
      } catch {
        sessionSlug = null;
      }
      const storeSlug = pathSlug || sessionSlug;
      if (storeSlug) config.data = { ...body, storeSlug };
    }
  }

  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (typeof config.headers?.delete === 'function') {
      config.headers.delete('Content-Type');
      config.headers.delete('content-type');
    } else if (config.headers) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 401 && !isPublicAuthPath(url) && !hasDispatchedSessionExpired) {
      const token = typeof window !== 'undefined'
        ? window.localStorage.getItem('sabito_storefront_token')
        : null;
      if (token) {
        hasDispatchedSessionExpired = true;
        window.dispatchEvent(new CustomEvent('sabito-storefront:session-expired', {
          detail: {
            message: 'Your shopper session expired. Sign in again to continue.',
            returnTo: getCurrentReturnTo(),
          },
        }));
      }
    }
    return Promise.reject(error);
  },
);

export default api;
