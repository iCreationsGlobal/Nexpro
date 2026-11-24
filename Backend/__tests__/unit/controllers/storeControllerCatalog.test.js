jest.mock('../../../config/database', () => ({
  sequelize: { fn: jest.fn(), col: jest.fn(), literal: jest.fn() },
}));

jest.mock('../../../models', () => ({
  OnlineStoreSettings: { findOne: jest.fn() },
  OnlineProductListing: { findAll: jest.fn() },
  OnlineServiceListing: { findAll: jest.fn() },
  ProductVariant: { findAll: jest.fn() },
  SaleItem: { findAll: jest.fn() },
  Product: {},
  ProductCategory: {},
  Shop: {},
  Tenant: {},
  Sale: {},
}));

jest.mock('../../../middleware/upload', () => ({ baseUploadDir: '/tmp/uploads', ensureDirExists: jest.fn() }));
jest.mock('../../../middleware/cache', () => ({}));
jest.mock('../../../services/tradeAssuranceService', () => ({}));
jest.mock('../../../services/pushNotificationService', () => ({}));
jest.mock('../../../services/orderCustomerNotificationService', () => ({}));
jest.mock('../../../controllers/studioStoreController', () => ({ isStudioTenant: (type) => type === 'studio' }));
jest.mock('../../../controllers/onlineStoreHeroController', () => ({
  resolveHeroSlidesForStore: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../services/storefrontReviewService', () => ({
  attachProductReviewSummaries: jest.fn(async (items) => items),
  attachServiceReviewSummaries: jest.fn(async (items) => items),
  getPublicReviewSummary: jest.fn().mockResolvedValue({ reviews: [] }),
}));
jest.mock('../../../utils/performanceLogger', () => ({ startHotPathTimer: () => jest.fn() }));

const { Op } = require('sequelize');
const { OnlineStoreSettings, OnlineProductListing, OnlineServiceListing, ProductVariant, SaleItem } = require('../../../models');
const { getMarketplaceStoreHome, getPublicStoreProducts } = require('../../../controllers/storeController');

const makeListing = (index, overrides = {}) => ({
  id: `listing-${index}`,
  tenantId: 'tenant-1',
  shopId: 'shop-1',
  productId: `product-${index}`,
  status: 'published',
  title: `Product ${index}`,
  slug: `product-${index}`,
  publicPrice: 10,
  images: ['/product.jpg'],
  inventoryPolicy: 'track',
  sortOrder: index,
  publishedAt: '2026-01-01T00:00:00Z',
  metadata: {},
  product: {
    id: `product-${index}`,
    name: `Product ${index}`,
    isActive: true,
    trackStock: true,
    quantityOnHand: 10,
    category: index <= 80 ? { id: 'early', name: 'Accessories' } : { id: 'late', name: 'Ink' },
  },
  ...overrides,
});

// Model the database's filtering and LIMIT, so a truncated controller query loses rows.
const mockListings = (rows) => {
  OnlineProductListing.findAll.mockImplementation(async ({ where, include, limit }) => {
    const scopes = where[Op.or] || [where];
    const productWhere = include.find((join) => join.as === 'product').where;
    return rows.filter((row) => row.status === where.status
      && scopes.some((scope) => row.tenantId === scope.tenantId && (!scope.shopId || row.shopId === scope.shopId))
      && row.product?.isActive === productWhere.isActive).slice(0, limit);
  });
};

const run = async (handler = getMarketplaceStoreHome, query = {}) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await handler({ params: { slug: 'test-store' }, query }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
  return res.json.mock.calls[0][0].data;
};

describe('public store complete catalog', () => {
  let store;

  beforeEach(() => {
    jest.clearAllMocks();
    store = {
      id: 'store-1', tenantId: 'tenant-1', shopId: 'shop-1', slug: 'test-store',
      displayName: 'Test Store', enabled: true, currency: 'GHS', metadata: {},
      tenant: { businessType: 'shop', plan: 'starter' },
    };
    OnlineStoreSettings.findOne.mockResolvedValue(store);
    OnlineServiceListing.findAll.mockResolvedValue([]);
    ProductVariant.findAll.mockResolvedValue([]);
    SaleItem.findAll.mockResolvedValue([]);
    mockListings([]);
  });

  it('returns all 200 products, their categories and accurate totals, matching the full catalog endpoint', async () => {
    mockListings(Array.from({ length: 200 }, (_, i) => makeListing(i + 1)));

    const home = await run();
    const fullCatalog = await run(getPublicStoreProducts);

    expect(home.products).toHaveLength(200);
    expect(home.products.map((product) => product.id)).toEqual(fullCatalog.map((product) => product.id));
    expect(home.store.stats).toMatchObject({ productCount: 200, categoryCount: 2 });
    expect(home.categories).toEqual(expect.arrayContaining([
      { id: 'early', name: 'Accessories', count: 80 },
      { id: 'late', name: 'Ink', count: 120 },
    ]));
    expect(home.productSections[0].products).toHaveLength(8);
  });

  it('includes a product assigned to a home section even when it is beyond item 80', async () => {
    store.metadata.productSections = {
      enabled: true,
      items: [{ id: 'specials', slug: 'custom', title: 'Specials', enabled: true, maxItems: 8 }],
    };
    const rows = Array.from({ length: 100 }, (_, i) => makeListing(i + 1));
    rows[99].metadata.sectionIds = ['specials'];
    mockListings(rows);

    const home = await run();

    expect(home.productSections).toEqual([
      expect.objectContaining({ id: 'specials', products: [expect.objectContaining({ id: 'listing-100' })] }),
    ]);
    expect(home.products.every((product) => !('_sectionIds' in product))).toBe(true);
  });

  it('finds available products after 80 sold-out listings and keeps publication and shop restrictions', async () => {
    const rows = Array.from({ length: 85 }, (_, i) => makeListing(i + 1));
    rows.slice(0, 80).forEach((row) => { row.product.quantityOnHand = 0; });
    rows.push(
      makeListing(86, { status: 'draft' }),
      makeListing(87, { status: 'hidden' }),
      makeListing(88, { tenantId: 'other-tenant' }),
      makeListing(89, { shopId: 'other-shop' }),
    );
    const inactive = makeListing(90);
    inactive.product.isActive = false;
    rows.push(inactive);
    mockListings(rows);

    const home = await run();

    expect(home.products.map((product) => product.id)).toEqual([81, 82, 83, 84, 85].map((i) => `listing-${i}`));
    expect(home.store.stats.productCount).toBe(5);
    expect(home.categories).toEqual([{ id: 'late', name: 'Ink', count: 5 }]);
  });

  it('preserves variant stock and continue-selling availability rules across the full catalog', async () => {
    const rows = Array.from({ length: 84 }, (_, i) => makeListing(i + 1));
    rows.slice(80).forEach((row) => { row.product.quantityOnHand = 0; });
    rows[80].product.hasVariants = true;
    rows[81].product.hasVariants = true;
    rows[82].inventoryPolicy = 'continue';
    rows[83].productVariantId = 'missing-variant';
    ProductVariant.findAll.mockResolvedValue([
      { get: () => ({ id: 'variant-81', productId: 'product-81', quantityOnHand: 2, trackStock: true }) },
      { get: () => ({ id: 'variant-82', productId: 'product-82', quantityOnHand: 0, trackStock: true }) },
    ]);
    mockListings(rows);

    const home = await run();

    expect(home.products.slice(80).map((product) => product.id)).toEqual(['listing-81', 'listing-83']);
    expect(home.store.stats.productCount).toBe(82);
  });

  it.each([['store home', undefined], ['product list', getPublicStoreProducts]])('lists sold-out items only when the online store asks (%s)', async (_name, handler) => {
    const rows = Array.from({ length: 4 }, (_, i) => makeListing(i + 1));
    rows[1].product.quantityOnHand = 0;
    rows[2].productVariantId = 'missing-variant';
    rows[3].product.isActive = false;
    mockListings(rows);
    const ids = async (query) => {
      const data = await run(handler, query);
      return (data.products || data).map((product) => product.id);
    };

    expect(await ids({})).toEqual(['listing-1']);
    expect(await ids({ soldOut: '0' })).toEqual(['listing-1']);
    expect(await ids({ soldOut: '1' })).toEqual(['listing-1', 'listing-2']);
  });

  it('returns complete service catalogs with accurate category counts too', async () => {
    store.tenant.businessType = 'studio';
    const services = Array.from({ length: 100 }, (_, i) => ({
      id: `service-${i}`, title: `Service ${i}`, category: i < 80 ? 'Design' : 'Printing',
    }));
    OnlineServiceListing.findAll.mockImplementation(async ({ limit }) => services.slice(0, limit));

    const home = await run();

    expect(home.services).toHaveLength(100);
    expect(home.store.stats).toMatchObject({ serviceCount: 100, categoryCount: 2 });
    expect(home.featuredServices).toHaveLength(8);
    expect(home.serviceCategories).toContainEqual({ name: 'Printing', count: 20 });
  });
});
