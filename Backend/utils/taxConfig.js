const NodeCache = require('node-cache');
const { Setting } = require('../models');

/** Per-tenant tax config cache (organization.tax changes rarely). */
const taxConfigCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false
});

/** @typedef {{ code: string, label: string, ratePercent: number, enabled: boolean }} TaxLevy */
/** @typedef {{ enabled: boolean, label: string, ratePercent: number, customerBears: boolean, appliesTo: string }} NormalizedOtherChargeConfig */
/**
 * @typedef {{
 *   enabled: boolean,
 *   defaultRatePercent: number,
 *   pricesAreTaxInclusive: boolean,
 *   displayLabel: string,
 *   vatNumber: string,
 *   tin: string,
 *   ghanaCardPin: string,
 *   scheme: 'standard'|'flat'|'none',
 *   levies: TaxLevy[],
 *   eVat: object,
 *   otherCharges: NormalizedOtherChargeConfig
 * }} NormalizedTaxConfig
 */

const DEFAULT_GHANA_LEVIES = [
  { code: 'vat', label: 'VAT', ratePercent: 0, enabled: true },
  { code: 'nhil', label: 'NHIL', ratePercent: 0, enabled: true },
  { code: 'getfund', label: 'GETFund', ratePercent: 0, enabled: true },
  { code: 'covid', label: 'COVID-19 HRL', ratePercent: 0, enabled: true },
];

const DEFAULT_TAX_FIELDS = {
  enabled: false,
  defaultRatePercent: 0,
  pricesAreTaxInclusive: false,
  displayLabel: 'Tax',
  vatNumber: '',
  tin: '',
  ghanaCardPin: '',
  scheme: 'standard',
  levies: DEFAULT_GHANA_LEVIES.map((l) => ({ ...l })),
  eVat: {
    enabled: false,
    mode: 'sandbox',
    apiBaseUrl: '',
    consentAcceptedAt: null,
    consentAcceptedBy: null,
    lastTestStampAt: null,
    lastTestStampOk: false,
    apiKeyEncrypted: '',
  },
  otherCharges: {
    enabled: false,
    label: 'Transaction charge',
    ratePercent: 0,
    customerBears: false,
    appliesTo: 'online_payments'
  }
};

/**
 * @param {unknown} rawLevies
 * @returns {TaxLevy[]}
 */
function normalizeLevies(rawLevies) {
  if (!Array.isArray(rawLevies) || rawLevies.length === 0) {
    return DEFAULT_GHANA_LEVIES.map((l) => ({ ...l }));
  }
  return rawLevies
    .filter((l) => l && typeof l === 'object')
    .map((l) => {
      const rate = parseFloat(l.ratePercent);
      return {
        code: typeof l.code === 'string' && l.code.trim()
          ? l.code.trim().toLowerCase().slice(0, 32)
          : 'levy',
        label: typeof l.label === 'string' && l.label.trim()
          ? l.label.trim().slice(0, 80)
          : 'Levy',
        ratePercent: Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0,
        enabled: l.enabled !== false,
      };
    });
}

/**
 * Effective combined tax rate from enabled levies, or legacy defaultRatePercent.
 * @param {NormalizedTaxConfig|object} config
 * @returns {number}
 */
function getEffectiveTaxRatePercent(config = {}) {
  const levies = Array.isArray(config.levies) ? config.levies : [];
  const active = levies.filter((l) => l && l.enabled !== false && (parseFloat(l.ratePercent) || 0) > 0);
  if (active.length > 0) {
    return active.reduce((sum, l) => sum + (parseFloat(l.ratePercent) || 0), 0);
  }
  const rate = parseFloat(config.defaultRatePercent);
  return Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0;
}

/**
 * Merge raw organization.tax with defaults (registration fields preserved).
 * @param {Record<string, unknown>} raw
 * @returns {NormalizedTaxConfig}
 */
function normalizeTaxConfig(raw = {}) {
  const rate = parseFloat(raw.defaultRatePercent);
  const safeRate = Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0;
  const otherRate = parseFloat(raw?.otherCharges?.ratePercent);
  const safeOtherRate = Number.isFinite(otherRate) ? Math.min(100, Math.max(0, otherRate)) : 0;
  const rawAppliesTo = typeof raw?.otherCharges?.appliesTo === 'string' ? raw.otherCharges.appliesTo.trim() : '';
  const appliesTo = rawAppliesTo === 'online_payments' || rawAppliesTo === 'all_payments'
    ? rawAppliesTo
    : DEFAULT_TAX_FIELDS.otherCharges.appliesTo;
  const schemeRaw = typeof raw.scheme === 'string' ? raw.scheme.trim() : '';
  const scheme = ['standard', 'flat', 'none'].includes(schemeRaw) ? schemeRaw : 'standard';
  const levies = normalizeLevies(raw.levies);
  const rawEvat = raw.eVat && typeof raw.eVat === 'object' ? raw.eVat : {};

  // If levies all zero but defaultRate set, mirror into vat levy for Ghana UX.
  const levySum = levies.reduce((s, l) => s + (l.enabled === false ? 0 : l.ratePercent), 0);
  if (levySum === 0 && safeRate > 0) {
    const vatIdx = levies.findIndex((l) => l.code === 'vat');
    if (vatIdx >= 0) levies[vatIdx] = { ...levies[vatIdx], ratePercent: safeRate, enabled: true };
  }

  return {
    enabled: raw.enabled === true,
    defaultRatePercent: safeRate > 0 ? safeRate : getEffectiveTaxRatePercent({ levies, defaultRatePercent: 0 }),
    pricesAreTaxInclusive: raw.pricesAreTaxInclusive === true,
    displayLabel:
      typeof raw.displayLabel === 'string' && raw.displayLabel.trim()
        ? raw.displayLabel.trim().slice(0, 80)
        : DEFAULT_TAX_FIELDS.displayLabel,
    vatNumber: typeof raw.vatNumber === 'string' ? raw.vatNumber : '',
    tin: typeof raw.tin === 'string' ? raw.tin : '',
    ghanaCardPin: typeof raw.ghanaCardPin === 'string' ? raw.ghanaCardPin : '',
    scheme,
    levies,
    eVat: {
      enabled: rawEvat.enabled === true,
      mode: rawEvat.mode === 'live' ? 'live' : 'sandbox',
      apiBaseUrl: typeof rawEvat.apiBaseUrl === 'string' ? rawEvat.apiBaseUrl : '',
      consentAcceptedAt: rawEvat.consentAcceptedAt || null,
      consentAcceptedBy: rawEvat.consentAcceptedBy || null,
      lastTestStampAt: rawEvat.lastTestStampAt || null,
      lastTestStampOk: rawEvat.lastTestStampOk === true,
      apiKeyEncrypted: typeof rawEvat.apiKeyEncrypted === 'string' ? rawEvat.apiKeyEncrypted : '',
    },
    otherCharges: {
      enabled: raw?.otherCharges?.enabled === true,
      label:
        typeof raw?.otherCharges?.label === 'string' && raw.otherCharges.label.trim()
          ? raw.otherCharges.label.trim().slice(0, 80)
          : DEFAULT_TAX_FIELDS.otherCharges.label,
      ratePercent: safeOtherRate,
      customerBears: raw?.otherCharges?.customerBears === true,
      appliesTo
    }
  };
}

/**
 * Tax slice for API responses (organization settings) — strips encrypted API key.
 * @param {Record<string, unknown>} organizationValue
 * @returns {object}
 */
function getTaxFromOrganizationSettings(organizationValue = {}) {
  const config = normalizeTaxConfig(organizationValue.tax || {});
  return {
    ...config,
    eVat: {
      enabled: config.eVat.enabled,
      mode: config.eVat.mode,
      apiBaseUrl: config.eVat.apiBaseUrl,
      consentAcceptedAt: config.eVat.consentAcceptedAt,
      consentAcceptedBy: config.eVat.consentAcceptedBy,
      lastTestStampAt: config.eVat.lastTestStampAt,
      lastTestStampOk: config.eVat.lastTestStampOk,
      hasApiKey: Boolean(config.eVat.apiKeyEncrypted),
    },
  };
}

/**
 * Full normalized tax including secrets (internal services only).
 * @param {string} tenantId
 * @returns {Promise<NormalizedTaxConfig>}
 */
async function getTaxConfigForTenant(tenantId) {
  if (!tenantId) {
    return normalizeTaxConfig({});
  }
  if (taxConfigCache.has(tenantId)) {
    return taxConfigCache.get(tenantId);
  }

  const row = await Setting.findOne({
    where: { tenantId, key: 'organization' },
    attributes: ['value']
  });
  const config = normalizeTaxConfig(row?.value?.tax || {});
  taxConfigCache.set(tenantId, config);
  return config;
}

/**
 * @param {string} [tenantId]
 */
function invalidateTaxConfigCache(tenantId) {
  if (tenantId) {
    taxConfigCache.del(tenantId);
    return;
  }
  taxConfigCache.flushAll();
}

/**
 * @param {string} tenantId
 * @param {Record<string, unknown>} organizationValue
 */
function warmTaxConfigCache(tenantId, organizationValue = {}) {
  if (!tenantId) return;
  const config = normalizeTaxConfig(organizationValue.tax || {});
  taxConfigCache.set(tenantId, config);
}

/**
 * @param {string} tenantId
 * @returns {boolean}
 */
function hasTaxConfigCache(tenantId) {
  return !!tenantId && taxConfigCache.has(tenantId);
}

/**
 * @param {Record<string, unknown>} taxPayload
 * @returns {string|null}
 */
function validateMergedTaxPayload(taxPayload) {
  if (!taxPayload || typeof taxPayload !== 'object') return null;
  const rate = taxPayload.defaultRatePercent;
  if (rate !== undefined && rate !== null && rate !== '') {
    const n = parseFloat(rate);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return 'Tax rate must be between 0 and 100';
    }
  }
  if (taxPayload.displayLabel !== undefined && taxPayload.displayLabel !== null) {
    if (typeof taxPayload.displayLabel !== 'string') {
      return 'Tax display label must be a string';
    }
    if (taxPayload.displayLabel.length > 80) {
      return 'Tax display label is too long';
    }
  }
  if (taxPayload.ghanaCardPin !== undefined && taxPayload.ghanaCardPin !== null) {
    if (typeof taxPayload.ghanaCardPin !== 'string') {
      return 'Ghana Card PIN must be a string';
    }
    if (taxPayload.ghanaCardPin.length > 32) {
      return 'Ghana Card PIN is too long';
    }
  }
  if (taxPayload.scheme !== undefined && taxPayload.scheme !== null) {
    if (!['standard', 'flat', 'none'].includes(String(taxPayload.scheme))) {
      return 'Tax scheme is invalid';
    }
  }
  if (taxPayload.levies !== undefined && taxPayload.levies !== null) {
    if (!Array.isArray(taxPayload.levies)) return 'Levies must be an array';
    for (const levy of taxPayload.levies) {
      if (!levy || typeof levy !== 'object') return 'Each levy must be an object';
      const lr = levy.ratePercent;
      if (lr !== undefined && lr !== null && lr !== '') {
        const n = parseFloat(lr);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return 'Each levy rate must be between 0 and 100';
        }
      }
    }
    const sum = taxPayload.levies.reduce((s, l) => {
      if (l?.enabled === false) return s;
      return s + (parseFloat(l?.ratePercent) || 0);
    }, 0);
    if (sum > 100) return 'Combined levy rates cannot exceed 100';
  }
  if (taxPayload.otherCharges !== undefined && taxPayload.otherCharges !== null) {
    if (typeof taxPayload.otherCharges !== 'object' || Array.isArray(taxPayload.otherCharges)) {
      return 'Other charges must be an object';
    }
    const oc = taxPayload.otherCharges;
    const ocRate = oc.ratePercent;
    if (ocRate !== undefined && ocRate !== null && ocRate !== '') {
      const n = parseFloat(ocRate);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return 'Other charge rate must be between 0 and 100';
      }
    }
    if (oc.label !== undefined && oc.label !== null) {
      if (typeof oc.label !== 'string') return 'Other charge label must be a string';
      if (oc.label.length > 80) return 'Other charge label is too long';
    }
    if (oc.appliesTo !== undefined && oc.appliesTo !== null) {
      const valid = ['online_payments', 'all_payments'];
      if (!valid.includes(String(oc.appliesTo))) {
        return 'Other charge applicability is invalid';
      }
    }
  }
  return null;
}

module.exports = {
  DEFAULT_TAX_FIELDS,
  DEFAULT_GHANA_LEVIES,
  normalizeTaxConfig,
  normalizeLevies,
  getEffectiveTaxRatePercent,
  getTaxFromOrganizationSettings,
  getTaxConfigForTenant,
  invalidateTaxConfigCache,
  warmTaxConfigCache,
  hasTaxConfigCache,
  validateMergedTaxPayload
};
