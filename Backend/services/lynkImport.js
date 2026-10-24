/**
 * Bring in products with Lynk AI (Lynk Product Import; Lynk's docs/plan/ai-product-import.md). ABS starts an import on
 * Lynk for the business (its tenant id is the "user" on Lynk), with ABS's own product details, categories, units, shops
 * and products; the owner gives their file or words on Lynk's ready-made screen inside ABS and answers Lynk's
 * questions. Lynk asks ABS to check the rows (ABS's own preview) and sends the finished products to ABS, signed.
 *
 * Settings: LYNK_URL (Lynk's address), LYNK_API_KEY (a Lynk key with "Product import" access), LYNK_IMPORT_SECRET
 * (the signing secret in Lynk's Developer settings → Product import), API_PUBLIC_URL (where Lynk reaches this server).
 */
const crypto = require('crypto');
const { IMPORT_COLUMNS, mapRowToEntity } = require('../utils/importParse');

const KIND = { string: 'text', currency: 'money', number: 'number', date: 'date', boolean: 'yesno' };
/** What each of ABS's import columns means to Lynk, so its checks (prices, codes, stock) work on ABS's keys. */
const ROLE = {
  name: 'name', sku: 'sku', categoryName: 'category', costPrice: 'cost', sellingPrice: 'price', quantityOnHand: 'quantity',
  reorderLevel: 'reorder', unit: 'unit', description: 'description', barcode: 'barcode', wholesalePrice: 'wholesale',
  brand: 'brand', supplier: 'supplier', expiryDate: 'expiry', batchNumber: 'batch',
};
/** Details each colour or size has of its own (ABS's ProductVariant). */
const PER_CHOICE = new Set(['sku', 'barcode', 'costPrice', 'sellingPrice', 'wholesalePrice', 'quantityOnHand']);

/** ABS's product details, as Lynk takes them: its own import template (utils/importParse.js). */
function absDetails() {
  return IMPORT_COLUMNS.products.map((col) => ({
    key: col.key,
    label: col.header,
    kind: KIND[col.type] || 'text',
    required: Boolean(col.required),
    ...(ROLE[col.key] ? { role: ROLE[col.key] } : {}),
    per_choice: PER_CHOICE.has(col.key),
  }));
}

const lynkUrl = () => (process.env.LYNK_URL || 'https://www.lynkinfra.com').replace(/\/$/, '');
const publicUrl = () => (process.env.API_PUBLIC_URL || process.env.BACKEND_PUBLIC_URL || '').replace(/\/$/, '');

function lynkConfigured() {
  return Boolean(process.env.LYNK_API_KEY && process.env.LYNK_IMPORT_SECRET);
}

/** Calls Lynk's API with ABS's key; Lynk's own message when it refuses. */
async function callLynk(path, body, { method = 'POST', fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${lynkUrl()}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.LYNK_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Lynk answered ${res.status}`);
    err.statusCode = res.status === 402 ? 402 : 502;
    throw err;
  }
  return json;
}

/**
 * The start of an import, for one business: ABS's details and lists, and its products (so Lynk spots ones already
 * there), with Lynk's screen in ABS's name. Returns Lynk's import (with screen_url).
 */
async function startImport({ tenant, user, categories, units, shops, existing }, opts = {}) {
  const base = publicUrl();
  return callLynk('/products/imports', {
    user: { id: String(tenant.id), name: tenant.name || undefined, email: user?.email || undefined },
    screen: true,
    variants: true,
    can_update: false,
    details: absDetails(),
    lists: {
      categories: categories.slice(0, 2000),
      units: units.slice(0, 200),
      shops: shops.slice(0, 200).map((s) => ({ id: String(s.id), name: s.name })),
    },
    existing: existing.slice(0, 50_000).map((p) => ({ id: p.id, name: p.name || undefined, sku: p.sku || undefined, barcode: p.barcode || undefined })),
    look: { name: 'ABS', color: process.env.LYNK_IMPORT_COLOR || '#166534' },
    ...(base ? { check_url: `${base}/api/webhooks/lynk/import-check`, webhook_url: `${base}/api/webhooks/lynk/import-finished` } : {}),
  }, opts);
}

/** Whether a message really came from Lynk: X-Lynk-Signature is the hex HMAC-SHA256 of the raw body with the secret. */
function verifyLynkSignature(rawBody, signature, secret = process.env.LYNK_IMPORT_SECRET) {
  if (!secret || !rawBody || typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** Lynk's products as ABS import rows: the template's keys, and each colour or size as a variant. */
function rowsFromLynk(products) {
  return (Array.isArray(products) ? products : []).slice(0, 2000).map((p) => ({
    row: String(p?.row ?? ''),
    data: mapRowToEntity(p?.values && typeof p.values === 'object' ? p.values : {}, 'products'),
    variants: (Array.isArray(p?.choices) ? p.choices : []).map((c) => ({ attributes: c?.attributes || {}, ...(c?.values || {}) })),
  }));
}

/** The batch a Lynk import's products are kept under in ABS, so it's added once and can be undone. */
const batchIdFor = (importId) => `lynk-${String(importId).replace(/[^\w-]/g, '').slice(0, 60)}`;

module.exports = { absDetails, startImport, verifyLynkSignature, rowsFromLynk, batchIdFor, lynkConfigured, callLynk };
