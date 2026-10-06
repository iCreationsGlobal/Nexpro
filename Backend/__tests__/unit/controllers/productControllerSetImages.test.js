jest.mock('../../../config/database', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    col: jest.fn((name) => ({ col: name })),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    literal: jest.fn((value) => ({ literal: value })),
  },
}));

jest.mock('../../../controllers/expenseController', () => ({
  generateExpenseNumber: jest.fn(),
}));

jest.mock('../../../models', () => ({
  Product: {
    findOne: jest.fn(),
  },
  ProductVariant: {},
  Shop: {},
  ProductCategory: {},
  Barcode: {},
  SaleItem: {},
  Sale: {},
  Customer: {},
  User: {},
  Expense: {},
  Setting: {},
  OnlineProductListing: { findOne: jest.fn() },
}));

jest.mock('../../../utils/tenantUtils', () => ({
  applyTenantFilter: jest.fn((_tenantId, where) => where),
  sanitizePayload: jest.fn((body) => ({ ...body })),
}));

jest.mock('../../../utils/shopUtils', () => ({
  applyShopReadFilter: jest.fn((_req, where) => where),
  attachShopToPayload: jest.fn((_req, payload) => payload),
  assertShopRecordAccess: jest.fn(),
  userCanAccessShopId: jest.fn(),
}));

jest.mock('../../../utils/paginationUtils', () => ({
  getPagination: jest.fn(),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateProductListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));


const { Product, OnlineProductListing } = require('../../../models');
const { invalidateProductListCache } = require('../../../middleware/cache');
const productController = require('../../../controllers/productController');

describe('productController setProductImages', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const makeProduct = (overrides = {}) => {
    const product = {
      id: 'product-1',
      imageUrl: '/uploads/old-a.jpg',
      metadata: { productCode: '00001', storeImages: { B: '/uploads/old-b.jpg' } },
      ...overrides,
    };
    product.update = jest.fn(async (values) => Object.assign(product, values));
    return product;
  };

  const run = async (body) => {
    const res = mockRes();
    const next = jest.fn();
    await productController.setProductImages({ tenantId: 'tenant-1', params: { id: 'product-1' }, body }, res, next);
    expect(next).not.toHaveBeenCalled();
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets the main photo from slot A and merges store slots without losing other metadata', async () => {
    const product = makeProduct();
    Product.findOne.mockResolvedValue(product);

    const res = await run({ images: { A: '/uploads/new-a.jpg', C: '/uploads/new-c.jpg' } });

    expect(product.update).toHaveBeenCalledWith({
      imageUrl: '/uploads/new-a.jpg',
      metadata: {
        productCode: '00001',
        storeImages: { B: '/uploads/old-b.jpg', C: '/uploads/new-c.jpg' },
      },
    });
    expect(invalidateProductListCache).toHaveBeenCalledWith('tenant-1');
    expect(OnlineProductListing.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.storeImages).toEqual({ B: '/uploads/old-b.jpg', C: '/uploads/new-c.jpg' });
  });

  it('rejects unknown slots and empty requests', async () => {
    Product.findOne.mockResolvedValue(makeProduct());
    expect((await run({ images: { F: '/uploads/f.jpg' } })).status).toHaveBeenCalledWith(400);
    expect((await run({ images: {} })).status).toHaveBeenCalledWith(400);
    expect(Product.findOne).not.toHaveBeenCalled();
  });

  it('updates a live listing slot by slot only when asked', async () => {
    Product.findOne.mockResolvedValue(makeProduct());
    const listing = { images: ['/uploads/cover.jpg', '/uploads/second.jpg'], update: jest.fn() };
    OnlineProductListing.findOne.mockResolvedValue(listing);

    const res = await run({ images: { B: '/uploads/new-b.jpg' }, updateLiveListing: true });

    expect(listing.update).toHaveBeenCalledWith({ images: ['/uploads/cover.jpg', '/uploads/new-b.jpg'] });
    expect(res.json.mock.calls[0][0].data.listingUpdated).toBe(true);
  });

  it('returns 404 for a product outside the tenant', async () => {
    Product.findOne.mockResolvedValue(null);
    expect((await run({ images: { A: '/uploads/a.jpg' } })).status).toHaveBeenCalledWith(404);
  });
});
