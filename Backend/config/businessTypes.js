/**
 * Business Type Feature Mapping
 *
 * Only 3 business types: shop, studio, pharmacy.
 * Studio types (printing_press, mechanic, barber, salon) are in metadata.studioType.
 */

const BUSINESS_TYPE_FEATURES = {
  shop: [
    'crm',
    'automations',
    'vendors',
    'marketing',
    'quoteAutomation',
    'leadPipeline',
    'products',
    'materials',
    'deliveries',
    'paymentsExpenses',
    'reports',
    'accounting',
    'payroll',
    'roleManagement',
    'tasks',
    'orders',
    // Feature keys must match `Backend/config/features.js` registry.
    'dealersAccount',
    'shopsModule',
    'pos',
    'watch',
    'materialsTracking',
    'payments',
    'expenses',
    'invoices',
    'basicReports',
    'salesReports',
    'arReports',
    'profitLossReports'
  ],
  studio: [
    'crm',
    'automations',
    'vendors',
    'marketing',
    'quoteAutomation',
    'deliveries',
    'jobAutomation',
    'tasks',
    'paymentsExpenses',
    'materials',
    'reports',
    'accounting',
    'payroll',
    'leadPipeline',
    'roleManagement',
    'quoteBuilder',
    'pricingTemplates',
    'jobWorkflow',
    'materialsTracking',
    'vendorPriceLists',
    'payments',
    'expenses',
    'invoices',
    'autoInvoicing',
    'basicReports',
    'salesReports',
    'arReports',
    'profitLossReports',
    'studioLocationsModule',
    'watch'
  ],
  pharmacy: [
    'crm',
    'automations',
    'vendors',
    'marketing',
    'quoteAutomation',
    'leadPipeline',
    'materials',
    'deliveries',
    'paymentsExpenses',
    'reports',
    'accounting',
    'payroll',
    'roleManagement',
    'tasks',
    'dealersAccount',
    'pharmacyManagement',
    'watch',
    'prescriptions',
    'materialsTracking',
    'payments',
    'expenses',
    'invoices',
    'basicReports',
    'salesReports',
    'arReports',
    'profitLossReports'
  ],
  rental: [
    'crm',
    'automations',
    'vendors',
    'marketing',
    'leadPipeline',
    'materials',
    'deliveries',
    'paymentsExpenses',
    'reports',
    'accounting',
    'payroll',
    'roleManagement',
    'tasks',
    'dealersAccount',
    'materialsTracking',
    'payments',
    'expenses',
    'invoices',
    'basicReports',
    'salesReports',
    'arReports',
    'profitLossReports',
    'rentals',
    'products',
    'shopsModule',
    'watch'
  ]
};

// Legacy: map old businessType values to new (for tenants not yet migrated)
const LEGACY_TO_STUDIO = ['printing_press', 'mechanic', 'barber', 'salon'];
const DEFAULT_BUSINESS_TYPE = 'shop';
const DEFAULT_SHOP_TYPE = 'other';

/** Shop types that hide Quotes (aligned with web/mobile QUOTES_HIDDEN_SHOP_TYPES). */
const QUOTES_HIDDEN_SHOP_TYPES = ['restaurant'];
const ORDERS_ENABLED_SHOP_TYPES = ['restaurant'];

const getTenantShopType = (tenant) => {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const resolved = resolveBusinessType(tenant?.businessType || DEFAULT_BUSINESS_TYPE);
  if (resolved !== 'shop') return null;
  return metadata.shopType || metadata.businessSubType || DEFAULT_SHOP_TYPE;
};

/**
 * Whether Quotes should be available for this tenant (web/mobile parity).
 * @param {string|null} businessType
 * @param {string|null} shopType
 */
const isQuotesEnabledForTenant = (businessType, shopType) => {
  const resolved = resolveBusinessType(businessType);
  if (resolved === 'studio' || resolved === 'pharmacy') return true;
  if (resolved === 'shop') {
    return !QUOTES_HIDDEN_SHOP_TYPES.includes(shopType || '');
  }
  if (resolved === 'rental') return false;
  return false;
};

/**
 * Plan-enabled features after business-type and tenant-config gates (e.g. restaurant shops).
 * @param {string[]} enabledFeatures
 * @param {object} tenant
 */
const filterFeaturesForTenant = (enabledFeatures, tenant) => {
  if (!Array.isArray(enabledFeatures)) return [];
  let filtered = enabledFeatures;
  if (tenant?.businessType) {
    const allowed = getFeaturesForBusinessType(tenant.businessType);
    filtered = filtered.filter((f) => allowed.includes(f));
  }
  const shopType = getTenantShopType(tenant);
  if (!isQuotesEnabledForTenant(tenant?.businessType, shopType)) {
    filtered = filtered.filter((f) => f !== 'quoteAutomation');
  }
  if (resolveBusinessType(tenant?.businessType) === 'shop' && !ORDERS_ENABLED_SHOP_TYPES.includes(shopType || '')) {
    filtered = filtered.filter((f) => f !== 'orders');
  }
  return filtered;
};

/**
 * Core modules always enabled for a resolved business type, even when the plan tier
 * omits them (e.g. starter rental tenants need `rentals` though it is professional-only in plans).
 */
const BUSINESS_TYPE_CORE_FEATURES = {
  rental: ['rentals', 'shopsModule'],
};

/**
 * Apply tenant feature gates to a feature-flag object (for /auth/me and API enforcement).
 */
const applyFeatureGatesToFlags = (effectiveFeatureFlags, tenant) => {
  const enabled = filterFeaturesForTenant(
    Object.keys(effectiveFeatureFlags || {}).filter((k) => effectiveFeatureFlags[k] === true),
    tenant
  );
  const enabledSet = new Set(enabled);
  const result = { ...(effectiveFeatureFlags || {}) };
  for (const key of Object.keys(result)) {
    if (result[key] === true && !enabledSet.has(key)) {
      result[key] = false;
    }
  }
  const resolved = resolveBusinessType(tenant?.businessType);
  for (const key of BUSINESS_TYPE_CORE_FEATURES[resolved] || []) {
    if (isFeatureAvailableForBusinessType(tenant?.businessType, key)) {
      result[key] = true;
    }
  }
  return result;
};

/**
 * Resolve effective business type (handles legacy values)
 * @param {string} businessType - From tenant
 * @returns {string} 'shop' | 'studio' | 'pharmacy' | 'rental'
 */
const resolveBusinessType = (businessType) => {
  if (!businessType) return DEFAULT_BUSINESS_TYPE;
  if (LEGACY_TO_STUDIO.includes(businessType)) return 'studio';
  if (['shop', 'studio', 'pharmacy', 'rental'].includes(businessType)) return businessType;
  return DEFAULT_BUSINESS_TYPE;
};

/**
 * Get features available for a business type
 * @param {string} businessType - The business type
 * @returns {string[]} Array of feature keys
 */
const getFeaturesForBusinessType = (businessType) => {
  const resolved = resolveBusinessType(businessType);
  return BUSINESS_TYPE_FEATURES[resolved] || [];
};

/**
 * Check if a feature is available for a business type
 */
const isFeatureAvailableForBusinessType = (businessType, featureKey) => {
  const features = getFeaturesForBusinessType(businessType);
  return features.includes(featureKey);
};

/**
 * Get business type display name
 */
const getBusinessTypeDisplayName = (businessType) => {
  const resolved = resolveBusinessType(businessType);
  const displayNames = {
    shop: 'Shop',
    studio: 'Studio',
    pharmacy: 'Pharmacy',
    rental: 'Rental'
  };
  return displayNames[resolved] || businessType;
};

module.exports = {
  BUSINESS_TYPE_FEATURES,
  DEFAULT_BUSINESS_TYPE,
  DEFAULT_SHOP_TYPE,
  QUOTES_HIDDEN_SHOP_TYPES,
  ORDERS_ENABLED_SHOP_TYPES,
  resolveBusinessType,
  getFeaturesForBusinessType,
  isFeatureAvailableForBusinessType,
  getBusinessTypeDisplayName,
  getTenantShopType,
  isQuotesEnabledForTenant,
  filterFeaturesForTenant,
  applyFeatureGatesToFlags,
};
