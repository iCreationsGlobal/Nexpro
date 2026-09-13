/** Business types that use studio-like workflows (jobs, quotes, pricing, etc.). */
const STUDIO_LIKE_TYPES = Object.freeze([
  'printing_press',
  'mechanic',
  'barber',
  'salon',
  'studio',
]);

const QUOTES_HIDDEN_SHOP_TYPES = ['restaurant'];

/** Route keys users may hide from the sidebar (optional items only). */
const CONFIGURABLE_SIDEBAR_KEYS = [
  'store',
  '/store',
  '/store/listings',
  '/store/services',
  '/store/orders',
  '/store/settings',
  'company-assets',
  '/merchandise',
  '/materials',
  '/equipment',
  'advanced',
  '/reviews',
  '/deliveries',
  '/tasks',
  '/automations',
  '/leads',
  '/messages',
  '/marketing',
  '/vendors',
  '/payroll',
  '/accounting',
  '/quotes',
  '/employees',
  '/shops',
  '/pharmacies',
  '/prescriptions',
  '/drugs',
  '/pricing',
  '/studio-locations',
  'reports',
  '/reports/overview',
  '/reports/smart-report',
  '/reports/compliance',
  '/export-data',
  '/users',
];

/** Menu keys only relevant to shop workspaces. */
const SHOP_ONLY_SIDEBAR_KEYS = new Set([
  '/shops',
  '/store/listings',
  '/store/orders',
]);

/** Menu keys only relevant to pharmacy workspaces. */
const PHARMACY_ONLY_SIDEBAR_KEYS = new Set([
  '/pharmacies',
  '/prescriptions',
  '/drugs',
]);

/** Menu keys only relevant to retail workspaces that sell tracked stock (shop or pharmacy). */
const RETAIL_ONLY_SIDEBAR_KEYS = new Set([
  '/merchandise',
]);

/** Menu keys only relevant to studio-like workspaces. */
const STUDIO_ONLY_SIDEBAR_KEYS = new Set([
  '/studio-locations',
  '/pricing',
  '/store/services',
]);

/** Core navigation items that must always remain visible. */
const LOCKED_SIDEBAR_KEYS = [
  '/dashboard',
  '/settings',
  '/profile',
  '/sales',
  '/watch',
  '/orders',
  '/products',
  '/jobs',
  '/customers',
  '/invoices',
  '/expenses',
];

const CONFIGURABLE_KEY_SET = new Set(CONFIGURABLE_SIDEBAR_KEYS);
const LOCKED_KEY_SET = new Set(LOCKED_SIDEBAR_KEYS);

/**
 * Whether quotes are enabled for a tenant (mirrors frontend isQuotesEnabledForTenant).
 * @param {string|null|undefined} businessType
 * @param {string|null|undefined} shopType
 * @returns {boolean}
 */
const isQuotesEnabledForTenant = (businessType, shopType = null) => {
  if (!businessType) return false;
  if (STUDIO_LIKE_TYPES.includes(businessType) || businessType === 'pharmacy') return true;
  if (businessType === 'shop') {
    return !QUOTES_HIDDEN_SHOP_TYPES.includes(shopType || '');
  }
  return false;
};

/**
 * Whether a configurable sidebar key applies to the given workspace business type.
 * @param {string} key
 * @param {string|null|undefined} businessType
 * @param {string|null|undefined} [shopType]
 * @returns {boolean}
 */
const isSidebarMenuKeyAllowedForBusinessType = (key, businessType, shopType = null) => {
  if (!key || typeof key !== 'string') return false;
  const isStudio = STUDIO_LIKE_TYPES.includes(businessType);
  const isShop = businessType === 'shop';
  const isPharmacy = businessType === 'pharmacy';

  if (key === '/shops') return isShop || businessType === 'rental';
  if (SHOP_ONLY_SIDEBAR_KEYS.has(key)) return isShop;
  if (PHARMACY_ONLY_SIDEBAR_KEYS.has(key)) return isPharmacy;
  if (RETAIL_ONLY_SIDEBAR_KEYS.has(key)) return isShop || isPharmacy;
  if (STUDIO_ONLY_SIDEBAR_KEYS.has(key)) return isStudio;
  if (key === '/quotes') return isQuotesEnabledForTenant(businessType, shopType);

  return true;
};

/**
 * Resolve shop type from tenant metadata.
 * @param {object|null|undefined} tenantMetadata
 * @returns {string|null}
 */
const getShopTypeFromMetadata = (tenantMetadata) => {
  if (!tenantMetadata || typeof tenantMetadata !== 'object') return null;
  return tenantMetadata.businessSubType || tenantMetadata.shopType || null;
};

/**
 * Normalize stored hidden sidebar keys from user-tenant metadata.
 * @param {unknown} metadata - UserTenant.metadata
 * @param {string|null|undefined} [businessType]
 * @param {string|null|undefined} [shopType]
 * @returns {string[]}
 */
const getHiddenSidebarKeys = (metadata, businessType = null, shopType = null) => {
  const raw = metadata?.hiddenSidebarKeys;
  if (!Array.isArray(raw)) return [];
  return sanitizeHiddenSidebarKeys(raw, businessType, shopType);
};

/**
 * Tenant-wide default hidden sidebar keys (platform admin configurable).
 * @param {unknown} tenantMetadata - Tenant.metadata
 * @param {string|null|undefined} [businessType]
 * @param {string|null|undefined} [shopType]
 * @returns {string[]}
 */
const getTenantDefaultHiddenSidebarKeys = (
  tenantMetadata,
  businessType = null,
  shopType = null
) => {
  const raw = tenantMetadata?.defaultHiddenSidebarKeys;
  if (!Array.isArray(raw)) return [];
  return sanitizeHiddenSidebarKeys(raw, businessType, shopType);
};

/**
 * Keep only configurable keys; drop locked, unknown, and business-type-inapplicable values.
 * @param {unknown} keys
 * @param {string|null|undefined} [businessType]
 * @param {string|null|undefined} [shopType]
 * @returns {string[]}
 */
const sanitizeHiddenSidebarKeys = (keys, businessType = null, shopType = null) => {
  if (!Array.isArray(keys)) return [];
  const seen = new Set();
  const result = [];
  for (const key of keys) {
    if (typeof key !== 'string') continue;
    const trimmed = key.trim();
    if (!trimmed || LOCKED_KEY_SET.has(trimmed) || !CONFIGURABLE_KEY_SET.has(trimmed)) continue;
    if (
      businessType &&
      !isSidebarMenuKeyAllowedForBusinessType(trimmed, businessType, shopType)
    ) {
      continue;
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};

/**
 * Build API payload for sidebar preferences.
 * Falls back to tenant defaults when the user has not customized their sidebar.
 * @param {object|null|undefined} membership - UserTenant instance or plain object
 * @param {object|null|undefined} [tenantMetadata] - Tenant.metadata for workspace defaults
 * @param {string|null|undefined} [businessType] - Tenant.businessType
 * @returns {{ hiddenSidebarKeys: string[], source: 'user'|'tenant_default'|'none' }}
 */
const getSidebarPreferences = (membership, tenantMetadata = null, businessType = null) => {
  const shopType = getShopTypeFromMetadata(tenantMetadata);
  const metadata =
    membership?.metadata && typeof membership.metadata === 'object'
      ? membership.metadata
      : {};

  if (Array.isArray(metadata.hiddenSidebarKeys)) {
    return {
      hiddenSidebarKeys: getHiddenSidebarKeys(metadata, businessType, shopType),
      source: 'user',
    };
  }

  const tenantDefaults = getTenantDefaultHiddenSidebarKeys(
    tenantMetadata,
    businessType,
    shopType
  );
  if (tenantDefaults.length > 0) {
    return {
      hiddenSidebarKeys: tenantDefaults,
      source: 'tenant_default',
    };
  }

  return {
    hiddenSidebarKeys: [],
    source: 'none',
  };
};

module.exports = {
  CONFIGURABLE_SIDEBAR_KEYS,
  LOCKED_SIDEBAR_KEYS,
  STUDIO_LIKE_TYPES,
  isSidebarMenuKeyAllowedForBusinessType,
  getShopTypeFromMetadata,
  getHiddenSidebarKeys,
  getTenantDefaultHiddenSidebarKeys,
  sanitizeHiddenSidebarKeys,
  getSidebarPreferences,
};
