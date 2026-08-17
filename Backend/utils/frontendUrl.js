/**
 * Resolve frontend base URL for public links (payment, invites, tracking).
 * Priority:
 * 1) Request origin/referer when it is an allowed ABS app host
 * 2) FRONTEND_URL env
 * 3) Production default (never localhost in production)
 */

const ABS_ALLOWED_HOSTS = new Set([
  'myapp.africanbusinesssuite.com',
  'demo.africanbusinesssuite.com',
  'africanbusinesssuite.com',
  'www.africanbusinesssuite.com',
  'localhost:3000',
  'localhost:5173',
]);

const PRODUCTION_FRONTEND_DEFAULT = 'https://myapp.africanbusinesssuite.com';

const normalizeBase = (raw) => {
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_err) {
    return String(raw).replace(/\/+$/, '').replace(/\/onboarding$/i, '');
  }
};

const isAllowedHost = (host) => {
  const normalizedHost = String(host || '').toLowerCase();
  return ABS_ALLOWED_HOSTS.has(normalizedHost) || normalizedHost.endsWith('.africanbusinesssuite.com');
};

const isLocalhostBase = (base) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(base || ''));

/**
 * Env / production fallback for background jobs and when no request is available.
 * @returns {string}
 */
const getFrontendBaseUrlFromEnv = () => {
  const fromEnv = normalizeBase(process.env.FRONTEND_URL);
  if (fromEnv && !(process.env.NODE_ENV === 'production' && isLocalhostBase(fromEnv))) {
    return fromEnv;
  }
  if (process.env.NODE_ENV === 'production') {
    return PRODUCTION_FRONTEND_DEFAULT;
  }
  return fromEnv || 'http://localhost:3000';
};

/**
 * @param {import('express').Request} [req]
 * @returns {string}
 */
const getFrontendBaseUrl = (req) => {
  const candidate = req?.headers?.origin || req?.headers?.referer;
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (isAllowedHost(parsed.host)) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch (_err) {
      // Fall through to env fallback
    }
  }

  return getFrontendBaseUrlFromEnv();
};

/**
 * Build a public invoice payment link.
 * @param {{ paymentToken?: string|null, invoiceId?: string|null }} invoice
 * @param {import('express').Request} [req]
 * @returns {string}
 */
const buildInvoicePaymentLink = (invoice, req) => {
  const base = getFrontendBaseUrl(req).replace(/\/$/, '');
  if (invoice?.paymentToken) {
    return `${base}/pay-invoice/${invoice.paymentToken}`;
  }
  if (invoice?.invoiceId || invoice?.id) {
    return `${base}/invoices/${invoice.invoiceId || invoice.id}`;
  }
  return `${base}/invoices`;
};

/**
 * Path suffix for WhatsApp dynamic URL buttons.
 * Meta template base URL should be the app origin ending with `/`
 * (e.g. https://myapp.africanbusinesssuite.com/), and {{1}} is this path.
 *
 * @param {{ paymentToken?: string|null, invoiceId?: string|null, id?: string|null }} invoice
 * @returns {string|null}
 */
const buildInvoicePaymentPathParam = (invoice) => {
  if (invoice?.paymentToken) {
    return `pay-invoice/${encodeURIComponent(String(invoice.paymentToken))}`;
  }
  if (invoice?.invoiceId || invoice?.id) {
    return `invoices/${encodeURIComponent(String(invoice.invoiceId || invoice.id))}`;
  }
  return null;
};

module.exports = {
  getFrontendBaseUrl,
  getFrontendBaseUrlFromEnv,
  buildInvoicePaymentLink,
  buildInvoicePaymentPathParam,
  PRODUCTION_FRONTEND_DEFAULT,
};
