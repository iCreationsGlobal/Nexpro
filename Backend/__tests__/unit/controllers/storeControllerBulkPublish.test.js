jest.mock('../../../config/database', () => ({
  sequelize: {
    where: jest.fn((left, right) => ({ type: 'where', left, right })),
    json: jest.fn((path) => ({ type: 'json', path })),
    literal: jest.fn((sql) => ({ type: 'literal', sql })),
    query: jest.fn(),
    QueryTypes: { SELECT: 'SELECT' },
    transaction: jest.fn(),
  },
  testConnection: jest.fn(),
}));

jest.mock('../../../models', () => ({
  OnlineStoreSettings: { findOne: jest.fn(), create: jest.fn(), count: jest.fn() },
  OnlineProductListing: { findAll: jest.fn(), create: jest.fn() },
  Sale: {},
  SaleItem: {},
  SaleActivity: {},
  MarketplaceOrderPayment: {},
  Customer: {},
  Lead: {},
  Job: {},
  Product: { findAll: jest.fn() },
  ProductVariant: {},
  Shop: {},
  Tenant: {},
  Setting: { findOne: jest.fn() },
}));

jest.mock('../../../middleware/upload', () => ({
  baseUploadDir: '/tmp/uploads',
  ensureDirExists: jest.fn(),
}));

jest.mock('../../../utils/tenantUtils', () => ({
  applyTenantFilter: jest.fn((tenantId, where = {}) => ({ ...where, tenantId })),
}));

jest.mock('../../../utils/paginationUtils', () => ({
  getPagination: jest.fn(() => ({ page: 1, limit: 20, offset: 0 })),
}));

jest.mock('../../../utils/shopUtils', () => ({
  applyShopReadFilter: jest.fn((_req, where) => where),
  attachShopToPayload: jest.fn((_req, payload) => payload),
  assertShopIdAccess: jest.fn(),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateSaleListCache: jest.fn(),
}));

jest.mock('../../../services/tradeAssuranceService', () => ({
  getTradeAssuranceSummary: jest.fn(),
  listPayoutHistory: jest.fn(),
  listTradeAssuranceDisputes: jest.fn(),
  listTradeAssurancePayments: jest.fn(),
  markDeliveryReleaseWindowForSale: jest.fn(),
  refundMarketplaceOrderPayment: jest.fn(),
  releaseMarketplaceOrderPayment: jest.fn(),
}));

jest.mock('../../../services/pushNotificationService', () => ({
  dispatchExpoPushToStorefrontCustomers: jest.fn(),
}));

jest.mock('../../../services/platformAdminNotificationService', () => ({
  notifyCustomDomainSubmitted: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../utils/corsUtils', () => ({
  refreshVerifiedDomainOrigins: jest.fn().mockResolvedValue(undefined),
  hostVariants: (host) => {
    const h = String(host || '').trim().toLowerCase().replace(/\.$/, '');
    if (!h) return [];
    const variants = [h];
    if (h.startsWith('www.')) {
      const apex = h.slice(4);
      if (apex) variants.push(apex);
    } else if (h.includes('.')) {
      variants.push(`www.${h}`);
    }
    return [...new Set(variants)];
  },
}));

const { OnlineProductListing, Product } = require('../../../models');
const storeController = require('../../../controllers/storeController');

describe('storeController bulkPublishProductListings', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };
  const product = (overrides) => ({ name: 'Bel Aqua', sellingPrice: 5, imageUrl: '/a.jpg', metadata: {}, shopId: null, ...overrides });

  const run = async (productIds) => {
    const res = mockRes();
    const next = jest.fn();
    await storeController.bulkPublishProductListings({ tenantId: 't1', body: { productIds } }, res, next);
    expect(next).not.toHaveBeenCalled();
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    OnlineProductListing.create.mockResolvedValue({});
  });

  it('creates listings with the main and store photos, unique slugs, and skips products without a photo or price', async () => {
    Product.findAll.mockResolvedValue([
      product({ id: 'p1', metadata: { productCode: '00001', storeImages: { B: '/b.jpg', D: '/d.jpg' } } }),
      product({ id: 'p2' }),
      product({ id: 'p3', imageUrl: null }),
      product({ id: 'p4', sellingPrice: 0 }),
    ]);
    OnlineProductListing.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ slug: 'bel-aqua' }]);

    const res = await run(['p1', 'p2', 'p3', 'p4', 'missing']);
    const { published, skipped } = res.json.mock.calls[0][0].data;

    expect(published.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(skipped.map((s) => [s.id, s.reason])).toEqual([
      ['p3', 'No photo'],
      ['p4', 'Public selling price must be greater than zero before publishing'],
      ['missing', 'Product not found'],
    ]);
    const created = OnlineProductListing.create.mock.calls.map(([payload]) => payload);
    expect(created[0]).toMatchObject({ productId: 'p1', status: 'published', slug: 'bel-aqua-2', images: ['/a.jpg', '/b.jpg', '/d.jpg'] });
    expect(created[1]).toMatchObject({ productId: 'p2', slug: 'bel-aqua-3', images: ['/a.jpg'] });
  });

  it('publishes an existing draft and keeps its own photos', async () => {
    Product.findAll.mockResolvedValue([product({ id: 'p1' })]);
    const draft = {
      productId: 'p1', status: 'draft', title: 'Bel Aqua', publicPrice: 5, images: ['/edited.jpg'], publishedAt: null,
      get: () => ({ title: 'Bel Aqua', publicPrice: 5, images: ['/edited.jpg'] }),
      update: jest.fn(),
    };
    OnlineProductListing.findAll.mockResolvedValueOnce([draft]).mockResolvedValueOnce([]);

    await run(['p1']);

    expect(draft.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'published', images: ['/edited.jpg'] }));
    expect(OnlineProductListing.create).not.toHaveBeenCalled();
  });

  it('rejects an empty or oversized selection', async () => {
    expect((await run([])).status).toHaveBeenCalledWith(400);
    expect((await run(Array.from({ length: 101 }, (_, i) => `p${i}`))).status).toHaveBeenCalledWith(400);
  });
});
