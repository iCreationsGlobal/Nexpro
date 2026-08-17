/**
 * GRA e-VAT (Certified Invoicing) stamp service.
 * Sandbox mode simulates VSDC clearance; live mode calls GRA when credentials exist.
 */

const crypto = require('crypto');
const { Setting } = require('../models');
const { getTaxConfigForTenant, normalizeTaxConfig } = require('../utils/taxConfig');
const { encryptSecret, decryptSecret, isEncryptedSecret, hasKey } = require('../utils/secretCrypto');

const EVAT_ENCRYPTION_KEY = 'EVAT_CREDENTIALS_ENCRYPTION_KEY';
const FALLBACK_KEY = 'WHATSAPP_CREDENTIALS_ENCRYPTION_KEY';

const READINESS_CHECKLIST = [
  { id: 'vat_registered', label: 'Business is VAT-registered with GRA' },
  { id: 'tin_set', label: 'Organization TIN is set in ABS' },
  { id: 'ghana_card_pin', label: 'Ghana Card PIN is set (where required)' },
  { id: 'levies_configured', label: 'Ghana levy components configured (or flat VAT rate)' },
  { id: 'consent', label: 'e-VAT consent accepted by a workspace admin' },
  { id: 'credentials', label: 'API security key stored (live) or sandbox mode selected' },
  { id: 'test_stamp', label: 'Test stamp succeeded in ABS' },
  { id: 'uat_scheduled', label: 'Joint UAT scheduled with GRA (external)' },
];

function resolveCryptoKeyName() {
  if (hasKey(EVAT_ENCRYPTION_KEY)) return EVAT_ENCRYPTION_KEY;
  if (hasKey(FALLBACK_KEY)) return FALLBACK_KEY;
  return EVAT_ENCRYPTION_KEY;
}

function encryptApiKey(plain) {
  if (!plain) return '';
  try {
    return encryptSecret(String(plain), resolveCryptoKeyName());
  } catch {
    // Dev without encryption key: store marker only (never ideal for production).
    return `plain:${String(plain)}`;
  }
}

function decryptApiKey(stored) {
  if (!stored) return '';
  if (String(stored).startsWith('plain:')) return String(stored).slice(6);
  try {
    if (isEncryptedSecret(stored) || hasKey(resolveCryptoKeyName())) {
      return decryptSecret(stored, resolveCryptoKeyName());
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * @param {object} taxConfig
 * @returns {object}
 */
function getEvatConfig(taxConfig = {}) {
  const eVat = taxConfig.eVat && typeof taxConfig.eVat === 'object' ? taxConfig.eVat : {};
  return {
    enabled: eVat.enabled === true,
    mode: eVat.mode === 'live' ? 'live' : 'sandbox',
    apiBaseUrl: typeof eVat.apiBaseUrl === 'string' ? eVat.apiBaseUrl.trim() : '',
    consentAcceptedAt: eVat.consentAcceptedAt || null,
    consentAcceptedBy: eVat.consentAcceptedBy || null,
    lastTestStampAt: eVat.lastTestStampAt || null,
    lastTestStampOk: eVat.lastTestStampOk === true,
    hasApiKey: Boolean(eVat.apiKeyEncrypted),
    apiKeyEncrypted: eVat.apiKeyEncrypted || '',
  };
}

/**
 * Public-safe e-VAT status for UI (never returns API key).
 * @param {string} tenantId
 */
async function getEvatStatus(tenantId) {
  const tax = await getTaxConfigForTenant(tenantId);
  const eVat = getEvatConfig(tax);
  const checklist = buildReadinessChecklist(tax, eVat);
  return {
    enabled: eVat.enabled,
    mode: eVat.mode,
    apiBaseUrl: eVat.apiBaseUrl,
    consentAcceptedAt: eVat.consentAcceptedAt,
    lastTestStampAt: eVat.lastTestStampAt,
    lastTestStampOk: eVat.lastTestStampOk,
    hasApiKey: eVat.hasApiKey,
    checklist,
    readinessComplete: checklist.every((item) => item.done || item.id === 'uat_scheduled'),
  };
}

/**
 * @param {object} tax
 * @param {object} eVat
 */
function buildReadinessChecklist(tax, eVat) {
  const levies = Array.isArray(tax.levies) ? tax.levies : [];
  const hasLevies = levies.some((l) => l && (parseFloat(l.ratePercent) || 0) > 0);
  const hasRate = (parseFloat(tax.defaultRatePercent) || 0) > 0 || hasLevies;

  return READINESS_CHECKLIST.map((item) => {
    let done = false;
    switch (item.id) {
      case 'vat_registered':
        done = Boolean(tax.vatNumber && String(tax.vatNumber).trim());
        break;
      case 'tin_set':
        done = Boolean(tax.tin && String(tax.tin).trim());
        break;
      case 'ghana_card_pin':
        done = Boolean(tax.ghanaCardPin && String(tax.ghanaCardPin).trim());
        break;
      case 'levies_configured':
        done = hasRate;
        break;
      case 'consent':
        done = Boolean(eVat.consentAcceptedAt);
        break;
      case 'credentials':
        done = eVat.mode === 'sandbox' || eVat.hasApiKey;
        break;
      case 'test_stamp':
        done = eVat.lastTestStampOk === true;
        break;
      case 'uat_scheduled':
        done = false; // external; marked manually in ops
        break;
      default:
        done = false;
    }
    return { ...item, done };
  });
}

/**
 * Persist e-VAT settings into organization.tax.eVat
 * @param {string} tenantId
 * @param {object} patch
 * @param {{ userId?: string }} [opts]
 */
async function updateEvatSettings(tenantId, patch = {}, opts = {}) {
  const row = await Setting.findOne({ where: { tenantId, key: 'organization' } });
  const value = row?.value && typeof row.value === 'object' ? { ...row.value } : {};
  const tax = normalizeTaxConfig(value.tax || {});
  const prev = getEvatConfig(tax);

  const nextEvat = {
    enabled: patch.enabled !== undefined ? patch.enabled === true : prev.enabled,
    mode: patch.mode === 'live' || patch.mode === 'sandbox' ? patch.mode : prev.mode,
    apiBaseUrl: patch.apiBaseUrl !== undefined ? String(patch.apiBaseUrl || '').trim() : prev.apiBaseUrl,
    consentAcceptedAt: prev.consentAcceptedAt,
    consentAcceptedBy: prev.consentAcceptedBy,
    lastTestStampAt: prev.lastTestStampAt,
    lastTestStampOk: prev.lastTestStampOk,
    apiKeyEncrypted: prev.apiKeyEncrypted,
  };

  if (patch.acceptConsent === true || patch.consentAccepted === true) {
    nextEvat.consentAcceptedAt = new Date().toISOString();
    nextEvat.consentAcceptedBy = opts.userId || null;
  }

  if (patch.apiKey !== undefined) {
    const plain = String(patch.apiKey || '').trim();
    nextEvat.apiKeyEncrypted = plain ? encryptApiKey(plain) : '';
  }

  if (patch.clearTestStamp === true) {
    nextEvat.lastTestStampAt = null;
    nextEvat.lastTestStampOk = false;
  }

  const nextTax = {
    ...tax,
    eVat: {
      enabled: nextEvat.enabled,
      mode: nextEvat.mode,
      apiBaseUrl: nextEvat.apiBaseUrl,
      consentAcceptedAt: nextEvat.consentAcceptedAt,
      consentAcceptedBy: nextEvat.consentAcceptedBy,
      lastTestStampAt: nextEvat.lastTestStampAt,
      lastTestStampOk: nextEvat.lastTestStampOk,
      apiKeyEncrypted: nextEvat.apiKeyEncrypted,
    },
  };

  const nextValue = { ...value, tax: nextTax };
  if (row) {
    await row.update({ value: nextValue });
  } else {
    await Setting.create({ tenantId, key: 'organization', value: nextValue });
  }

  const { invalidateTaxConfigCache, warmTaxConfigCache } = require('../utils/taxConfig');
  invalidateTaxConfigCache(tenantId);
  warmTaxConfigCache(tenantId, nextValue);

  return getEvatStatus(tenantId);
}

/**
 * Build a stamp payload from a sale or invoice-like document.
 * @param {object} doc
 * @param {object} taxConfig
 */
function buildStampPayload(doc, taxConfig) {
  const eVat = getEvatConfig(taxConfig);
  const items = Array.isArray(doc.items)
    ? doc.items
    : Array.isArray(doc.SaleItems)
      ? doc.SaleItems
      : [];

  return {
    mode: eVat.mode,
    supplier: {
      tin: taxConfig.tin || '',
      vatNumber: taxConfig.vatNumber || '',
      ghanaCardPin: taxConfig.ghanaCardPin || '',
      name: doc.businessName || doc.tenantName || '',
    },
    customer: {
      name: doc.customerName || doc.customer?.name || '',
      tin: doc.customerTin || doc.customer?.taxId || doc.customer?.tin || '',
      ghanaCardPin: doc.customer?.ghanaCardPin || '',
    },
    document: {
      type: doc.documentType || (doc.saleNumber ? 'sale_receipt' : 'invoice'),
      number: doc.saleNumber || doc.invoiceNumber || doc.id,
      issuedAt: doc.createdAt || new Date().toISOString(),
      currency: doc.currency || 'GHS',
    },
    amounts: {
      exclusive: parseFloat(doc.subtotal ?? doc.metadata?.taxDetail?.taxableExclusive) || 0,
      tax: parseFloat(doc.tax ?? doc.taxAmount) || 0,
      total: parseFloat(doc.total) || 0,
      levies: doc.metadata?.taxDetail?.levies || taxConfig.levies || [],
    },
    lines: items.map((line, idx) => ({
      lineNo: idx + 1,
      description: line.description || line.name || line.productName || `Line ${idx + 1}`,
      quantity: parseFloat(line.quantity) || 0,
      unitPrice: parseFloat(line.unitPrice) || 0,
      tax: parseFloat(line.tax) || 0,
      total: parseFloat(line.total) || 0,
    })),
  };
}

/**
 * Stamp via sandbox (simulated) or live GRA adapter.
 * @param {object} payload
 * @param {object} eVat
 */
async function callStampAdapter(payload, eVat) {
  if (eVat.mode !== 'live') {
    const irn = `SBX-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const qrPayload = JSON.stringify({
      irn,
      tin: payload.supplier?.tin,
      total: payload.amounts?.total,
      ts: new Date().toISOString(),
      mode: 'sandbox',
    });
    return {
      success: true,
      mode: 'sandbox',
      irn,
      qrPayload,
      qrCodeDataUrl: null,
      signature: crypto.createHash('sha256').update(irn).digest('hex'),
      verificationEngineId: 'ABS-SANDBOX-VSDC',
      stampedAt: new Date().toISOString(),
      raw: { simulated: true },
    };
  }

  const apiKey = decryptApiKey(eVat.apiKeyEncrypted);
  const baseUrl = eVat.apiBaseUrl || process.env.GRA_EVAT_API_BASE_URL || '';
  if (!apiKey || !baseUrl) {
    const err = new Error('Live e-VAT requires API base URL and API key. Complete Phase 0 GRA access or use sandbox mode.');
    err.statusCode = 400;
    err.code = 'EVAT_LIVE_NOT_CONFIGURED';
    throw err;
  }

  // Live call shape is finalized once GRA Postman collection is available.
  // Placeholder endpoint keeps adapter pluggable without blocking sandbox UAT.
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/stamp`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body?.message || body?.error || `GRA e-VAT stamp failed (${response.status})`);
    err.statusCode = response.status;
    err.code = 'EVAT_STAMP_FAILED';
    err.details = body;
    throw err;
  }

  return {
    success: true,
    mode: 'live',
    irn: body.irn || body.IRN || body.invoiceReferenceNumber,
    qrPayload: body.qrPayload || body.qrCode || body.qr || null,
    qrCodeDataUrl: body.qrCodeDataUrl || null,
    signature: body.signature || body.invoiceSignature || null,
    verificationEngineId: body.verificationEngineId || body.engineId || null,
    stampedAt: body.stampedAt || new Date().toISOString(),
    raw: body,
  };
}

/**
 * Stamp a business document and return graStamp metadata.
 * @param {string} tenantId
 * @param {object} doc
 */
async function stampDocument(tenantId, doc) {
  const tax = await getTaxConfigForTenant(tenantId);
  const eVat = getEvatConfig(tax);
  if (!eVat.enabled) {
    const err = new Error('e-VAT is not enabled for this workspace');
    err.statusCode = 400;
    err.code = 'EVAT_DISABLED';
    throw err;
  }
  if (!eVat.consentAcceptedAt) {
    const err = new Error('Accept e-VAT consent before stamping invoices');
    err.statusCode = 400;
    err.code = 'EVAT_CONSENT_REQUIRED';
    throw err;
  }

  const payload = buildStampPayload(doc, tax);
  const result = await callStampAdapter(payload, eVat);

  return {
    irn: result.irn,
    qrPayload: result.qrPayload,
    qrCodeDataUrl: result.qrCodeDataUrl,
    signature: result.signature,
    verificationEngineId: result.verificationEngineId,
    stampedAt: result.stampedAt,
    mode: result.mode,
    documentNumber: payload.document.number,
  };
}

/**
 * Run a test stamp and persist result flags on tax.eVat.
 * @param {string} tenantId
 * @param {{ userId?: string }} [opts]
 */
async function testStamp(tenantId, opts = {}) {
  const sampleDoc = {
    documentType: 'test',
    saleNumber: `TEST-${Date.now()}`,
    createdAt: new Date().toISOString(),
    subtotal: 100,
    tax: 15,
    total: 115,
    items: [{ description: 'e-VAT test line', quantity: 1, unitPrice: 100, tax: 15, total: 100 }],
    customerName: 'Test Customer',
    customerTin: '',
  };

  let stamp;
  let ok = false;
  let error = null;
  try {
    stamp = await stampDocument(tenantId, sampleDoc);
    ok = true;
  } catch (err) {
    error = err.message || 'Test stamp failed';
  }

  const row = await Setting.findOne({ where: { tenantId, key: 'organization' } });
  const value = row?.value && typeof row.value === 'object' ? { ...row.value } : {};
  const tax = normalizeTaxConfig(value.tax || {});
  const eVat = getEvatConfig(tax);
  const nextTax = {
    ...tax,
    eVat: {
      ...tax.eVat,
      enabled: eVat.enabled,
      mode: eVat.mode,
      apiBaseUrl: eVat.apiBaseUrl,
      consentAcceptedAt: eVat.consentAcceptedAt,
      consentAcceptedBy: eVat.consentAcceptedBy,
      apiKeyEncrypted: eVat.apiKeyEncrypted,
      lastTestStampAt: new Date().toISOString(),
      lastTestStampOk: ok,
    },
  };
  const nextValue = { ...value, tax: nextTax };
  if (row) await row.update({ value: nextValue });
  else await Setting.create({ tenantId, key: 'organization', value: nextValue });

  const { invalidateTaxConfigCache, warmTaxConfigCache } = require('../utils/taxConfig');
  invalidateTaxConfigCache(tenantId);
  warmTaxConfigCache(tenantId, nextValue);

  return {
    success: ok,
    error,
    stamp: stamp || null,
    status: await getEvatStatus(tenantId),
    testedBy: opts.userId || null,
  };
}

/**
 * Merge stamp result into sale/invoice metadata object.
 * @param {object} metadata
 * @param {object} graStamp
 */
function mergeGraStampMetadata(metadata = {}, graStamp) {
  return {
    ...metadata,
    graStamp: {
      ...(metadata.graStamp || {}),
      ...graStamp,
    },
  };
}

/**
 * Stamp when e-VAT is enabled + consented. On failure, queue for offline sync.
 * @param {string} tenantId
 * @param {object} doc
 * @param {object} [existingMetadata]
 * @returns {Promise<object|null>} updated metadata or null if skipped
 */
async function stampDocumentIfEnabled(tenantId, doc, existingMetadata = {}) {
  const tax = await getTaxConfigForTenant(tenantId);
  const eVat = getEvatConfig(tax);
  if (!eVat.enabled || !eVat.consentAcceptedAt) return null;
  if (existingMetadata?.graStamp?.irn) return existingMetadata;

  try {
    const stamp = await stampDocument(tenantId, doc);
    return mergeGraStampMetadata(existingMetadata || {}, stamp);
  } catch (err) {
    const queuedAt = new Date().toISOString();
    return {
      ...(existingMetadata || {}),
      graStampQueue: {
        status: 'pending',
        queuedAt,
        lastError: err?.message || 'Stamp failed',
        attempts: (existingMetadata?.graStampQueue?.attempts || 0) + 1,
      },
    };
  }
}

module.exports = {
  READINESS_CHECKLIST,
  getEvatConfig,
  getEvatStatus,
  buildReadinessChecklist,
  updateEvatSettings,
  buildStampPayload,
  stampDocument,
  stampDocumentIfEnabled,
  testStamp,
  mergeGraStampMetadata,
  encryptApiKey,
  decryptApiKey,
};
