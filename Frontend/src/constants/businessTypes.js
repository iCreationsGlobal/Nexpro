/**
 * Business type catalog for onboarding.
 *
 * Users pick ONE of these everyday business labels.
 * Internally we map each option to:
 * - coreType: 'shop' | 'printing_press' | 'pharmacy'
 * - optional services: to tune hints/UX later (no hard coupling yet)
 */

import { STUDIO_LIKE_TYPES } from './studioLikeTypes.js';

export const CORE_BUSINESS_TYPES = {
  SHOP: 'shop',
  STUDIO: 'printing_press',
  PHARMACY: 'pharmacy',
  RENTAL: 'rental',
};

export const BUSINESS_GROUPS = {
  RETAIL: 'retail',
  PRINT_PHOTO: 'print_photo',
  BEAUTY: 'beauty',
  AUTO: 'auto',
  FOOD: 'food',
  HEALTH: 'health',
  SERVICES: 'services',
  RENTAL: 'rental',
};

/**
 * @typedef {Object} BusinessOption
 * @property {string} id - Stable identifier (stored as businessSubType)
 * @property {string} label - User-facing label
 * @property {string} description - Short helper text
 * @property {string} group - One of BUSINESS_GROUPS
 * @property {'shop'|'printing_press'|'pharmacy'|'rental'} coreType - Core workflow type
 * @property {string[]} [services] - Optional list of services for future use
 */

/** @type {BusinessOption[]} */
export const BUSINESS_OPTIONS = [
  // Retail / POS focused
  {
    id: 'supermarket',
    label: 'Supermarket / Grocery store',
    description: 'Food, drinks, and household items with shelves and POS.',
    group: BUSINESS_GROUPS.RETAIL,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['retail', 'fmcg'],
  },
  {
    id: 'provision_store',
    label: 'Provision store / Kiosk',
    description: 'Small corner shop, container, or table-top sales.',
    group: BUSINESS_GROUPS.RETAIL,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['retail'],
  },
  {
    id: 'hardware_store',
    label: 'Hardware & building materials',
    description: 'Cement, iron rods, paint, tools, and construction items.',
    group: BUSINESS_GROUPS.RETAIL,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['retail', 'building_materials'],
  },
  {
    id: 'electronics_shop',
    label: 'Electronics & phone shop',
    description: 'Phones, TVs, gadgets, and accessories.',
    group: BUSINESS_GROUPS.RETAIL,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['retail', 'electronics'],
  },
  {
    id: 'fashion_boutique',
    label: 'Clothing & fashion boutique',
    description: 'Clothes, shoes, and fashion accessories.',
    group: BUSINESS_GROUPS.RETAIL,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['retail', 'fashion'],
  },
  {
    id: 'cosmetics_shop',
    label: 'Cosmetics & beauty products',
    description: 'Hair, skin care, and beauty products.',
    group: BUSINESS_GROUPS.RETAIL,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['retail', 'beauty_products'],
  },
  {
    id: 'stationery_bookshop',
    label: 'Bookshop & stationery',
    description: 'Books, school supplies, and office stationery.',
    group: BUSINESS_GROUPS.RETAIL,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['retail', 'stationery'],
  },
  {
    id: 'furniture_shop',
    label: 'Furniture shop',
    description: 'Home, office, and outdoor furniture.',
    group: BUSINESS_GROUPS.RETAIL,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['retail', 'furniture'],
  },

  // Professional services – Print, Photo & Branding (studio-like)
  {
    id: 'printing_press',
    label: 'Print, Photo & Branding',
    description: 'e.g. Printing press, photo studio, signage, large format printing.',
    group: BUSINESS_GROUPS.PRINT_PHOTO,
    coreType: CORE_BUSINESS_TYPES.STUDIO,
    services: ['printing', 'design', 'photo', 'signage', 'large_format'],
  },
  {
    id: 'software_it_services',
    label: 'Software & IT Services',
    description: 'e.g. Software development, IT support, web & app development.',
    group: BUSINESS_GROUPS.PRINT_PHOTO,
    coreType: CORE_BUSINESS_TYPES.STUDIO,
    services: ['software', 'it_services', 'consulting'],
  },
  {
    id: 'other_professional_services',
    label: 'Other professional services',
    description: 'e.g. Consulting, training, clergy and other services not listed above.',
    group: BUSINESS_GROUPS.PRINT_PHOTO,
    coreType: CORE_BUSINESS_TYPES.STUDIO,
    services: ['other_services'],
  },

  // Beauty & Grooming (studio-like)
  {
    id: 'barber_shop',
    label: 'Barbering shop',
    description: 'Haircuts and grooming services.',
    group: BUSINESS_GROUPS.BEAUTY,
    coreType: CORE_BUSINESS_TYPES.STUDIO,
    services: ['haircut', 'grooming'],
  },
  {
    id: 'hair_salon',
    label: 'Hair salon / Beauty salon',
    description: 'Hair styling, braids, and beauty treatments.',
    group: BUSINESS_GROUPS.BEAUTY,
    coreType: CORE_BUSINESS_TYPES.STUDIO,
    services: ['hair_styling', 'beauty'],
  },
  {
    id: 'spa_nail_bar',
    label: 'Spa / Nail bar',
    description: 'Spa, nails, massage, and wellness services.',
    group: BUSINESS_GROUPS.BEAUTY,
    coreType: CORE_BUSINESS_TYPES.STUDIO,
    services: ['spa', 'nails', 'wellness'],
  },

  // Auto & Workshop (studio-like)
  {
    id: 'mechanic_workshop',
    label: 'Mechanic workshop / Auto garage',
    description: 'Vehicle repairs and servicing.',
    group: BUSINESS_GROUPS.AUTO,
    coreType: CORE_BUSINESS_TYPES.STUDIO,
    services: ['auto_repair'],
  },
  {
    id: 'car_wash',
    label: 'Car wash & detailing',
    description: 'Car wash, interior cleaning, and detailing services.',
    group: BUSINESS_GROUPS.AUTO,
    coreType: CORE_BUSINESS_TYPES.STUDIO,
    services: ['car_wash', 'detailing'],
  },

  // Food & Drinks (retail / POS)
  {
    id: 'restaurant',
    label: 'Restaurant / Fast food',
    description: 'Dine-in or takeaway food business.',
    group: BUSINESS_GROUPS.FOOD,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['food_service', 'retail'],
  },
  {
    id: 'bakery',
    label: 'Bakery / Pastry shop',
    description: 'Bread, pastries, and baked goods.',
    group: BUSINESS_GROUPS.FOOD,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['bakery', 'retail'],
  },

  // Health / Pharmacy
  {
    id: 'community_pharmacy',
    label: 'Community pharmacy',
    description: 'Retail pharmacy with prescriptions and OTC medicines.',
    group: BUSINESS_GROUPS.HEALTH,
    coreType: CORE_BUSINESS_TYPES.PHARMACY,
    services: ['prescriptions', 'otc_medicines'],
  },
  {
    id: 'clinic_pharmacy',
    label: 'Clinic / hospital pharmacy',
    description: 'Pharmacy inside a clinic or hospital.',
    group: BUSINESS_GROUPS.HEALTH,
    coreType: CORE_BUSINESS_TYPES.PHARMACY,
    services: ['prescriptions'],
  },

  // Rental
  {
    id: 'equipment_rental',
    label: 'Equipment & tool rental',
    description: 'Hire out tools, machinery, and equipment.',
    group: BUSINESS_GROUPS.RENTAL,
    coreType: CORE_BUSINESS_TYPES.RENTAL,
    services: ['equipment', 'tools', 'machinery'],
  },
  {
    id: 'event_rental',
    label: 'Event & party rental',
    description: 'Tents, chairs, sound systems, and event supplies.',
    group: BUSINESS_GROUPS.RENTAL,
    coreType: CORE_BUSINESS_TYPES.RENTAL,
    services: ['events', 'parties', 'tents', 'sound_systems'],
  },
  {
    id: 'vehicle_rental',
    label: 'Vehicle rental',
    description: 'Cars, bikes, and commercial vehicle hire.',
    group: BUSINESS_GROUPS.RENTAL,
    coreType: CORE_BUSINESS_TYPES.RENTAL,
    services: ['cars', 'bikes', 'commercial_vehicles'],
  },
  {
    id: 'general_rental',
    label: 'General rental',
    description: 'Other items and goods for hire.',
    group: BUSINESS_GROUPS.RENTAL,
    coreType: CORE_BUSINESS_TYPES.RENTAL,
    services: ['general'],
  },

  // Other / custom business type
  {
    id: 'other',
    label: 'Other',
    description: 'My business type is not listed here.',
    group: BUSINESS_GROUPS.SERVICES,
    coreType: CORE_BUSINESS_TYPES.SHOP,
    services: ['general'],
  },
];

/**
 * Find a business option by id.
 * @param {string|undefined|null} id
 * @returns {BusinessOption|undefined}
 */
export function findBusinessOptionById(id) {
  if (!id) return undefined;
  return BUSINESS_OPTIONS.find((opt) => opt.id === id);
}

/**
 * Get business options for a core workflow type.
 * @param {'shop'|'printing_press'|'pharmacy'|'rental'} coreType
 * @returns {BusinessOption[]}
 */
export function getBusinessOptionsByCoreType(coreType) {
  return BUSINESS_OPTIONS.filter((opt) => opt.coreType === coreType);
}

/**
 * Get the display label for a stored business sub-type id.
 * @param {string|undefined|null} id
 * @returns {string}
 */
export function getBusinessOptionLabel(id) {
  return findBusinessOptionById(id)?.label || '';
}

/**
 * Get the core business type for a given business sub-type.
 * Falls back to 'shop' when the sub-type is unknown.
 * @param {string|undefined|null} id
 * @returns {'shop'|'printing_press'|'pharmacy'|'rental'}
 */
export function getCoreTypeForBusinessSubType(id) {
  const option = findBusinessOptionById(id);
  if (option && option.coreType) return option.coreType;
  return CORE_BUSINESS_TYPES.SHOP;
}

export const SABITO_PARTNER_CATEGORY_GROUPS = [
  { id: BUSINESS_GROUPS.RETAIL, label: 'Retail' },
  { id: BUSINESS_GROUPS.PRINT_PHOTO, label: 'Print & branding' },
  { id: BUSINESS_GROUPS.BEAUTY, label: 'Beauty' },
  { id: BUSINESS_GROUPS.AUTO, label: 'Auto' },
  { id: BUSINESS_GROUPS.FOOD, label: 'Food' },
  { id: BUSINESS_GROUPS.HEALTH, label: 'Health' },
  { id: BUSINESS_GROUPS.RENTAL, label: 'Rental' },
];

/**
 * Map workspace businessType (shop | studio | pharmacy | rental, plus legacy studio values)
 * to onboarding coreType used by BUSINESS_OPTIONS.
 * @param {string|null|undefined} businessType
 * @returns {'shop'|'printing_press'|'pharmacy'|'rental'}
 */
export function resolveSabitoPartnerCoreType(businessType) {
  const type = String(businessType || '').trim();
  if (type === CORE_BUSINESS_TYPES.RENTAL) return CORE_BUSINESS_TYPES.RENTAL;
  if (type === CORE_BUSINESS_TYPES.PHARMACY) return CORE_BUSINESS_TYPES.PHARMACY;
  if (type === CORE_BUSINESS_TYPES.SHOP) return CORE_BUSINESS_TYPES.SHOP;
  if (STUDIO_LIKE_TYPES.includes(type)) return CORE_BUSINESS_TYPES.STUDIO;
  return CORE_BUSINESS_TYPES.SHOP;
}

/**
 * @param {string|null|undefined} idOrLabel
 * @returns {BusinessOption|undefined}
 */
export function findSabitoPartnerCategory(idOrLabel) {
  const value = String(idOrLabel || '').trim();
  if (!value) return undefined;
  const lower = value.toLowerCase();
  return BUSINESS_OPTIONS.find((opt) => opt.id === value || opt.label.toLowerCase() === lower);
}

/**
 * @param {string|null|undefined} idOrLabel
 * @param {string} [fallback]
 * @returns {string}
 */
export function getSabitoPartnerCategoryLabel(idOrLabel, fallback = 'Services') {
  const found = findSabitoPartnerCategory(idOrLabel);
  if (found) return found.label;
  const raw = String(idOrLabel || '').trim();
  return raw || fallback;
}

/**
 * @param {object|null|undefined} tenant
 * @returns {string|null}
 */
export function getTenantSabitoSubtype(tenant) {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  return metadata.shopType || metadata.studioType || metadata.businessSubType || null;
}

/**
 * Category dropdown options for a workspace type.
 * Excludes shop `other` unless that is already the tenant subtype.
 * @param {string|null|undefined} businessType
 * @param {{ subtype?: string|null }} [options]
 * @returns {BusinessOption[]}
 */
export function getSabitoPartnerCategoryOptions(businessType, { subtype } = {}) {
  const coreType = resolveSabitoPartnerCoreType(businessType);
  const includeOther = subtype === 'other';
  return BUSINESS_OPTIONS.filter((opt) => {
    if (opt.coreType !== coreType) return false;
    if (opt.id === 'other' && !includeOther) return false;
    return true;
  });
}

/**
 * Select value: saved id/label if it belongs to this workspace, else tenant subtype, else empty.
 * @param {{ savedCategory?: string|null, subtype?: string|null, options?: BusinessOption[] }} args
 * @returns {string}
 */
export function resolveSabitoPartnerCategoryId({ savedCategory, subtype, options } = {}) {
  const list = options || BUSINESS_OPTIONS;
  const saved = findSabitoPartnerCategory(savedCategory);
  if (saved && list.some((opt) => opt.id === saved.id)) return saved.id;
  if (subtype && list.some((opt) => opt.id === subtype)) return subtype;
  return '';
}

