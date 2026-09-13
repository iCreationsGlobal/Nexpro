/**
 * Seed demo rental catalog, customers, and one active rental for a pilot tenant.
 *
 * Usage:
 *   cd Backend && node scripts/seed-rental-pilot-tenant.js owner@example.com
 *
 * Optional env:
 *   SEED_RENTAL_PRODUCTS=5 SEED_RENTAL_CUSTOMERS=10
 *
 * Requires DATABASE_URL in .env. Tenant should have businessType=rental (warns if not).
 */
require('dotenv').config();

const { sequelize } = require('../config/database');
const {
  User,
  UserTenant,
  Tenant,
  Shop,
  ProductCategory,
  Product,
  Customer,
  Rental,
  RentalItem,
  OnlineStoreSettings,
  OnlineProductListing,
} = require('../models');
const { resolveBusinessType } = require('../config/businessTypes');
const { seedDefaultCategories } = require('../utils/categorySeeder');
const { ensureDefaultShop } = require('../utils/shopUtils');

const DEFAULT_OWNER_EMAIL = process.env.SEED_RENTAL_OWNER || 'owner@example.com';

const DEMO_PRODUCTS = [
  { name: 'Canon DSLR Camera Kit', sku: 'RENT-CAM-01', rentalRatePerDay: 120, quantityOnHand: 4 },
  { name: 'PA Speaker System', sku: 'RENT-PA-01', rentalRatePerDay: 180, quantityOnHand: 2 },
  { name: 'Event Tent 20x20', sku: 'RENT-TENT-01', rentalRatePerDay: 250, quantityOnHand: 3 },
  { name: 'Folding Chairs (set of 50)', sku: 'RENT-CHAIR-50', rentalRatePerDay: 75, quantityOnHand: 6 },
  { name: 'Projector + Screen Bundle', sku: 'RENT-PROJ-01', rentalRatePerDay: 95, quantityOnHand: 2 },
];

const DEMO_CUSTOMERS = [
  { name: 'Ama Boateng', phone: '0241112233', email: 'ama.boateng@example.com' },
  { name: 'Kwesi Mensah', phone: '0552223344', email: 'kwesi.m@example.com' },
  { name: 'Efua Owusu', phone: '0273334455', email: 'efua.o@example.com' },
];

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function resolveTenant(ownerEmail) {
  const user = await User.findOne({ where: { email: ownerEmail.trim().toLowerCase() } });
  if (!user) throw new Error(`No user with email: ${ownerEmail}`);

  const membership = await UserTenant.findOne({
    where: { userId: user.id, status: 'active' },
    include: [{ model: Tenant, as: 'tenant' }],
    order: [['isDefault', 'DESC'], ['createdAt', 'ASC']],
  });
  if (!membership?.tenant) throw new Error(`No active tenant for user: ${ownerEmail}`);

  return membership.tenant;
}

async function seedRentalPilotTenant() {
  const ownerEmail = process.argv[2] || DEFAULT_OWNER_EMAIL;
  const productCount = Math.min(
    DEMO_PRODUCTS.length,
    Math.max(1, parseInt(process.env.SEED_RENTAL_PRODUCTS || String(DEMO_PRODUCTS.length), 10))
  );
  const customerCount = Math.min(
    DEMO_CUSTOMERS.length,
    Math.max(1, parseInt(process.env.SEED_RENTAL_CUSTOMERS || String(DEMO_CUSTOMERS.length), 10))
  );

  console.log('[seed-rental-pilot] owner=%s products=%d customers=%d', ownerEmail, productCount, customerCount);

  const tenant = await resolveTenant(ownerEmail);
  const tenantId = tenant.id;
  const resolvedType = resolveBusinessType(tenant.businessType);
  if (resolvedType !== 'rental') {
    console.warn(
      '[seed-rental-pilot] WARN tenant %s businessType=%s (expected rental). Continuing anyway.',
      tenant.name,
      tenant.businessType || 'unset'
    );
  }

  const shop = await ensureDefaultShop(tenantId, { name: tenant.name || 'Main location' });
  const shopId = shop.id;

  await seedDefaultCategories(
    tenantId,
    'rental',
    null,
    null,
    tenant.metadata?.businessSubType || tenant.metadata?.shopType || 'equipment_rental',
    false
  );

  const category = await ProductCategory.findOne({
    where: { tenantId },
    order: [['createdAt', 'ASC']],
  });

  const createdProducts = [];
  for (let i = 0; i < productCount; i += 1) {
    const blueprint = DEMO_PRODUCTS[i];
    const [product, created] = await Product.findOrCreate({
      where: { tenantId, sku: blueprint.sku },
      defaults: {
        tenantId,
        shopId,
        categoryId: category?.id || null,
        name: blueprint.name,
        sku: blueprint.sku,
        description: `${blueprint.name} — demo rental catalog item`,
        costPrice: blueprint.rentalRatePerDay * 10,
        sellingPrice: blueprint.rentalRatePerDay * 14,
        rentalRatePerDay: blueprint.rentalRatePerDay,
        isRentable: true,
        isSalable: false,
        quantityOnHand: blueprint.quantityOnHand,
        isActive: true,
        trackStock: true,
      },
    });
    createdProducts.push({ product, created });
    console.log('[seed-rental-pilot] product %s (%s)', product.name, created ? 'created' : 'exists');
  }

  const createdCustomers = [];
  for (let i = 0; i < customerCount; i += 1) {
    const blueprint = DEMO_CUSTOMERS[i];
    const [customer, created] = await Customer.findOrCreate({
      where: { tenantId, phone: blueprint.phone },
      defaults: {
        tenantId,
        shopId,
        name: blueprint.name,
        phone: blueprint.phone,
        email: blueprint.email,
        sabitoSourceType: 'direct',
        metadata: {
          rental: {
            riskProfile: { riskRating: 'low', creditLimit: 5000 },
          },
        },
      },
    });
    createdCustomers.push({ customer, created });
    console.log('[seed-rental-pilot] customer %s (%s)', customer.name, created ? 'created' : 'exists');
  }

  const startDate = addDays(new Date().toISOString().slice(0, 10), 1);
  const endDate = addDays(startDate, 4);
  const durationDays = 4;
  const primaryProduct = createdProducts[0].product;
  const primaryCustomer = createdCustomers[0].customer;
  const rentalAmount = Number((primaryProduct.rentalRatePerDay * durationDays).toFixed(2));

  let rental = await Rental.findOne({
    where: {
      tenantId,
      customerId: primaryCustomer.id,
      status: 'active',
    },
    order: [['createdAt', 'DESC']],
  });

  if (!rental) {
    rental = await Rental.create({
      tenantId,
      customerId: primaryCustomer.id,
      branchId: shopId,
      status: 'active',
      startDate,
      endDate,
      rentalDurationDays: durationDays,
      paymentMethod: 'cash',
      amount: rentalAmount,
      discountAmount: 0,
      amountPaid: 0,
      totalDue: rentalAmount,
      notes: 'Demo active rental — seeded by seed-rental-pilot-tenant.js',
      metadata: { lateChargePerDay: 0 },
    });

    await RentalItem.create({
      rentalId: rental.id,
      productId: primaryProduct.id,
      branchId: shopId,
      quantity: 1,
      rentalRatePerDay: primaryProduct.rentalRatePerDay,
      subtotal: rentalAmount,
    });
    console.log('[seed-rental-pilot] active rental created id=%s', rental.id);
  } else {
    console.log('[seed-rental-pilot] active rental already exists id=%s', rental.id);
  }

  const storeSlug = slugify(tenant.slug || tenant.name || 'rental-pilot');
  const [store, storeCreated] = await OnlineStoreSettings.findOrCreate({
    where: { tenantId, shopId },
    defaults: {
      tenantId,
      shopId,
      enabled: true,
      slug: storeSlug,
      displayName: tenant.name || 'Rental Store',
      currency: 'GHS',
    },
  });
  console.log('[seed-rental-pilot] online store %s (%s)', store.slug, storeCreated ? 'created' : 'exists');

  for (const { product } of createdProducts) {
    const listingSlug = slugify(product.name);
    const [listing, listingCreated] = await OnlineProductListing.findOrCreate({
      where: { tenantId, productId: product.id, shopId },
      defaults: {
        tenantId,
        shopId,
        productId: product.id,
        status: 'published',
        title: product.name,
        slug: listingSlug,
        shortDescription: `Hire ${product.name} from ${tenant.name || 'our store'}`,
        publicPrice: product.rentalRatePerDay,
        metadata: { commerceMode: 'rent' },
      },
    });
    if (listingCreated) {
      console.log('[seed-rental-pilot] published listing %s', listing.title);
    }
  }

  console.log('\n[seed-rental-pilot] Done.');
  console.log('  tenantId: %s', tenantId);
  console.log('  shopId:   %s', shopId);
  console.log('  store:    /store/%s (enabled=%s)', store.slug, store.enabled);
  console.log('  rental:   %s (%s → %s)', rental.id, startDate, endDate);
  console.log('\nVerify: npm run test:rental');
}

seedRentalPilotTenant()
  .catch((error) => {
    console.error('[seed-rental-pilot] Failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
