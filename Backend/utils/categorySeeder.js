/**
 * Category Seeder Utility
 * 
 * Seeds default inventory categories and product categories based on business type and shop type.
 * Used during tenant onboarding so both Materials (MaterialCategory) and Products (ProductCategory) have defaults.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Uses bulkCreate instead of findOrCreate loops
 * - Checks existing categories in single query before seeding
 * - Uses in-memory cache to skip recently seeded tenants
 * - Checks Tenant.categoriesSeeded flag before processing
 */

const { Op } = require('sequelize');
const { MaterialCategory, ProductCategory, EquipmentCategory, Tenant } = require('../models');
const { getDefaultCategoriesForShopType } = require('../config/shopTypes');
const { getDefaultCategories } = require('../config/productCategories');
const { resolveBusinessType } = require('../config/businessTypes');
const { DEFAULT_EQUIPMENT_CATEGORIES } = require('../config/equipmentCategories');

// In-memory cache to skip seeding for recently processed tenants (5 minute TTL)
const SEEDING_CACHE = {
  categories: new Map(),
  equipment: new Map(),
  TTL_MS: 5 * 60 * 1000
};

/**
 * Check if tenant was recently seeded (from memory cache)
 */
function isRecentlySeeded(cacheMap, tenantId) {
  const cached = cacheMap.get(tenantId);
  if (!cached) return false;
  if (Date.now() - cached > SEEDING_CACHE.TTL_MS) {
    cacheMap.delete(tenantId);
    return false;
  }
  return true;
}

/**
 * Mark tenant as seeded in memory cache
 */
function markSeeded(cacheMap, tenantId) {
  cacheMap.set(tenantId, Date.now());
}

/**
 * Default categories for printing press
 */
const PRINTING_PRESS_CATEGORIES = [
  { name: 'Paper & Substrates', description: 'Paper stocks, vinyl, canvas, label materials, and other printable media.' },
  { name: 'Plates & Screens', description: 'Offset plates, flexographic plates, screen mesh, stencil supplies, and related consumables.' },
  { name: 'Inks & Toners', description: 'Process inks, spot colors, toners, UV inks, additives, and specialty formulations.' },
  { name: 'Coatings & Laminates', description: 'Aqueous and UV coatings, varnishes, laminating films, and protective finishes.' },
  { name: 'Binding & Finishing Supplies', description: 'Binding wires, staples, adhesives, cutting blades, shrink wraps, and finishing consumables.' },
  { name: 'Packaging & Shipping', description: 'Boxes, envelopes, tubes, tapes, pallets, and other packaging materials.' },
  { name: 'Maintenance & Cleaning', description: 'Rollers, blankets, filters, lubricants, press wash, wipes, safety gear, and maintenance supplies.' },
  { name: 'Digital Printing Media', description: 'Signage media, fabric substrates, magnet sheets, transfer papers, and specialty digital media.' },
  { name: 'Promotional & Miscellaneous', description: 'Promotional blanks, POS materials, specialty accessories, and miscellaneous items.' }
];

/**
 * Default categories for pharmacy
 */
const PHARMACY_CATEGORIES = [
  { name: 'Prescription Drugs', description: 'Prescription medications and controlled substances' },
  { name: 'Over-the-Counter', description: 'OTC medications and health products' },
  { name: 'Vitamins & Supplements', description: 'Vitamins and dietary supplements' },
  { name: 'Personal Care', description: 'Health and personal care products' },
  { name: 'Medical Supplies', description: 'Medical equipment and supplies' },
  { name: 'Baby Care', description: 'Baby health and care products' },
  { name: 'First Aid', description: 'First aid supplies and bandages' }
];

/**
 * Default material categories for rental businesses (operational supplies, not rentable catalog items).
 */
const RENTAL_MATERIAL_CATEGORIES = [
  { name: 'Maintenance & Repairs', description: 'Parts and supplies for maintaining rental items' },
  { name: 'Cleaning Supplies', description: 'Cleaning products for returned items' },
  { name: 'Fuel & Consumables', description: 'Fuel, oil, and consumable supplies' },
  { name: 'Safety & PPE', description: 'Safety gear and protective equipment' },
  { name: 'Miscellaneous Supplies', description: 'Other operational supplies' }
];

/** Old supermarket material category names (product-style). Deactivate these when backfilling so material categories become operational supplies. */
const DEPRECATED_SUPERMARKET_MATERIAL_NAMES = [
  'Bakery Items', 'Beverages', 'Canned Goods', 'Dairy Products', 'Fresh Produce',
  'Frozen Foods', 'Household Items', 'Meat & Seafood', 'Personal Care', 'Snacks & Confectionery'
];

/**
 * Seed default inventory categories for a tenant using optimized bulk operations.
 * @param {string} tenantId - The tenant ID
 * @param {string} businessType - The business type ('shop', 'studio', 'pharmacy', or legacy 'printing_press', 'mechanic', 'barber', 'salon')
 * @param {string} shopType - The shop type (only if businessType is 'shop')
 * @param {string} studioType - The studio type (optional, for studio business type)
 * @param {string|null} rentalSubType - Rental sub-type (e.g. equipment_rental) when businessType is 'rental'
 * @param {boolean} force - Skip cache and flag checks (use during onboarding)
 * @returns {Promise<Array>} Array of created category IDs
 */
async function seedDefaultCategories(tenantId, businessType, shopType = null, studioType = null, rentalSubType = null, force = false) {
  if (!tenantId) return [];

  // Check memory cache first (skip if force)
  if (!force && isRecentlySeeded(SEEDING_CACHE.categories, tenantId)) {
    console.log('[seedDefaultCategories] Skipping - tenant %s was recently seeded (cached)', tenantId);
    return [];
  }

  // Check database flag (skip if force)
  if (!force) {
    try {
      const tenant = await Tenant.findByPk(tenantId, { attributes: ['categoriesSeeded'] });
      if (tenant?.categoriesSeeded) {
        markSeeded(SEEDING_CACHE.categories, tenantId);
        console.log('[seedDefaultCategories] Skipping - tenant %s already has categoriesSeeded=true', tenantId);
        return [];
      }
    } catch (err) {
      console.warn('[seedDefaultCategories] Could not check tenant flag:', err.message);
    }
  }

  let categories = [];

  // Determine categories based on business type
  if (businessType === 'printing_press') {
    categories = PRINTING_PRESS_CATEGORIES;
  } else if (businessType === 'shop' && shopType) {
    categories = getDefaultCategoriesForShopType(shopType);
  } else if (businessType === 'pharmacy') {
    categories = PHARMACY_CATEGORIES;
  } else if (businessType === 'rental' || resolveBusinessType(businessType) === 'rental') {
    categories = RENTAL_MATERIAL_CATEGORIES;
  } else {
    categories = [
      { name: 'General Merchandise', description: 'General store items' },
      { name: 'Miscellaneous', description: 'Other products and items' }
    ];
  }

  console.log('[seedDefaultCategories] tenantId=%s businessType=%s shopType=%s rentalSubType=%s categoryCount=%d', tenantId, businessType, shopType || 'n/a', rentalSubType || 'n/a', categories.length);
  if (businessType === 'shop' && !shopType) {
    console.warn('[seedDefaultCategories] Shop business type but no shopType – using fallback categories only. Set shopType (e.g. supermarket, hardware) for type-specific categories.');
  }

  const FALLBACK_CATEGORY_NAMES = ['General Merchandise', 'Miscellaneous'];

  // When seeding a specific shop type, deactivate the fallback categories so they don't appear in dropdowns
  if (businessType === 'shop' && shopType) {
    try {
      await Promise.all([
        ProductCategory.update(
          { isActive: false },
          { where: { tenantId, name: { [Op.in]: FALLBACK_CATEGORY_NAMES } } }
        ),
        MaterialCategory.update(
          { isActive: false },
          { where: { tenantId, name: { [Op.in]: FALLBACK_CATEGORY_NAMES } } }
        )
      ]);
      console.log('[seedDefaultCategories] Deactivated fallback categories for tenant %s', tenantId);
    } catch (err) {
      console.error('[seedDefaultCategories] Error deactivating fallback categories:', err.message);
    }
  }

  const resolvedBusinessType = resolveBusinessType(businessType);
  const resolvedShopType = resolvedBusinessType === 'shop' ? shopType : null;
  const resolvedStudioType = resolvedBusinessType === 'studio' ? (studioType || (['printing_press', 'mechanic', 'barber', 'salon'].includes(businessType) ? businessType : null)) : null;
  const resolvedRentalSubType = resolvedBusinessType === 'rental' ? (rentalSubType || shopType || null) : null;

  // For supermarket: deactivate old product-style material categories so new operational-supply categories are used
  if (businessType === 'shop' && shopType === 'supermarket') {
    try {
      const [updated] = await MaterialCategory.update(
        { isActive: false },
        { where: { tenantId, shopType: 'supermarket', name: { [Op.in]: DEPRECATED_SUPERMARKET_MATERIAL_NAMES } } }
      );
      if (updated > 0) {
        console.log('[seedDefaultCategories] Deactivated %d deprecated supermarket material categories for tenant %s', updated, tenantId);
      }
    } catch (err) {
      console.error('[seedDefaultCategories] Error deactivating deprecated supermarket categories:', err.message);
    }
  }

  // OPTIMIZATION: Get existing category names in single query
  const existingMaterialNames = new Set(
    (await MaterialCategory.findAll({
      where: { tenantId },
      attributes: ['name'],
      raw: true
    })).map(c => c.name)
  );

  // Filter to only new categories
  const newMaterialCategories = categories
    .filter(c => !existingMaterialNames.has(c.name))
    .map(category => ({
      tenantId,
      name: category.name,
      description: category.description || null,
      businessType: resolvedBusinessType === 'rental' ? null : resolvedBusinessType,
      studioType: resolvedStudioType,
      shopType: resolvedBusinessType === 'rental' ? resolvedRentalSubType : resolvedShopType,
      isActive: true,
      metadata: resolvedBusinessType === 'rental' && resolvedRentalSubType
        ? { rentalSubType: resolvedRentalSubType }
        : {},
    }));

  // OPTIMIZATION: Bulk create material categories
  let createdMaterials = [];
  if (newMaterialCategories.length > 0) {
    try {
      createdMaterials = await MaterialCategory.bulkCreate(newMaterialCategories, {
        ignoreDuplicates: true,
        returning: true
      });
      console.log(`✅ Bulk created ${createdMaterials.length} material categories for tenant ${tenantId}`);
    } catch (err) {
      console.error('[seedDefaultCategories] Bulk create materials error:', err.message);
    }
  } else {
    console.log(`ℹ️  All material categories already exist for tenant ${tenantId}`);
  }

  // Create product categories for tenant (Products page dropdown)
  let finalStudioType = resolvedStudioType || studioType;
  if (!finalStudioType && ['printing_press', 'mechanic', 'barber', 'salon'].includes(businessType)) {
    finalStudioType = businessType;
  }
  
  let productCategories = [];
  if (resolvedBusinessType === 'shop' && shopType) {
    productCategories = getDefaultCategories(resolvedBusinessType, null, shopType);
  } else if (resolvedBusinessType === 'rental') {
    productCategories = getDefaultCategories(resolvedBusinessType, null, null, resolvedRentalSubType);
  } else {
    productCategories = getDefaultCategories(resolvedBusinessType, finalStudioType);
  }

  const categoriesToUse = productCategories.length > 0 ? productCategories : categories;

  // OPTIMIZATION: Get existing product category names in single query
  const existingProductNames = new Set(
    (await ProductCategory.findAll({
      where: { tenantId },
      attributes: ['name'],
      raw: true
    })).map(c => c.name)
  );

  // Filter to only new categories
  const newProductCategories = categoriesToUse
    .filter(c => !existingProductNames.has(c.name))
    .map(category => ({
      tenantId,
      name: category.name,
      description: category.description || null,
      businessType: resolvedBusinessType === 'rental' ? null : resolvedBusinessType,
      studioType: resolvedBusinessType === 'studio' ? finalStudioType : null,
      shopType: resolvedBusinessType === 'rental' ? resolvedRentalSubType : resolvedShopType,
      isActive: true,
      metadata: resolvedBusinessType === 'rental' && resolvedRentalSubType
        ? { rentalSubType: resolvedRentalSubType }
        : {},
    }));

  // OPTIMIZATION: Bulk create product categories
  if (newProductCategories.length > 0) {
    try {
      const createdProducts = await ProductCategory.bulkCreate(newProductCategories, {
        ignoreDuplicates: true,
        returning: true
      });
      const scope = resolvedBusinessType === 'studio'
        ? finalStudioType
        : (resolvedBusinessType === 'shop'
          ? shopType
          : (resolvedBusinessType === 'rental' ? resolvedRentalSubType || 'default' : ''));
      console.log(`✅ Bulk created ${createdProducts.length} product categories for tenant ${tenantId} (${resolvedBusinessType}${scope ? `/${scope}` : ''})`);
    } catch (err) {
      console.error('[seedDefaultCategories] Bulk create products error:', err.message);
    }
  } else {
    console.log(`ℹ️  All product categories already exist for tenant ${tenantId}`);
  }

  // Mark tenant as seeded in database and cache
  try {
    await Tenant.update({ categoriesSeeded: true }, { where: { id: tenantId } });
    markSeeded(SEEDING_CACHE.categories, tenantId);
    console.log('[seedDefaultCategories] Marked tenant %s as categoriesSeeded', tenantId);
  } catch (err) {
    console.warn('[seedDefaultCategories] Could not update tenant flag:', err.message);
  }

  return createdMaterials;
}

/**
 * Seed default equipment categories for a tenant using optimized bulk operations.
 * @param {string} tenantId - The tenant ID
 * @param {boolean} force - Skip cache and flag checks (use during onboarding)
 * @returns {Promise<number>} Number of categories created (existing ones are skipped)
 */
async function seedDefaultEquipmentCategories(tenantId, force = false) {
  if (!tenantId) return 0;

  // Check memory cache first (skip if force)
  if (!force && isRecentlySeeded(SEEDING_CACHE.equipment, tenantId)) {
    console.log('[seedDefaultEquipmentCategories] Skipping - tenant %s was recently seeded (cached)', tenantId);
    return 0;
  }

  // Check database flag (skip if force)
  if (!force) {
    try {
      const tenant = await Tenant.findByPk(tenantId, { attributes: ['equipmentCategoriesSeeded'] });
      if (tenant?.equipmentCategoriesSeeded) {
        markSeeded(SEEDING_CACHE.equipment, tenantId);
        console.log('[seedDefaultEquipmentCategories] Skipping - tenant %s already has equipmentCategoriesSeeded=true', tenantId);
        return 0;
      }
    } catch (err) {
      console.warn('[seedDefaultEquipmentCategories] Could not check tenant flag:', err.message);
    }
  }

  // OPTIMIZATION: Get existing category names in single query
  const existingNames = new Set(
    (await EquipmentCategory.findAll({
      where: { tenantId },
      attributes: ['name'],
      raw: true
    })).map(c => c.name)
  );

  // Filter to only new categories
  const newCategories = DEFAULT_EQUIPMENT_CATEGORIES
    .filter(c => !existingNames.has(c.name))
    .map(category => ({
      tenantId,
      name: category.name,
      description: category.description || null,
      isActive: true,
      metadata: {}
    }));

  // OPTIMIZATION: Bulk create
  let created = 0;
  if (newCategories.length > 0) {
    try {
      const result = await EquipmentCategory.bulkCreate(newCategories, {
        ignoreDuplicates: true,
        returning: true
      });
      created = result.length;
      console.log(`✅ Bulk created ${created} equipment categories for tenant ${tenantId}`);
    } catch (err) {
      console.error('[seedDefaultEquipmentCategories] Bulk create error:', err.message);
    }
  } else {
    console.log(`ℹ️  All equipment categories already exist for tenant ${tenantId}`);
  }

  // Mark tenant as seeded in database and cache
  try {
    await Tenant.update({ equipmentCategoriesSeeded: true }, { where: { id: tenantId } });
    markSeeded(SEEDING_CACHE.equipment, tenantId);
    console.log('[seedDefaultEquipmentCategories] Marked tenant %s as equipmentCategoriesSeeded', tenantId);
  } catch (err) {
    console.warn('[seedDefaultEquipmentCategories] Could not update tenant flag:', err.message);
  }

  return created;
}

/**
 * Clear the in-memory seeding cache (useful for testing)
 */
function clearSeedingCache() {
  SEEDING_CACHE.categories.clear();
  SEEDING_CACHE.equipment.clear();
}

module.exports = {
  seedDefaultCategories,
  seedDefaultEquipmentCategories,
  clearSeedingCache,
  PRINTING_PRESS_CATEGORIES,
  PHARMACY_CATEGORIES
};
