jest.mock('../../../config/database', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    col: jest.fn((name) => ({ col: name })),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    literal: jest.fn((value) => ({ literal: value })),
    cast: jest.fn((value, type) => ({ cast: value, type })),
    where: jest.fn((attr, condition) => ({ where: attr, condition })),
  },
}));

jest.mock('../../../controllers/expenseController', () => ({
  generateExpenseNumber: jest.fn(),
}));

jest.mock('../../../models', () => ({
  Product: {
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    sequelize: {
      literal: jest.fn((value) => ({ literal: value })),
      escape: jest.fn((value) => `'${value}'`),
      cast: jest.fn((value, type) => ({ cast: value, type })),
      where: jest.fn((attr, condition) => ({ where: attr, condition })),
    },
  },
  ProductVariant: { findOne: jest.fn() },
  Shop: {},
  ProductCategory: {},
  Barcode: {
    findOne: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
  },
  SaleItem: {},
  Sale: {},
  Customer: {},
  User: {},
  Expense: {},
  Setting: {},
}));

jest.mock('../../../utils/tenantUtils', () => ({
  applyTenantFilter: jest.fn((tenantId, where) => ({ ...where, tenantId })),
  sanitizePayload: jest.fn((body) => ({ ...body })),
}));

jest.mock('../../../utils/shopUtils', () => ({
  applyShopReadFilter: jest.fn((_req, where) => where),
  attachShopToPayload: jest.fn((_req, payload) => payload),
  assertShopRecordAccess: jest.fn(),
  userCanAccessShopId: jest.fn(),
}));

jest.mock('../../../utils/paginationUtils', () => ({
  getPagination: jest.fn(() => ({ page: 1, limit: 10, offset: 0 })),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateProductListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));

const { Product } = require('../../../models');
const productController = require('../../../controllers/productController');


const { ProductVariant, Barcode } = require('../../../models');
const { Op } = require('sequelize');

describe('barcode shared-shop visibility', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses shared catalog visibility for every lookup and preserves tenant scope', async () => {
    Product.findOne.mockResolvedValue(null);
    ProductVariant.findOne.mockResolvedValue(null);
    Barcode.findOne.mockResolvedValue(null);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await productController.getProductByBarcode({
      params: { barcode: '6034000181142' }, query: {},
      tenantId: 'tenant-1', shopScoped: true, shopFilterId: 'shop-2',
    }, res, next);
    expect(next).not.toHaveBeenCalled();
    const direct = Product.findOne.mock.calls[0][0].where;
    const variant = ProductVariant.findOne.mock.calls[0][0].include[0].where;
    const aliases = Barcode.findOne.mock.calls[0][0].include;
    for (const [where, alias] of [
      [direct, 'Product'], [variant, 'product'],
      [aliases[0].where, 'product'],
      [aliases[1].include[0].where, 'productVariant->product'],
    ]) {
      expect(where.tenantId).toBe('tenant-1');
      const sql = where[Op.and][0].literal;
      expect(sql).toContain('FROM product_shop_stocks');
      expect(sql).toContain(`pss."productId" = "${alias}"."id"`);
      expect(sql).toContain(`pss."tenantId" = "${alias}"."tenantId"`);
      expect(sql).toContain(`pss."shopId" = 'shop-2'`);
    }
    expect(aliases[0].required).toBe(false);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
