const mockStore = (overrides = {}) => ({
  id: 'store-1', tenantId: 't1', shopId: null, slug: 'payless-technologies', displayName: 'Payless Technologies', description: 'Outstanding standards',
  currency: 'GHS', metadata: {}, tenant: { businessType: 'shop' }, get() { return { ...this }; }, ...overrides,
});
const mockListing = (title, overrides = {}) => ({
  id: title, tenantId: 't1', shopId: null, productId: `p-${title}`, title, slug: title.toLowerCase().replace(/\W+/g, '-'), shortDescription: '',
  publicPrice: 10, images: [], inventoryPolicy: 'continue', product: { id: `p-${title}`, name: title, trackStock: false, isSalable: true, metadata: {}, category: null },
  get() { return { ...this }; }, ...overrides,
});

jest.mock('../../../models', () => ({
  OnlineProductListing: { findAll: jest.fn() },
  OnlineServiceListing: { findAll: jest.fn() },
  OnlineStoreSettings: { findAll: jest.fn(), findAndCountAll: jest.fn() },
  ProductVariant: { findAll: jest.fn().mockResolvedValue([]) },
  SaleItem: { findAll: jest.fn().mockResolvedValue([]) },
  Sale: {}, Product: {}, ProductCategory: {}, Shop: {}, Tenant: {}, Customer: {}, StorefrontCustomer: {}, StorefrontWishlistItem: {}, MarketplaceDispute: {},
  Lead: {}, Job: {}, PricingTemplate: {}, StudioLocation: {}, sequelize: { transaction: jest.fn(), literal: jest.fn() },
}));
jest.mock('../../../services/storefrontReviewService', () => ({
  attachProductReviewSummaries: jest.fn((items) => Promise.resolve(items)),
  attachServiceReviewSummaries: jest.fn((items) => Promise.resolve(items)),
  attachStoreReviewSummaries: jest.fn((items) => Promise.resolve(items)),
  getPublicReviewSummary: jest.fn(),
}));

const { OnlineProductListing, OnlineServiceListing, OnlineStoreSettings } = require('../../../models');
const storeController = require('../../../controllers/storeController');
const studioStoreController = require('../../../controllers/studioStoreController');

const call = async (handler, query) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await handler({ query }, res, next);
  expect(next).not.toHaveBeenCalled();
  return res.json.mock.calls[0][0];
};
const names = (payload) => payload.data.map((entry) => entry.title || entry.displayName);

beforeEach(() => {
  jest.clearAllMocks();
  OnlineStoreSettings.findAll.mockResolvedValue([mockStore()]);
});

describe('marketplace product search', () => {
  const withCategory = (title, category, shortDescription) => {
    const listing = mockListing(title, { shortDescription });
    listing.product.category = category ? { id: category, name: category } : null;
    return listing;
  };
  beforeEach(() => {
    OnlineProductListing.findAll.mockResolvedValue([
      withCategory('Samsung 2.5HP Split Air Conditioner', 'Home Appliances', 'Standard kit'),
      withCategory('Nokia 105 Keypad Phone', 'Mobile Phones', 'Long standby time'),
      withCategory('Standing Fan', 'Home Appliances', ''),
      withCategory('Laptop Stand', 'Accessories', ''),
      withCategory('HP Notebook', 'Computers & Laptops', 'Comes with a stand'),
    ]);
  });

  it('puts the thing itself first and leaves out "standard" and "standby"', async () => {
    const payload = await call(storeController.getMarketplaceProducts, { search: 'stand' });
    expect(names(payload)).toEqual(['Laptop Stand', 'Standing Fan', 'HP Notebook']);
    expect(payload.count).toBe(3);
  });

  it('matches words in any order and other names for the same thing', async () => {
    expect(names(await call(storeController.getMarketplaceProducts, { search: 'phone nokia' }))).toEqual(['Nokia 105 Keypad Phone']);
    expect(names(await call(storeController.getMarketplaceProducts, { search: 'ac' }))).toEqual(['Samsung 2.5HP Split Air Conditioner']);
  });

  it("finds a seller's products by the seller's name, not by its description", async () => {
    expect((await call(storeController.getMarketplaceProducts, { search: 'payless' })).count).toBe(5);
    expect(names(await call(storeController.getMarketplaceProducts, { search: 'payless phone' }))).toEqual(['Nokia 105 Keypad Phone']);
    expect((await call(storeController.getMarketplaceProducts, { search: 'outstanding' })).count).toBe(0);
  });

  it('only uses the seller whose branch lists the product', async () => {
    OnlineStoreSettings.findAll.mockResolvedValue([mockStore({ shopId: 's1', displayName: 'Accra Branch', slug: 'accra' }), mockStore({ id: '2', shopId: 's2', displayName: 'Kumasi Branch', slug: 'kumasi' })]);
    OnlineProductListing.findAll.mockResolvedValue([mockListing('Mug', { shopId: 's1' }), mockListing('Cup', { shopId: 's2' })]);
    expect(names(await call(storeController.getMarketplaceProducts, { search: 'kumasi' }))).toEqual(['Cup']);
  });

  it('pages through ranked results', async () => {
    OnlineProductListing.findAll.mockResolvedValue([...Array.from({ length: 14 }, (_, i) => mockListing(`Cable ${i}`, { shortDescription: 'with stand' })), mockListing('Phone Stand')]);
    const first = await call(storeController.getMarketplaceProducts, { search: 'stand', limit: '10' });
    const second = await call(storeController.getMarketplaceProducts, { search: 'stand', limit: '10', page: '2' });
    expect(names(first)[0]).toBe('Phone Stand');
    expect(first.pagination).toEqual({ page: 1, limit: 10, totalPages: 2 });
    expect(new Set([...names(first), ...names(second)]).size).toBe(15);
  });

  it('keeps the usual order when nothing is searched', async () => {
    expect(names(await call(storeController.getMarketplaceProducts, {}))).toEqual([
      'Samsung 2.5HP Split Air Conditioner', 'Nokia 105 Keypad Phone', 'Standing Fan', 'Laptop Stand', 'HP Notebook',
    ]);
  });
});

describe('marketplace service search', () => {
  it('ranks names first and ignores parts of words in descriptions', async () => {
    const service = (title, category, shortDescription = '') => mockListing(title, { category, shortDescription, ctaType: 'request_quote', priceType: 'fixed', startingPrice: 5 });
    OnlineServiceListing.findAll.mockResolvedValue([service('Printing', 'Print', 'High standard'), service('Banner Stand Hire', 'Events'), service('Photo Booth', 'Events', 'Includes a stand')]);
    expect(names(await call(studioStoreController.getMarketplaceServices, { search: 'stand' }))).toEqual(['Banner Stand Hire', 'Photo Booth']);
    expect(names(await call(studioStoreController.getMarketplaceServices, {}))).toHaveLength(3);
  });
});

describe('marketplace store and studio search', () => {
  it.each([
    ['stores', () => storeController.getMarketplaceStores],
    ['studios', () => studioStoreController.getMarketplaceStudios],
  ])('ranks %s by name, then whole words in the description', async (_label, handler) => {
    OnlineProductListing.findAll.mockResolvedValue([]);
    OnlineServiceListing.findAll.mockResolvedValue([]);
    OnlineStoreSettings.findAll.mockResolvedValue([
      mockStore({ id: 'a', slug: 'a', displayName: 'Alpha', description: 'High standards' }),
      mockStore({ id: 'b', slug: 'b', displayName: 'Beta', description: 'Every stand you need' }),
      mockStore({ id: 'c', slug: 'c', displayName: 'Stand World', description: '' }),
    ]);
    const payload = await call(handler(), { search: 'stand', limit: '1' });
    expect(names(payload)).toEqual(['Stand World']);
    expect(payload.count).toBe(2);
    expect(payload.pagination.totalPages).toBe(2);
    expect(names(await call(handler(), { search: 'stand', limit: '1', page: '2' }))).toEqual(['Beta']);
  });

  it('lets the database page the list when nothing is searched', async () => {
    OnlineProductListing.findAll.mockResolvedValue([]);
    OnlineStoreSettings.findAndCountAll.mockResolvedValue({ count: 1, rows: [mockStore()] });
    expect((await call(storeController.getMarketplaceStores, { limit: '5', page: '2' })).count).toBe(1);
    expect(OnlineStoreSettings.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, offset: 5, distinct: true }));
  });
});
