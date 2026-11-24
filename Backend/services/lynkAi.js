/**
 * Lynk AI inside ABS (Lynk's docs/plan/lynk-ai-for-apps.md): ABS opens a Lynk AI session for the signed-in owner or
 * manager and shows Lynk's screen (the Lynk AI page with Ask, Insights, Design and Import, or Ask in the side panel).
 * Lynk never reads ABS's database: it asks ABS questions, signed (controllers/lynkAiController.js), and ABS answers
 * with its own numbers (services/lynkAsk.js), as that person, in their shop.
 *
 * Settings: the same as the product import (services/lynkImport.js): LYNK_URL, LYNK_API_KEY (with "Lynk AI in your
 * app" access as well as Product import), LYNK_IMPORT_SECRET (the signing secret), API_PUBLIC_URL.
 */
const { callLynk } = require('./lynkImport');
const { loadTenantOrganization } = require('../utils/documentOrganizationUtils');

/** What ABS answers (services/lynkAsk.js), and what else Lynk's screen shows for it. */
const ABILITIES = ['summary', 'top_products', 'low_stock', 'money_owed', 'customers', 'sales', 'expenses', 'products', 'find', 'record', 'insights', 'design', 'import'];

/** Where Lynk may send the person, on the web (Frontend/src/App.jsx) and in the phone app (mobile/app). */
const PAGES = {
  web: [
    { path: '/dashboard', name: 'Dashboard' },
    { path: '/sales', name: 'Sales' },
    { path: '/invoices', name: 'Invoices' },
    { path: '/customers', name: 'Customers' },
    { path: '/products', name: 'Products' },
    { path: '/expenses', name: 'Expenses' },
    { path: '/quotes', name: 'Quotes' },
    { path: '/jobs', name: 'Jobs' },
    { path: '/reports/overview', name: 'Reports' },
  ],
  app: [
    { path: '/', name: 'Home' },
    { path: '/sales', name: 'Sales' },
    { path: '/invoices', name: 'Invoices' },
    { path: '/customers', name: 'Customers' },
    { path: '/products', name: 'Products' },
    { path: '/expenses', name: 'Expenses' },
    { path: '/reports', name: 'Reports' },
    { path: '/customer/:id', name: 'A customer' },
    { path: '/invoice/:id', name: 'An invoice' },
    { path: '/sale/:id', name: 'A sale' },
    { path: '/product/:id', name: 'A product' },
    { path: '/quote/:id', name: 'A quote' },
    { path: '/job/:id', name: 'A job' },
    { path: '/expense/:id', name: 'An expense' },
  ],
};

const publicUrl = () => (process.env.API_PUBLIC_URL || process.env.BACKEND_PUBLIC_URL || '').replace(/\/$/, '');

/** An address Lynk can open: ABS's own uploads are made absolute; anything else must already be https. */
function absoluteUrl(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url || url.startsWith('data:')) return undefined;
  if (url.startsWith('/') && publicUrl()) return `${publicUrl()}${url}`;
  return /^https:\/\//i.test(url) ? url : undefined;
}

const addressText = (address) => {
  if (!address) return undefined;
  if (typeof address === 'string') return address.trim() || undefined;
  const parts = ['line1', 'line2', 'street', 'city', 'region', 'state', 'country'].map((k) => address[k]).filter((v) => typeof v === 'string' && v.trim());
  return parts.length ? parts.join(', ').slice(0, 300) : undefined;
};

const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/** The business as Lynk should know it: from ABS's organization settings, the same as on invoices. */
async function businessFor(tenantId) {
  const { organization, tenant } = await loadTenantOrganization(tenantId);
  const social = tenant?.metadata?.socials || {};
  const socials = Object.fromEntries(['facebook', 'instagram', 'tiktok', 'x', 'linkedin'].map((k) => [k, text(social[k], 100)]).filter(([, v]) => v));
  const color = /^#[0-9a-fA-F]{6}$/.test(organization.primaryColor || '') ? organization.primaryColor : undefined;
  return {
    name: text(organization.name, 120),
    kind: text(tenant?.metadata?.shopType || organization.businessType, 60),
    phone: text(organization.phone, 40),
    email: text(organization.email, 200),
    address: addressText(organization.address),
    website: text(organization.website, 300),
    ...(Object.keys(socials).length ? { socials } : {}),
    ...(absoluteUrl(organization.logoUrl) ? { logo_url: absoluteUrl(organization.logoUrl) } : {}),
    ...(color ? { colors: { primary: color } } : {}),
    currency: 'GHS',
  };
}

/**
 * Opens Lynk AI for one person: the business (its credit is the same as for the product import), who they are, the
 * page they're on, and where Lynk asks ABS its questions. Returns Lynk's session (id, screen_url).
 */
async function startAiSession({ tenant, user, role, client = 'web', screen = 'full', tab = 'ask', page = null, abilities = ABILITIES }, opts = {}) {
  const base = publicUrl();
  const kind = client === 'app' ? 'app' : 'web';
  return callLynk('/assistant/sessions', {
    user: { id: String(tenant.id), name: text(tenant.name, 120), email: text(user?.email, 200) },
    member: { id: String(user.id), name: text(user.name, 120), role: role || undefined },
    business: await businessFor(tenant.id),
    abilities,
    pages: PAGES[kind],
    ...(page && typeof page.path === 'string' ? { page } : {}),
    look: { name: 'ABS', color: process.env.LYNK_IMPORT_COLOR || '#166534' },
    screen: screen === 'panel' ? 'panel' : 'full',
    tab: ['ask', 'insights', 'design', 'import'].includes(tab) ? tab : 'ask',
    ...(base ? { ask_url: `${base}/api/webhooks/lynk/ask` } : {}),
  }, opts);
}

module.exports = { ABILITIES, PAGES, startAiSession, businessFor, absoluteUrl };
