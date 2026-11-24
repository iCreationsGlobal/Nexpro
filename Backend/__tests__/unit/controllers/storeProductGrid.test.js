jest.mock('../../../config/database', () => ({
  sequelize: { fn: jest.fn(), col: jest.fn(), literal: jest.fn() },
}));
jest.mock('../../../models', () => ({
  OnlineStoreSettings: { findOne: jest.fn(), create: jest.fn() },
  OnlineProductListing: { findAll: jest.fn().mockResolvedValue([]) },
  OnlineServiceListing: { findAll: jest.fn().mockResolvedValue([]) },
  ProductVariant: { findAll: jest.fn().mockResolvedValue([]) },
  SaleItem: { findAll: jest.fn().mockResolvedValue([]) },
  Setting: { findOne: jest.fn().mockResolvedValue(null) },
  Product: {}, ProductCategory: {}, Shop: {}, Tenant: {}, Sale: {},
}));
jest.mock('../../../middleware/upload', () => ({ baseUploadDir: '/tmp/uploads', ensureDirExists: jest.fn() }));
jest.mock('../../../middleware/cache', () => ({ invalidatePublicStorefrontCache: jest.fn() }));
jest.mock('../../../services/tradeAssuranceService', () => ({}));
jest.mock('../../../services/pushNotificationService', () => ({}));
jest.mock('../../../services/orderCustomerNotificationService', () => ({}));
jest.mock('../../../controllers/studioStoreController', () => ({ isStudioTenant: (type) => type === 'studio' }));
jest.mock('../../../controllers/onlineStoreHeroController', () => ({ resolveHeroSlidesForStore: jest.fn().mockResolvedValue([]) }));
jest.mock('../../../services/storefrontReviewService', () => ({
  attachProductReviewSummaries: jest.fn(async (items) => items),
  attachServiceReviewSummaries: jest.fn(async (items) => items),
  getPublicReviewSummary: jest.fn().mockResolvedValue({ reviews: [] }),
}));
jest.mock('../../../utils/performanceLogger', () => ({ startHotPathTimer: () => jest.fn() }));

const { invalidatePublicStorefrontCache } = require('../../../middleware/cache');
const { OnlineStoreSettings } = require('../../../models');
const { getMarketplaceStoreHome, upsertSettings } = require('../../../controllers/storeController');

const DEFAULTS = { phone: 2, computer: null, computerCards: 'large' };
const CHOSEN = { phone: 1, computer: 6, computerCards: 'compact' };

let store;
const call = async (handler, req) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await handler({ tenantId: 'tenant-1', tenant: {}, params: { slug: 'demo' }, query: {}, body: {}, ...req }, res, next);
  expect(next).not.toHaveBeenCalled();
  return res.json.mock.calls[0][0].data;
};
const shoppersSee = async () => (await call(getMarketplaceStoreHome)).store.productGrid;
const save = (metadata) => call(upsertSettings, {
  body: { displayName: 'Demo', slug: 'demo', enabled: true, templateId: 'classic', ...(metadata ? { metadata } : {}) },
});

beforeEach(() => {
  jest.clearAllMocks();
  store = {
    id: 'store-1', tenantId: 'tenant-1', slug: 'demo', displayName: 'Demo', enabled: true, currency: 'GHS',
    metadata: { productCardActions: ['buy_now'], other: 'kept' }, tenant: { businessType: 'shop', plan: 'starter' },
    update: jest.fn(async (payload) => Object.assign(store, payload)),
  };
  // The slug check looks for another store with the same slug.
  OnlineStoreSettings.findOne.mockImplementation(async ({ attributes }) => (attributes?.length === 2 ? null : store));
});

describe('products per row', () => {
  it('is two on phones, and the template on computers, until the owner chooses', async () => {
    expect(await shoppersSee()).toEqual(DEFAULTS);
  });

  it('is saved, shown to shoppers, and leaves other settings alone', async () => {
    const saved = await save({ productGrid: CHOSEN });
    expect(saved.metadata.productGrid).toEqual(CHOSEN);
    expect(await shoppersSee()).toEqual(CHOSEN);
    expect(store.metadata).toMatchObject({ other: 'kept', productCardActions: ['buy_now'] });
    expect(invalidatePublicStorefrontCache).toHaveBeenCalledWith('demo');
  });

  it.each([['something else is saved', { productCardActions: ['view'] }], ['nothing extra is sent', undefined]])('stays when %s', async (_name, metadata) => {
    store.metadata.productGrid = CHOSEN;
    await save(metadata);
    expect(await shoppersSee()).toEqual(CHOSEN);
  });

  it('never stores or shows values it does not know', async () => {
    await save({ productGrid: { phone: 99, computer: '<script>', computerCards: {}, junk: 'x' } });
    expect(store.metadata.productGrid).toEqual(DEFAULTS);
    store.metadata.productGrid = { phone: 'bad', computer: 2 };
    expect(await shoppersSee()).toEqual(DEFAULTS);
  });
});
