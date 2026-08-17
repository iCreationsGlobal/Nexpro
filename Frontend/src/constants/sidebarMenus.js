import { STUDIO_LIKE_TYPES, isQuotesEnabledForTenant } from './index.js';
import { isSabitoStoreEnabled } from '../utils/sabitoStoreFeature';

/** Core navigation items that must always remain visible in the sidebar. */
export const LOCKED_SIDEBAR_KEYS = [
  '/dashboard',
  '/settings',
  '/profile',
  '/sales',
  '/orders',
  '/products',
  '/jobs',
  '/customers',
  '/dealers',
  '/invoices',
  '/expenses',
];

/** Optional sidebar route keys users may hide. */
export const CONFIGURABLE_SIDEBAR_KEYS = [
  'store',
  '/store',
  '/store/listings',
  '/store/services',
  '/store/orders',
  '/store/settings',
  'online-store',
  '/online-store',
  '/online-store/orders',
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
  'compliance',
  '/compliance/statements',
  '/compliance/vat',
  '/compliance/evat',
  '/export-data',
  '/users',
];

const LOCKED_KEY_SET = new Set(LOCKED_SIDEBAR_KEYS);
const CONFIGURABLE_KEY_SET = new Set(CONFIGURABLE_SIDEBAR_KEYS);

const STORE_CHILD_KEYS = [
  '/store',
  '/store/listings',
  '/store/services',
  '/store/orders',
  '/store/settings',
];

const ADVANCED_CHILD_KEYS = [
  '/reviews',
  '/deliveries',
  '/tasks',
  '/automations',
  '/leads',
  '/marketing',
  '/vendors',
  '/dealers',
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
];

const REPORTS_CHILD_KEYS = [
  '/reports/overview',
  '/reports/smart-report',
  '/export-data',
  '/users',
];

const COMPLIANCE_CHILD_KEYS = [
  '/compliance/statements',
  '/compliance/vat',
  '/compliance/evat',
];

/**
 * Grouped sidebar menu options for the Settings UI.
 * @type {Array<{ id: string, label: string, items: Array<{ key: string, label: string, description?: string, managerOnly?: boolean }> }>}
 */
export const SIDEBAR_MENU_GROUPS = [
  {
    id: 'store',
    label: 'Sabito Store',
    items: [
      { key: 'store', label: 'Sabito Store section', description: 'Hide the entire Sabito Store menu group' },
      { key: '/store', label: 'Store dashboard' },
      { key: '/store/listings', label: 'Store listings' },
      { key: '/store/services', label: 'Studio services' },
      { key: '/store/orders', label: 'Sabito orders' },
      { key: '/store/settings', label: 'Store settings', managerOnly: true },
    ],
  },
  {
    id: 'online-store',
    label: 'Online Store',
    items: [
      { key: 'online-store', label: 'Online Store section', description: 'Hide the entire Online Store menu group' },
      { key: '/online-store', label: 'Storefront' },
      { key: '/online-store/orders', label: 'Orders' },
    ],
  },
  {
    id: 'assets',
    label: 'Assets',
    items: [
      { key: 'company-assets', label: 'Assets section', description: 'Hide the entire assets menu group' },
      { key: '/merchandise', label: 'Merchandise', managerOnly: true },
      { key: '/materials', label: 'Materials' },
      { key: '/equipment', label: 'Equipment' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { key: 'advanced', label: 'Advanced section', description: 'Hide the entire advanced menu group' },
      { key: '/reviews', label: 'Reviews' },
      { key: '/deliveries', label: 'Deliveries' },
      { key: '/tasks', label: 'Tasks' },
      { key: '/automations', label: 'Automations', managerOnly: true },
      { key: '/leads', label: 'Leads' },
      { key: '/marketing', label: 'Marketing', managerOnly: true },
      { key: '/vendors', label: 'Vendors' },
      { key: '/dealers', label: 'Dealers' },
      { key: '/quotes', label: 'Quotes' },
      { key: '/shops', label: 'Shops', managerOnly: true },
      { key: '/pharmacies', label: 'Pharmacies' },
      { key: '/prescriptions', label: 'Prescriptions' },
      { key: '/drugs', label: 'Drugs' },
      { key: '/pricing', label: 'Pricing' },
      { key: '/studio-locations', label: 'Studios', managerOnly: true },
      { key: '/employees', label: 'Employees', managerOnly: true },
    ],
  },
  {
    id: 'finance',
    label: 'Finance & HR',
    items: [
      { key: '/payroll', label: 'Payroll', managerOnly: true },
      { key: '/accounting', label: 'Accounting', managerOnly: true },
    ],
  },
  {
    id: 'reports',
    label: 'Data & reports',
    items: [
      { key: 'reports', label: 'Data & Reports section', description: 'Hide the entire reports menu group' },
      { key: '/reports/overview', label: 'Overview', managerOnly: true },
      { key: '/reports/smart-report', label: 'Smart report', managerOnly: true },
      { key: '/export-data', label: 'Export data', managerOnly: true },
      { key: '/users', label: 'Users', managerOnly: true },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    items: [
      { key: 'compliance', label: 'Compliance section', description: 'Hide the entire compliance menu group', managerOnly: true },
      { key: '/compliance/statements', label: 'Statements', managerOnly: true },
      { key: '/compliance/vat', label: 'VAT', managerOnly: true },
      { key: '/compliance/evat', label: 'e-VAT', managerOnly: true },
    ],
  },
];

/**
 * Whether a configurable sidebar key is relevant for the tenant's business type and features.
 * Mirrors visibility rules in Sidebar.jsx getMenuItems().
 * @param {string} key
 * @param {{ businessType?: string|null, shopType?: string|null, hasFeature?: (key: string) => boolean, isPlatformAdmin?: boolean }} ctx
 * @returns {boolean}
 */
export const isConfigurableSidebarKeyForTenant = (key, ctx = {}) => {
  const {
    businessType = null,
    shopType = null,
    hasFeature = () => true,
    isPlatformAdmin = false,
  } = ctx;
  const isStudio = STUDIO_LIKE_TYPES.includes(businessType);
  const sabitoStoreEnabled = isSabitoStoreEnabled();

  switch (key) {
    case 'store':
      return (
        sabitoStoreEnabled &&
        !isPlatformAdmin &&
        STORE_CHILD_KEYS.some((childKey) =>
          isConfigurableSidebarKeyForTenant(childKey, ctx)
        )
      );
    case '/store':
    case '/store/settings':
      return sabitoStoreEnabled && !isPlatformAdmin;
    case '/store/listings':
    case '/store/orders':
      return sabitoStoreEnabled && !isPlatformAdmin && !isStudio;
    case '/store/services':
      return sabitoStoreEnabled && !isPlatformAdmin && isStudio;

    case 'online-store':
      return (
        !isPlatformAdmin &&
        ['/online-store', '/online-store/orders'].some((childKey) =>
          isConfigurableSidebarKeyForTenant(childKey, ctx)
        )
      );
    case '/online-store':
      return !isPlatformAdmin;
    case '/online-store/orders':
      return !isPlatformAdmin && !isStudio;

    case 'company-assets':
    case '/materials':
    case '/equipment':
      return hasFeature('materials');
    case '/merchandise':
      return (
        hasFeature('materials') &&
        ((businessType === 'shop' && hasFeature('products')) ||
          (businessType === 'pharmacy' && hasFeature('pharmacyOps')))
      );

    case 'advanced':
      return ADVANCED_CHILD_KEYS.some((childKey) =>
        isConfigurableSidebarKeyForTenant(childKey, ctx)
      );
    case '/reviews':
      return !isPlatformAdmin && hasFeature('crm');
    case '/deliveries':
      return hasFeature('deliveries');
    case '/tasks':
      return !isPlatformAdmin && hasFeature('jobAutomation');
    case '/automations':
      return hasFeature('automations');
    case '/leads':
      return !isPlatformAdmin && hasFeature('leadPipeline');
    case '/marketing':
      return hasFeature('marketing');
    case '/vendors':
      return hasFeature('vendors');
    case '/dealers':
      return !isPlatformAdmin && !isStudio && hasFeature('dealersAccount');
    case '/payroll':
      return hasFeature('payroll');
    case '/accounting':
      return hasFeature('accounting');
    case '/quotes':
      return (
        hasFeature('quoteAutomation') &&
        isQuotesEnabledForTenant(businessType, shopType)
      );
    case '/employees':
      return hasFeature('payroll');
    case '/shops':
      return businessType === 'shop' && hasFeature('shopsModule');
    case '/pharmacies':
    case '/prescriptions':
    case '/drugs':
      return businessType === 'pharmacy' && hasFeature('pharmacyOps');
    case '/pricing':
      return hasFeature('pricingTemplates') && isStudio;
    case '/studio-locations':
      return isStudio && hasFeature('studioLocationsModule');

    case 'reports':
      return REPORTS_CHILD_KEYS.some((childKey) =>
        isConfigurableSidebarKeyForTenant(childKey, ctx)
      );
    case '/reports/overview':
    case '/reports/smart-report':
      return hasFeature('reports');
    case 'compliance':
      return COMPLIANCE_CHILD_KEYS.some((childKey) =>
        isConfigurableSidebarKeyForTenant(childKey, ctx)
      );
    case '/compliance/statements':
    case '/compliance/vat':
    case '/compliance/evat':
      return hasFeature('reports');
    case '/export-data':
      return hasFeature('advancedReporting');
    case '/users':
      return hasFeature('roleManagement');

    default:
      return false;
  }
};

/**
 * Filter sidebar menu groups for the Settings UI by workspace business type and features.
 * @param {typeof SIDEBAR_MENU_GROUPS} groups
 * @param {{ businessType?: string|null, shopType?: string|null, hasFeature?: (key: string) => boolean, isPlatformAdmin?: boolean, isManagerOrAdmin?: boolean }} ctx
 * @returns {typeof SIDEBAR_MENU_GROUPS}
 */
export const filterSidebarMenuGroupsForBusinessType = (groups, ctxOrBusinessType = {}, shopType = null) => {
  const normalizedCtx =
    typeof ctxOrBusinessType === 'string'
      ? {
          businessType: ctxOrBusinessType,
          shopType,
          hasFeature: () => true,
          isPlatformAdmin: false,
        }
      : ctxOrBusinessType;
  const { isManagerOrAdmin = false } = normalizedCtx;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.managerOnly && !isManagerOrAdmin) return false;
        return isConfigurableSidebarKeyForTenant(item.key, normalizedCtx);
      }),
    }))
    .filter((group) => group.items.length > 0);
};

/**
 * Drop hidden keys that do not apply to the tenant's business type or features.
 * @param {string[]} hiddenKeys
 * @param {Parameters<typeof isConfigurableSidebarKeyForTenant>[1]} ctx
 * @returns {string[]}
 */
export const filterHiddenSidebarKeysForTenant = (hiddenKeys, ctx = {}) => {
  return sanitizeHiddenSidebarKeys(hiddenKeys).filter((key) =>
    isConfigurableSidebarKeyForTenant(key, ctx)
  );
};

/**
 * Remove hidden keys from nav items; locked keys are never removed.
 * @param {Array} items - Sidebar nav items
 * @param {string[]} hiddenKeys - Keys to hide
 * @returns {Array}
 */
export const filterHiddenNavItems = (items, hiddenKeys = []) => {
  if (!Array.isArray(items) || !hiddenKeys?.length) return items;
  const hidden = new Set(
    hiddenKeys.filter((key) => typeof key === 'string' && !LOCKED_KEY_SET.has(key))
  );
  if (!hidden.size) return items;

  const filterList = (list) =>
    list
      .filter((item) => !hidden.has(item.key) || LOCKED_KEY_SET.has(item.key))
      .map((item) => {
        if (!item.children?.length) return item;
        const children = filterList(item.children);
        return { ...item, children };
      })
      .filter((item) => !item.children || item.children.length > 0);

  return filterList(items);
};

/**
 * @param {string[]} hiddenKeys
 * @returns {boolean}
 */
export const isSidebarKeyHidden = (hiddenKeys, key) => {
  if (!key || LOCKED_KEY_SET.has(key)) return false;
  return Array.isArray(hiddenKeys) && hiddenKeys.includes(key);
};

/**
 * @param {unknown} keys
 * @param {Parameters<typeof filterHiddenSidebarKeysForTenant>[1]} [ctx]
 * @returns {string[]}
 */
export const sanitizeHiddenSidebarKeys = (keys, ctx = null) => {
  if (!Array.isArray(keys)) return [];
  const seen = new Set();
  const result = [];
  for (const key of keys) {
    if (typeof key !== 'string') continue;
    const trimmed = key.trim();
    if (!trimmed || LOCKED_KEY_SET.has(trimmed) || !CONFIGURABLE_KEY_SET.has(trimmed)) continue;
    if (ctx && !isConfigurableSidebarKeyForTenant(trimmed, ctx)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};
