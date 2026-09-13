/**
 * Sabito Partners marketplace categories.
 * Mirrors Frontend/src/constants/businessTypes.js BUSINESS_OPTIONS (id, label, coreType, group).
 * Studio onboarding coreType is `printing_press` (not workspace `studio`).
 */

const SABITO_PARTNER_CORE_TYPES = {
  SHOP: 'shop',
  STUDIO: 'printing_press',
  PHARMACY: 'pharmacy',
  RENTAL: 'rental',
};

const SABITO_PARTNER_GROUPS = {
  RETAIL: 'retail',
  PRINT_PHOTO: 'print_photo',
  BEAUTY: 'beauty',
  AUTO: 'auto',
  FOOD: 'food',
  HEALTH: 'health',
  SERVICES: 'services',
  RENTAL: 'rental',
};

const STUDIO_LIKE_TYPES = ['studio', 'printing_press', 'mechanic', 'barber', 'salon'];

/** @type {{ id: string, label: string, coreType: string, group: string }[]} */
const SABITO_PARTNER_CATEGORIES = [
  { id: 'supermarket', label: 'Supermarket / Grocery store', coreType: SABITO_PARTNER_CORE_TYPES.SHOP, group: SABITO_PARTNER_GROUPS.RETAIL },
  { id: 'provision_store', label: 'Provision store / Kiosk', coreType: SABITO_PARTNER_CORE_TYPES.SHOP, group: SABITO_PARTNER_GROUPS.RETAIL },
  { id: 'hardware_store', label: 'Hardware & building materials', coreType: SABITO_PARTNER_CORE_TYPES.SHOP, group: SABITO_PARTNER_GROUPS.RETAIL },
  { id: 'electronics_shop', label: 'Electronics & phone shop', coreType: SABITO_PARTNER_CORE_TYPES.SHOP, group: SABITO_PARTNER_GROUPS.RETAIL },
  { id: 'fashion_boutique', label: 'Clothing & fashion boutique', coreType: SABITO_PARTNER_CORE_TYPES.SHOP, group: SABITO_PARTNER_GROUPS.RETAIL },
  { id: 'cosmetics_shop', label: 'Cosmetics & beauty products', coreType: SABITO_PARTNER_CORE_TYPES.SHOP, group: SABITO_PARTNER_GROUPS.RETAIL },
  { id: 'stationery_bookshop', label: 'Bookshop & stationery', coreType: SABITO_PARTNER_CORE_TYPES.SHOP, group: SABITO_PARTNER_GROUPS.RETAIL },
  { id: 'printing_press', label: 'Print, Photo & Branding', coreType: SABITO_PARTNER_CORE_TYPES.STUDIO, group: SABITO_PARTNER_GROUPS.PRINT_PHOTO },
  { id: 'software_it_services', label: 'Software & IT Services', coreType: SABITO_PARTNER_CORE_TYPES.STUDIO, group: SABITO_PARTNER_GROUPS.PRINT_PHOTO },
  { id: 'other_professional_services', label: 'Other professional services', coreType: SABITO_PARTNER_CORE_TYPES.STUDIO, group: SABITO_PARTNER_GROUPS.PRINT_PHOTO },
  { id: 'barber_shop', label: 'Barbering shop', coreType: SABITO_PARTNER_CORE_TYPES.STUDIO, group: SABITO_PARTNER_GROUPS.BEAUTY },
  { id: 'hair_salon', label: 'Hair salon / Beauty salon', coreType: SABITO_PARTNER_CORE_TYPES.STUDIO, group: SABITO_PARTNER_GROUPS.BEAUTY },
  { id: 'spa_nail_bar', label: 'Spa / Nail bar', coreType: SABITO_PARTNER_CORE_TYPES.STUDIO, group: SABITO_PARTNER_GROUPS.BEAUTY },
  { id: 'mechanic_workshop', label: 'Mechanic workshop / Auto garage', coreType: SABITO_PARTNER_CORE_TYPES.STUDIO, group: SABITO_PARTNER_GROUPS.AUTO },
  { id: 'car_wash', label: 'Car wash & detailing', coreType: SABITO_PARTNER_CORE_TYPES.STUDIO, group: SABITO_PARTNER_GROUPS.AUTO },
  { id: 'restaurant', label: 'Restaurant / Fast food', coreType: SABITO_PARTNER_CORE_TYPES.SHOP, group: SABITO_PARTNER_GROUPS.FOOD },
  { id: 'bakery', label: 'Bakery / Pastry shop', coreType: SABITO_PARTNER_CORE_TYPES.SHOP, group: SABITO_PARTNER_GROUPS.FOOD },
  { id: 'community_pharmacy', label: 'Community pharmacy', coreType: SABITO_PARTNER_CORE_TYPES.PHARMACY, group: SABITO_PARTNER_GROUPS.HEALTH },
  { id: 'clinic_pharmacy', label: 'Clinic / hospital pharmacy', coreType: SABITO_PARTNER_CORE_TYPES.PHARMACY, group: SABITO_PARTNER_GROUPS.HEALTH },
  { id: 'equipment_rental', label: 'Equipment & tool rental', coreType: SABITO_PARTNER_CORE_TYPES.RENTAL, group: SABITO_PARTNER_GROUPS.RENTAL },
  { id: 'event_rental', label: 'Event & party rental', coreType: SABITO_PARTNER_CORE_TYPES.RENTAL, group: SABITO_PARTNER_GROUPS.RENTAL },
  { id: 'vehicle_rental', label: 'Vehicle rental', coreType: SABITO_PARTNER_CORE_TYPES.RENTAL, group: SABITO_PARTNER_GROUPS.RENTAL },
  { id: 'general_rental', label: 'General rental', coreType: SABITO_PARTNER_CORE_TYPES.RENTAL, group: SABITO_PARTNER_GROUPS.RENTAL },
  { id: 'other', label: 'Other', coreType: SABITO_PARTNER_CORE_TYPES.SHOP, group: SABITO_PARTNER_GROUPS.SERVICES },
];

const SABITO_PARTNER_GROUP_FILTERS = [
  { id: SABITO_PARTNER_GROUPS.RETAIL, label: 'Retail' },
  { id: SABITO_PARTNER_GROUPS.PRINT_PHOTO, label: 'Print & branding' },
  { id: SABITO_PARTNER_GROUPS.BEAUTY, label: 'Beauty' },
  { id: SABITO_PARTNER_GROUPS.AUTO, label: 'Auto' },
  { id: SABITO_PARTNER_GROUPS.FOOD, label: 'Food' },
  { id: SABITO_PARTNER_GROUPS.HEALTH, label: 'Health' },
  { id: SABITO_PARTNER_GROUPS.RENTAL, label: 'Rental' },
];

/**
 * @param {string|null|undefined} businessType
 * @returns {'shop'|'printing_press'|'pharmacy'|'rental'}
 */
const resolveSabitoPartnerCoreType = (businessType) => {
  const type = String(businessType || '').trim();
  if (type === SABITO_PARTNER_CORE_TYPES.RENTAL) return SABITO_PARTNER_CORE_TYPES.RENTAL;
  if (type === SABITO_PARTNER_CORE_TYPES.PHARMACY) return SABITO_PARTNER_CORE_TYPES.PHARMACY;
  if (type === SABITO_PARTNER_CORE_TYPES.SHOP) return SABITO_PARTNER_CORE_TYPES.SHOP;
  if (STUDIO_LIKE_TYPES.includes(type)) return SABITO_PARTNER_CORE_TYPES.STUDIO;
  return SABITO_PARTNER_CORE_TYPES.SHOP;
};

/**
 * @param {string|null|undefined} idOrLabel
 * @returns {{ id: string, label: string, coreType: string, group: string }|undefined}
 */
const findSabitoPartnerCategory = (idOrLabel) => {
  const value = String(idOrLabel || '').trim();
  if (!value) return undefined;
  const lower = value.toLowerCase();
  return SABITO_PARTNER_CATEGORIES.find(
    (opt) => opt.id === value || opt.label.toLowerCase() === lower
  );
};

/**
 * @param {string|null|undefined} idOrLabel
 * @param {string} [fallback]
 * @returns {string}
 */
const getSabitoPartnerCategoryLabel = (idOrLabel, fallback = 'Services') => {
  const found = findSabitoPartnerCategory(idOrLabel);
  if (found) return found.label;
  const raw = String(idOrLabel || '').trim();
  return raw || fallback;
};

/**
 * @param {object|null|undefined} tenant
 * @returns {string|null}
 */
const getTenantBusinessSubtype = (tenant) => {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  return metadata.shopType || metadata.studioType || metadata.businessSubType || null;
};

/**
 * @param {string|null|undefined} businessType
 * @param {{ subtype?: string|null }} [options]
 * @returns {{ id: string, label: string, coreType: string, group: string }[]}
 */
const getSabitoPartnerCategoryOptions = (businessType, { subtype } = {}) => {
  const coreType = resolveSabitoPartnerCoreType(businessType);
  const includeOther = subtype === 'other';
  return SABITO_PARTNER_CATEGORIES.filter((opt) => {
    if (opt.coreType !== coreType) return false;
    if (opt.id === 'other' && !includeOther) return false;
    return true;
  });
};

/**
 * @param {string|null|undefined} businessType
 * @param {string|null|undefined} subtype
 * @returns {string|null}
 */
const defaultSabitoPartnerCategoryId = (businessType, subtype) => {
  const options = getSabitoPartnerCategoryOptions(businessType, { subtype });
  if (subtype && options.some((opt) => opt.id === subtype)) return subtype;
  return null;
};

/**
 * @param {string|null|undefined} businessType
 * @param {string|null|undefined} category
 * @param {{ currentCategory?: string|null, subtype?: string|null }} [options]
 * @returns {boolean}
 */
const isAllowedSabitoPartnerCategory = (businessType, category, { currentCategory, subtype } = {}) => {
  const value = String(category || '').trim();
  if (!value) return true;
  if (currentCategory && value === currentCategory) return true;
  const options = getSabitoPartnerCategoryOptions(businessType, { subtype });
  const found = findSabitoPartnerCategory(value);
  return Boolean(found && options.some((opt) => opt.id === found.id));
};

/**
 * Values stored on partner_program_settings.category that match a public filter (id, label, or group).
 * @param {string|null|undefined} query
 * @returns {string[]|null} null means no category filter
 */
const resolvePublicCategoryFilterValues = (query) => {
  const value = String(query || '').trim();
  if (!value || value === 'All categories') return null;

  const asCategory = findSabitoPartnerCategory(value);
  if (asCategory) return [asCategory.id, asCategory.label];

  const group = SABITO_PARTNER_GROUP_FILTERS.find(
    (g) => g.id === value || g.label.toLowerCase() === value.toLowerCase()
  );
  if (group) {
    return SABITO_PARTNER_CATEGORIES.filter((opt) => opt.group === group.id).flatMap((opt) => [
      opt.id,
      opt.label,
    ]);
  }

  return [value];
};

module.exports = {
  SABITO_PARTNER_CORE_TYPES,
  SABITO_PARTNER_GROUPS,
  SABITO_PARTNER_CATEGORIES,
  SABITO_PARTNER_GROUP_FILTERS,
  resolveSabitoPartnerCoreType,
  findSabitoPartnerCategory,
  getSabitoPartnerCategoryLabel,
  getTenantBusinessSubtype,
  getSabitoPartnerCategoryOptions,
  defaultSabitoPartnerCategoryId,
  isAllowedSabitoPartnerCategory,
  resolvePublicCategoryFilterValues,
};
