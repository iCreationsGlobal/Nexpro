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
    update: jest.fn(),
  },
  ProductVariant: {
    findByPk: jest.fn(),
    count: jest.fn(),
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

jest.mock('../../../utils/paginationUtils', () => ({
  getPagination: jest.fn(),
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
const { invalidateProductListCache } = require('../../../middleware/cache');
const productController = require('../../../controllers/productController');

describe('productController deleteProductVariant', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const variantRecord = {
    id: 'variant-1',
    productId: 'product-1',
    destroy: jest.fn().mockResolvedValue(undefined),
    product: {
      id: 'product-1',
      tenantId: 'tenant-1',
      shopId: 'shop-1',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ProductVariant.findByPk.mockResolvedValue(variantRecord);
    ProductVariant.count.mockResolvedValue(1);
    Product.update.mockResolvedValue([1]);
  });

  it('deletes variant when tenant and shop access are valid', async () => {
    const req = { tenantId: 'tenant-1', params: { variantId: 'variant-1' } };
    const res = mockRes();
    const next = jest.fn();

    await productController.deleteProductVariant(req, res, next);

    expect(assertShopRecordAccess).toHaveBeenCalledWith(req, variantRecord.product);
    expect(variantRecord.destroy).toHaveBeenCalled();
    expect(Product.update).not.toHaveBeenCalled();
    expect(invalidateProductListCache).toHaveBeenCalledWith('tenant-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Variant deleted successfully',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('clears hasVariants when deleting the last variant', async () => {
    ProductVariant.count.mockResolvedValue(0);
    const req = { tenantId: 'tenant-1', params: { variantId: 'variant-1' } };
    const res = mockRes();
    const next = jest.fn();

    await productController.deleteProductVariant(req, res, next);

    expect(Product.update).toHaveBeenCalledWith(
      { hasVariants: false },
      { where: { id: 'product-1' } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 403 when shop access is denied', async () => {
    const accessErr = new Error('You do not have access to this shop');
    accessErr.statusCode = 403;
    assertShopRecordAccess.mockImplementation(() => {
      throw accessErr;
    });

    const req = { tenantId: 'tenant-1', params: { variantId: 'variant-1' } };
    const res = mockRes();
    const next = jest.fn();

    await productController.deleteProductVariant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(variantRecord.destroy).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when variant is missing', async () => {
    ProductVariant.findByPk.mockResolvedValue(null);
    const req = { tenantId: 'tenant-1', params: { variantId: 'missing' } };
    const res = mockRes();
    const next = jest.fn();

    await productController.deleteProductVariant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});
