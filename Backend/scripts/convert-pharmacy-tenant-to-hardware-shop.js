#!/usr/bin/env node
/**
 * Convert pharmacy tenant(s) for a user to shop (hardware).
 *
 * Updates only classification fields:
 *   - Tenant.businessType: pharmacy → shop
 *   - Tenant.metadata.shopType: hardware (SHOP_TYPES key for categories / settings)
 *   - Tenant.metadata.businessSubType: hardware_store (onboarding everyday label)
 *   - Shop.shopType: set to hardware when missing or still a pharmacy subtype
 *   - Ensures a default Shop row exists (shop tenants need shops for POS / scoping)
 *
 * Does NOT delete Pharmacy / Drug / Prescription rows, products, or other data.
 * Does NOT wipe unrelated metadata keys.
 *
 * Dry-run by default. Pass --execute to apply.
 *
 * Usage (from Backend/):
 *   node scripts/convert-pharmacy-tenant-to-hardware-shop.js
 *   node scripts/convert-pharmacy-tenant-to-hardware-shop.js --dry-run
 *   node scripts/convert-pharmacy-tenant-to-hardware-shop.js --execute
 *   node scripts/convert-pharmacy-tenant-to-hardware-shop.js --email eric@precisemedicals.com --execute
 *   node scripts/convert-pharmacy-tenant-to-hardware-shop.js --tenant-id <uuid> --execute
 *   node scripts/convert-pharmacy-tenant-to-hardware-shop.js --execute --seed-categories
 *
 * npm:
 *   npm run convert:pharmacy-to-hardware-shop
 *   npm run convert:pharmacy-to-hardware-shop -- --execute
 *
 * Contabo / VPS:
 *   ssh root@62.169.22.3 'cd ~/nexpro/Backend && node scripts/convert-pharmacy-tenant-to-hardware-shop.js'
 *   ssh root@62.169.22.3 'cd ~/nexpro/Backend && node scripts/convert-pharmacy-tenant-to-hardware-shop.js --execute'
 *
 * Local:
 *   cd Backend && node scripts/convert-pharmacy-tenant-to-hardware-shop.js
 *   cd Backend && node scripts/convert-pharmacy-tenant-to-hardware-shop.js --execute
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Op, col, fn, where } = require('sequelize');
const { sequelize, testConnection } = require('../config/database');
const { User, UserTenant, Tenant, Shop, Pharmacy } = require('../models');
const { resolveBusinessType } = require('../config/businessTypes');
const { ensureDefaultShop } = require('../utils/shopUtils');

const DEFAULT_EMAIL = 'eric@precisemedicals.com';
/** Canonical SHOP_TYPES key used by category seeding and organization settings. */
const TARGET_SHOP_TYPE = 'hardware';
/** Onboarding BUSINESS_OPTIONS id for hardware & building materials. */
const TARGET_BUSINESS_SUB_TYPE = 'hardware_store';
const TARGET_BUSINESS_TYPE = 'shop';
const SOURCE_BUSINESS_TYPE = 'pharmacy';

const PHARMACY_SUB_TYPES = new Set(['community_pharmacy', 'clinic_pharmacy', 'pharmacy']);

const getArgValue = (name) => {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return null;
};

const hasFlag = (name) => process.argv.includes(name);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const cloneMetadata = (metadata) => (isPlainObject(metadata) ? { ...metadata } : {});

const summarizeTenant = (tenant) => {
  const meta = isPlainObject(tenant.metadata) ? tenant.metadata : {};
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    businessType: tenant.businessType,
    metadata: {
      shopType: meta.shopType ?? null,
      businessSubType: meta.businessSubType ?? null,
      studioType: meta.studioType ?? null,
    },
  };
};

const needsConversion = (tenant) => {
  const resolved = resolveBusinessType(tenant.businessType);
  if (resolved === SOURCE_BUSINESS_TYPE) return true;

  // Already shop: only touch if hardware classification is incomplete (idempotent re-run).
  if (resolved === TARGET_BUSINESS_TYPE) {
    const meta = isPlainObject(tenant.metadata) ? tenant.metadata : {};
    const shopType = meta.shopType || null;
    const subType = meta.businessSubType || null;
    const shopOk = shopType === TARGET_SHOP_TYPE;
    const subOk = subType === TARGET_BUSINESS_SUB_TYPE;
    if (!shopOk || !subOk) return true;
    if (PHARMACY_SUB_TYPES.has(shopType) || PHARMACY_SUB_TYPES.has(subType)) return true;
  }

  return false;
};

const buildNextMetadata = (metadata) => {
  const next = cloneMetadata(metadata);

  next.shopType = TARGET_SHOP_TYPE;
  next.businessSubType = TARGET_BUSINESS_SUB_TYPE;

  // Shop classification should not keep a studioType.
  if (Object.prototype.hasOwnProperty.call(next, 'studioType')) {
    delete next.studioType;
  }

  return next;
};

/**
 * Whether a shop row's shopType should be rewritten to hardware.
 * When converting from pharmacy, always set hardware. On idempotent re-runs for
 * already-shop tenants, only fill missing / pharmacy leftovers (do not overwrite
 * an intentional supermarket/etc. subtype).
 */
const shopNeedsTypeUpdate = (shop, { fromPharmacy }) => {
  const current = shop.shopType || null;
  if (current === TARGET_SHOP_TYPE || current === TARGET_BUSINESS_SUB_TYPE) return false;
  if (fromPharmacy) return true;
  if (!current) return true;
  if (PHARMACY_SUB_TYPES.has(current)) return true;
  return false;
};

const printUsage = () => {
  console.error('Usage: node scripts/convert-pharmacy-tenant-to-hardware-shop.js [--email <address>] [--tenant-id <uuid>] [--dry-run | --execute] [--seed-categories]');
  console.error(`Default email: ${DEFAULT_EMAIL}`);
  console.error('Dry-run is the default; pass --execute to write changes.');
};

const main = async () => {
  const email = normalizeEmail(getArgValue('--email') || DEFAULT_EMAIL);
  const tenantIdFilter = String(getArgValue('--tenant-id') || '').trim() || null;
  const isExecute = hasFlag('--execute');
  const isDryRun = !isExecute || hasFlag('--dry-run');
  const seedCategories = hasFlag('--seed-categories');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Error: invalid email address "${email}".`);
    printUsage();
    process.exit(1);
  }

  if (hasFlag('--dry-run') && hasFlag('--execute')) {
    console.error('Error: pass either --dry-run or --execute, not both.');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL is not set. Add it to Backend/.env or export it before running.');
    process.exit(1);
  }

  console.log(isDryRun ? 'Mode: DRY RUN (no writes)' : 'Mode: EXECUTE (writes enabled)');
  console.log(`Email: ${email}`);
  if (tenantIdFilter) console.log(`Tenant filter: ${tenantIdFilter}`);
  if (seedCategories) console.log('Category seeding: ON (after convert, with --execute)');
  console.log('');

  await testConnection();

  const user = await User.unscoped().findOne({
    where: where(fn('lower', col('email')), email),
    attributes: ['id', 'name', 'email', 'role', 'isActive'],
  });

  if (!user) {
    console.log(`No user found with email ${email}. Nothing to do.`);
    await sequelize.close();
    process.exit(0);
  }

  console.log('User:');
  console.log(`  id=${user.id} name=${user.name || '(none)'} email=${user.email} role=${user.role}`);

  const memberships = await UserTenant.findAll({
    where: {
      userId: user.id,
      ...(tenantIdFilter ? { tenantId: tenantIdFilter } : {}),
    },
    include: [
      {
        model: Tenant,
        as: 'tenant',
        required: true,
      },
    ],
    order: [['isDefault', 'DESC'], ['createdAt', 'ASC']],
  });

  if (!memberships.length) {
    console.log('No tenant memberships found for this user.');
    await sequelize.close();
    process.exit(0);
  }

  console.log(`\nMemberships: ${memberships.length}`);

  const summary = {
    scanned: 0,
    convert: 0,
    skip: 0,
    alreadyOk: 0,
    shopsUpdated: 0,
    shopsEnsured: 0,
    pharmacyRowsLeft: 0,
  };

  for (const membership of memberships) {
    const tenant = membership.tenant;
    summary.scanned += 1;

    const resolved = resolveBusinessType(tenant.businessType);
    const pharmacyCount = await Pharmacy.count({ where: { tenantId: tenant.id } });
    const shops = await Shop.findAll({
      where: { tenantId: tenant.id },
      attributes: ['id', 'name', 'shopType', 'isDefault', 'isActive'],
      order: [['isDefault', 'DESC'], ['createdAt', 'ASC']],
    });

    console.log('\n────────────────────────────────────────');
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);
    console.log(`  membership role=${membership.role} status=${membership.status} isDefault=${membership.isDefault}`);
    console.log(`  BEFORE: ${JSON.stringify(summarizeTenant(tenant))}`);
    console.log(`  shops=${shops.length} pharmacyRows=${pharmacyCount}`);
    shops.forEach((shop) => {
      console.log(
        `    shop id=${shop.id} name=${shop.name} shopType=${shop.shopType || '(null)'} default=${shop.isDefault}`
      );
    });

    if (pharmacyCount > 0) {
      summary.pharmacyRowsLeft += pharmacyCount;
      console.log(
        `  note: ${pharmacyCount} Pharmacy row(s) will remain (not deleted). Pharmacy UI features will be gated off after businessType change.`
      );
    }

    if (resolved !== SOURCE_BUSINESS_TYPE && resolved !== TARGET_BUSINESS_TYPE) {
      console.log(`  SKIP: businessType=${tenant.businessType} (resolved=${resolved}) is not pharmacy/shop`);
      summary.skip += 1;
      continue;
    }

    const fromPharmacy = resolved === SOURCE_BUSINESS_TYPE;
    const plannedShopUpdates = shops
      .filter((shop) => shopNeedsTypeUpdate(shop, { fromPharmacy }))
      .map((shop) => ({
        id: shop.id,
        name: shop.name,
        from: shop.shopType || null,
        to: TARGET_SHOP_TYPE,
      }));

    if (!needsConversion(tenant) && !plannedShopUpdates.length) {
      console.log('  SKIP: already shop + hardware classification');
      summary.alreadyOk += 1;
      continue;
    }

    const nextMetadata = buildNextMetadata(tenant.metadata);

    const afterPreview = {
      ...summarizeTenant(tenant),
      businessType: TARGET_BUSINESS_TYPE,
      metadata: {
        shopType: nextMetadata.shopType,
        businessSubType: nextMetadata.businessSubType,
        studioType: nextMetadata.studioType ?? null,
      },
    };

    console.log(`  AFTER (planned): ${JSON.stringify(afterPreview)}`);
    if (plannedShopUpdates.length) {
      console.log(`  Shop.shopType updates: ${plannedShopUpdates.length}`);
      plannedShopUpdates.forEach((u) => {
        console.log(`    ${u.name} (${u.id}): ${u.from || '(null)'} → ${u.to}`);
      });
    } else {
      console.log('  Shop.shopType updates: none');
    }
    console.log(`  Ensure default shop: ${shops.length === 0 ? 'create if missing' : 'reuse / promote if needed'}`);

    summary.convert += 1;

    if (isDryRun) {
      console.log('  dry-run: no changes written');
      continue;
    }

    await sequelize.transaction(async (transaction) => {
      await tenant.update(
        {
          businessType: TARGET_BUSINESS_TYPE,
          metadata: nextMetadata,
        },
        { transaction }
      );

      for (const update of plannedShopUpdates) {
        await Shop.update(
          { shopType: TARGET_SHOP_TYPE },
          { where: { id: update.id, tenantId: tenant.id }, transaction }
        );
        summary.shopsUpdated += 1;
      }

      const defaultShop = await ensureDefaultShop(
        tenant.id,
        {
          name: tenant.name,
          shopType: TARGET_SHOP_TYPE,
          source: 'convert-pharmacy-to-hardware-shop',
        },
        transaction
      );

      if (defaultShop && (defaultShop.shopType || null) !== TARGET_SHOP_TYPE) {
        await defaultShop.update({ shopType: TARGET_SHOP_TYPE }, { transaction });
        summary.shopsUpdated += 1;
      }

      if (defaultShop) {
        summary.shopsEnsured += 1;
        console.log(`  defaultShop id=${defaultShop.id} shopType=${TARGET_SHOP_TYPE}`);
      }
    });

    await tenant.reload();
    console.log(`  SAVED: ${JSON.stringify(summarizeTenant(tenant))}`);

    if (seedCategories) {
      try {
        const { seedDefaultCategories } = require('../utils/categorySeeder');
        await seedDefaultCategories(tenant.id, TARGET_BUSINESS_TYPE, TARGET_SHOP_TYPE, null, null, true);
        console.log('  seeded default categories for shop/hardware (additive; existing names kept)');
      } catch (seedErr) {
        console.warn(`  category seed failed (non-fatal): ${seedErr.message}`);
      }
    }
  }

  console.log('\n════════════════════════════════════════');
  console.log('Summary');
  console.log(`  memberships scanned: ${summary.scanned}`);
  console.log(`  tenants ${isDryRun ? 'would convert/update' : 'converted/updated'}: ${summary.convert}`);
  console.log(`  already ok: ${summary.alreadyOk}`);
  console.log(`  skipped (other types): ${summary.skip}`);
  if (!isDryRun) {
    console.log(`  shop rows type-updated: ${summary.shopsUpdated}`);
    console.log(`  default shops ensured: ${summary.shopsEnsured}`);
  }
  console.log(`  pharmacy rows left in place: ${summary.pharmacyRowsLeft}`);
  console.log('');
  console.log('Risks / follow-ups:');
  console.log('  - Pharmacy-only nav (prescriptions, drugs, pharmacy management) will hide; existing Pharmacy/Drug/Prescription data remains.');
  console.log('  - Products/categories seeded for pharmacy stay; use --seed-categories to add hardware defaults without deleting old ones.');
  console.log('  - Sidebar preferences / automations tied to pharmacy may need manual review.');
  if (isDryRun) {
    console.log('\nRe-run with --execute to apply.');
  }

  await sequelize.close();
  process.exit(0);
};

main().catch(async (err) => {
  console.error('\nScript failed:', err);
  try {
    await sequelize.close();
  } catch {
    // ignore
  }
  process.exit(1);
});
