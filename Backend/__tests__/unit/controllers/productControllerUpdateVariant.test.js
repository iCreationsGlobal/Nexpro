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
    sequelize: {
      transaction: jest.fn(),
    },
  },
  ProductVariant: {
    findByPk: jest.fn(),
  },
  Shop: {},
  ProductCategory: {},
  Barcode: {},
  SaleItem: {},
  Sale: {},
  Customer: {},
  User: {},
  Expense: {},
  Setting: {},
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

jest.mock('../../../utils/productStockUtils', () => ({
  applyEffectiveProductQuantity: jest.fn((product) => product),
  syncParentQuantityFromVariants: jest.fn().mockResolvedValue(undefined),
  parseQuantity: (value) => {
    const qty = Number.parseFloat(value);
    return Number.isFinite(qty) ? qty : 0;
  },
  recordProductStockMovement: jest.fn().mockResolvedValue(undefined),
  resolveStockMovementType: jest.fn(() => 'adjustment'),
  applyStockChange: jest.fn().mockResolvedValue({ skipped: false, previousQuantity: 0, newQuantity: 0, quantityDelta: 0 }),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateProductListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));

const { Product, ProductVariant } = require('../../../models');
const { assertShopRecordAccess } = require('../../../utils/shopUtils');
const { syncParentQuantityFromVariants } = require('../../../utils/productStockUtils');
const { invalidateProductListCache } = require('../../../middleware/cache');
const productController = require('../../../controllers/productController');

const mockTransaction = () => ({
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
});

describe('productController updateProductVariant', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const variantRecord = {
    id: 'variant-1',
    productId: 'product-1',
    sellingPrice: '10.00',
    costPrice: '5.00',
    update: jest.fn().mockResolvedValue(undefined),
    product: {
      id: 'product-1',
      tenantId: 'tenant-1',
      shopId: 'shop-1',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Product.sequelize.transaction.mockImplementation(async () => mockTransaction());
    ProductVariant.findByPk.mockResolvedValue(variantRecord);
  });

  it('updates variant prices when tenant and shop access are valid', async () => {
    const req = {
      tenantId: 'tenant-1',
      tenantRole: 'manager',
      params: { variantId: 'variant-1' },
      body: { sellingPrice: 25.5, costPrice: 12.25 },
    };
    const res = mockRes();
    const next = jest.fn();

    await productController.updateProductVariant(req, res, next);

    expect(assertShopRecordAccess).toHaveBeenCalledWith(req, variantRecord.product);
    expect(variantRecord.update).toHaveBeenCalledWith(
      { sellingPrice: 25.5, costPrice: 12.25 },
      { transaction: expect.any(Object) }
    );
    expect(syncParentQuantityFromVariants).toHaveBeenCalledWith('product-1', expect.any(Object));
    expect(invalidateProductListCache).toHaveBeenCalledWith('tenant-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.any(Object) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when tenant does not match', async () => {
    const req = {
      tenantId: 'other-tenant',
      params: { variantId: 'variant-1' },
      body: { sellingPrice: 25.5 },
    };
    const res = mockRes();
    const next = jest.fn();

    await productController.updateProductVariant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(variantRecord.update).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when shop access is denied', async () => {
    const accessErr = new Error('You do not have access to this shop');
    accessErr.statusCode = 403;
    assertShopRecordAccess.mockImplementation(() => {
      throw accessErr;
    });

    const req = {
      tenantId: 'tenant-1',
      params: { variantId: 'variant-1' },
      body: { sellingPrice: 25.5 },
    };
    const res = mockRes();
    const next = jest.fn();

    await productController.updateProductVariant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(variantRecord.update).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when variant is missing', async () => {
    ProductVariant.findByPk.mockResolvedValue(null);

    const req = { tenantId: 'tenant-1', params: { variantId: 'missing' }, body: {} };
    const res = mockRes();
    const next = jest.fn();

    await productController.updateProductVariant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});
