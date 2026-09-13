/**
 * Business type catalog for onboarding (aligned with web).
 * User picks ONE option; we send businessSubType and derive businessType/shopType for API.
 */

export const CORE_BUSINESS_TYPES = {
  SHOP: 'shop',
  STUDIO: 'studio',
  PHARMACY: 'pharmacy',
  RENTAL: 'rental',
} as const;

export const BUSINESS_GROUPS = {
  RETAIL: 'retail',
  PRINT_PHOTO: 'print_photo',
  BEAUTY: 'beauty',
  AUTO: 'auto',
  FOOD: 'food',
  HEALTH: 'health',
  SERVICES: 'services',
  RENTAL: 'rental',
} as const;

export type BusinessOption = {
  id: string;
  label: string;
  description: string;
  group: string;
  coreType: 'shop' | 'studio' | 'pharmacy' | 'rental';
  services?: string[];
};

export const BUSINESS_OPTIONS: BusinessOption[] = [
  { id: 'supermarket', label: 'Supermarket / Grocery store', description: 'Food, drinks, and household items with shelves and POS.', group: BUSINESS_GROUPS.RETAIL, coreType: CORE_BUSINESS_TYPES.SHOP, services: ['retail', 'fmcg'] },
  { id: 'provision_store', label: 'Provision store / Kiosk', description: 'Small corner shop, container, or table-top sales.', group: BUSINESS_GROUPS.RETAIL, coreType: CORE_BUSINESS_TYPES.SHOP, services: ['retail'] },
  { id: 'hardware_store', label: 'Hardware & building materials', description: 'Cement, iron rods, paint, tools, and construction items.', group: BUSINESS_GROUPS.RETAIL, coreType: CORE_BUSINESS_TYPES.SHOP, services: ['retail', 'building_materials'] },
  { id: 'electronics_shop', label: 'Electronics & phone shop', description: 'Phones, TVs, gadgets, and accessories.', group: BUSINESS_GROUPS.RETAIL, coreType: CORE_BUSINESS_TYPES.SHOP, services: ['retail', 'electronics'] },
  { id: 'fashion_boutique', label: 'Clothing & fashion boutique', description: 'Clothes, shoes, and fashion accessories.', group: BUSINESS_GROUPS.RETAIL, coreType: CORE_BUSINESS_TYPES.SHOP, services: ['retail', 'fashion'] },
  { id: 'cosmetics_shop', label: 'Cosmetics & beauty products', description: 'Hair, skin care, and beauty products.', group: BUSINESS_GROUPS.RETAIL, coreType: CORE_BUSINESS_TYPES.SHOP, services: ['retail', 'beauty_products'] },
  { id: 'stationery_bookshop', label: 'Bookshop & stationery', description: 'Books, school supplies, and office stationery.', group: BUSINESS_GROUPS.RETAIL, coreType: CORE_BUSINESS_TYPES.SHOP, services: ['retail', 'stationery'] },
  { id: 'printing_press', label: 'Print, Photo & Branding', description: 'e.g. Printing press, photo studio, signage, large format printing.', group: BUSINESS_GROUPS.PRINT_PHOTO, coreType: CORE_BUSINESS_TYPES.STUDIO, services: ['printing', 'design', 'photo', 'signage', 'large_format'] },
  { id: 'software_it_services', label: 'Software & IT Services', description: 'e.g. Software development, IT support, web & app development.', group: BUSINESS_GROUPS.PRINT_PHOTO, coreType: CORE_BUSINESS_TYPES.STUDIO, services: ['software', 'it_services', 'consulting'] },
  { id: 'other_professional_services', label: 'Other professional services', description: 'e.g. Consulting, training, clergy and other services not listed above.', group: BUSINESS_GROUPS.PRINT_PHOTO, coreType: CORE_BUSINESS_TYPES.STUDIO, services: ['other_services'] },
  { id: 'barber_shop', label: 'Barbering shop', description: 'Haircuts and grooming services.', group: BUSINESS_GROUPS.BEAUTY, coreType: CORE_BUSINESS_TYPES.STUDIO, services: ['haircut', 'grooming'] },
  { id: 'hair_salon', label: 'Hair salon / Beauty salon', description: 'Hair styling, braids, and beauty treatments.', group: BUSINESS_GROUPS.BEAUTY, coreType: CORE_BUSINESS_TYPES.STUDIO, services: ['hair_styling', 'beauty'] },
  { id: 'spa_nail_bar', label: 'Spa / Nail bar', description: 'Spa, nails, massage, and wellness services.', group: BUSINESS_GROUPS.BEAUTY, coreType: CORE_BUSINESS_TYPES.STUDIO, services: ['spa', 'nails', 'wellness'] },
  { id: 'mechanic_workshop', label: 'Mechanic workshop / Auto garage', description: 'Vehicle repairs and servicing.', group: BUSINESS_GROUPS.AUTO, coreType: CORE_BUSINESS_TYPES.STUDIO, services: ['auto_repair'] },
  { id: 'car_wash', label: 'Car wash & detailing', description: 'Car wash, interior cleaning, and detailing services.', group: BUSINESS_GROUPS.AUTO, coreType: CORE_BUSINESS_TYPES.STUDIO, services: ['car_wash', 'detailing'] },
  { id: 'restaurant', label: 'Restaurant / Fast food', description: 'Dine-in or takeaway food business.', group: BUSINESS_GROUPS.FOOD, coreType: CORE_BUSINESS_TYPES.SHOP, services: ['food_service', 'retail'] },
  { id: 'bakery', label: 'Bakery / Pastry shop', description: 'Bread, pastries, and baked goods.', group: BUSINESS_GROUPS.FOOD, coreType: CORE_BUSINESS_TYPES.SHOP, services: ['bakery', 'retail'] },
  { id: 'community_pharmacy', label: 'Community pharmacy', description: 'Retail pharmacy with prescriptions and OTC medicines.', group: BUSINESS_GROUPS.HEALTH, coreType: CORE_BUSINESS_TYPES.PHARMACY, services: ['prescriptions', 'otc_medicines'] },
  { id: 'clinic_pharmacy', label: 'Clinic / hospital pharmacy', description: 'Pharmacy inside a clinic or hospital.', group: BUSINESS_GROUPS.HEALTH, coreType: CORE_BUSINESS_TYPES.PHARMACY, services: ['prescriptions'] },
  { id: 'equipment_rental', label: 'Equipment & tool rental', description: 'Hire out tools, machinery, and equipment.', group: BUSINESS_GROUPS.RENTAL, coreType: CORE_BUSINESS_TYPES.RENTAL, services: ['equipment', 'tools', 'machinery'] },
  { id: 'event_rental', label: 'Event & party rental', description: 'Tents, chairs, sound systems, and event supplies.', group: BUSINESS_GROUPS.RENTAL, coreType: CORE_BUSINESS_TYPES.RENTAL, services: ['events', 'parties', 'tents', 'sound_systems'] },
  { id: 'vehicle_rental', label: 'Vehicle rental', description: 'Cars, bikes, and commercial vehicle hire.', group: BUSINESS_GROUPS.RENTAL, coreType: CORE_BUSINESS_TYPES.RENTAL, services: ['cars', 'bikes', 'commercial_vehicles'] },
  { id: 'general_rental', label: 'General rental', description: 'Other items and goods for hire.', group: BUSINESS_GROUPS.RENTAL, coreType: CORE_BUSINESS_TYPES.RENTAL, services: ['general'] },
  { id: 'other', label: 'Other', description: 'My business type is not listed here.', group: BUSINESS_GROUPS.SERVICES, coreType: CORE_BUSINESS_TYPES.SHOP, services: ['general'] },
];

export function findBusinessOptionById(id: string | undefined | null): BusinessOption | undefined {
  if (!id) return undefined;
  return BUSINESS_OPTIONS.find((opt) => opt.id === id);
}

/**
 * Get the core business type for a given business sub-type.
 * Falls back to 'shop' when the sub-type is unknown (matches web).
 */
export function getCoreTypeForBusinessSubType(id: string | undefined | null): 'shop' | 'studio' | 'pharmacy' | 'rental' {
  const option = findBusinessOptionById(id);
  if (option?.coreType) return option.coreType;
  return CORE_BUSINESS_TYPES.SHOP;
}

/** Group options by group key for UI */
export function getBusinessOptionsByGroup(): Record<string, BusinessOption[]> {
  const groups: Record<string, BusinessOption[]> = {};
  BUSINESS_OPTIONS.forEach((opt) => {
    const key = opt.group || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(opt);
  });
  return groups;
}

export const BUSINESS_GROUP_LABELS: Record<string, string> = {
  [BUSINESS_GROUPS.RETAIL]: 'Retail shops',
  [BUSINESS_GROUPS.PRINT_PHOTO]: 'Professional services',
  [BUSINESS_GROUPS.BEAUTY]: 'Beauty & Grooming',
  [BUSINESS_GROUPS.AUTO]: 'Auto & Workshop',
  [BUSINESS_GROUPS.FOOD]: 'Food & Drinks',
  [BUSINESS_GROUPS.HEALTH]: 'Health / Pharmacy',
  [BUSINESS_GROUPS.RENTAL]: 'Rental',
  [BUSINESS_GROUPS.SERVICES]: 'Other services',
};

/** Example text for each group (matches web onboarding). */
export const BUSINESS_GROUP_EXAMPLES: Record<string, string> = {
  [BUSINESS_GROUPS.RETAIL]: 'e.g. Supermarkets, provision stores, hardware shops, cosmetics shops',
  [BUSINESS_GROUPS.PRINT_PHOTO]: 'e.g. Printing press, photo studio, branding, software & IT services',
  [BUSINESS_GROUPS.BEAUTY]: 'e.g. Barbering shops, hair salons, spas and nail bars',
  [BUSINESS_GROUPS.AUTO]: 'e.g. Mechanic workshops, car wash and detailing',
  [BUSINESS_GROUPS.FOOD]: 'e.g. Restaurants, fast food joints, bakeries and pastry shops',
  [BUSINESS_GROUPS.HEALTH]: 'e.g. Community pharmacies, clinic or hospital pharmacies',
  [BUSINESS_GROUPS.RENTAL]: 'e.g. Equipment rental, event rental, vehicle rental',
  [BUSINESS_GROUPS.SERVICES]: 'e.g. Other professional and local services',
};
