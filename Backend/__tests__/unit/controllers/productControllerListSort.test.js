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
    findAndCountAll: jest.fn(),
    sequelize: {
      col: jest.fn((name) => ({ col: name })),
      literal: jest.fn((value) => ({ literal: value })),
      cast: jest.fn((value, type) => ({ cast: value, type })),
      where: jest.fn((attr, ...rest) => ({ where: attr, rest })),
    },
  },
  ProductVariant: {},
  Shop: {},
  ProductCategory: {},
  Barcode: {
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
  lowestVariantPriceAttribute: jest.fn(() => ['lowestVariantPrice-sql', 'lowestVariantPrice']),
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

describe('productController list sort', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Product.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
  });

  describe('_resolveProductListSort', () => {
    it('defaults to name_asc with id tie-breaker', () => {
      expect(productController._resolveProductListSort()).toEqual({
        sort: 'name_asc',
        order: [['name', 'ASC'], ['id', 'ASC']],
      });
    });

    it('falls back to name_asc for unknown values', () => {
      expect(productController._resolveProductListSort('size_asc').sort).toBe('name_asc');
      expect(productController._resolveProductListSort('').sort).toBe('name_asc');
    });

    it('resolves each whitelist key', () => {
      expect(productController._resolveProductListSort('created_desc').order).toEqual([
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ]);
      expect(productController._resolveProductListSort('updated_desc').order).toEqual([
        ['updatedAt', 'DESC'],
        ['id', 'DESC'],
      ]);
      expect(productController._resolveProductListSort('stock_desc').order).toEqual([
        ['quantityOnHand', 'DESC'],
        ['id', 'DESC'],
      ]);
      expect(productController._resolveProductListSort('stock_asc').order).toEqual([
        ['quantityOnHand', 'ASC'],
        ['id', 'ASC'],
      ]);
      expect(productController._resolveProductListSort('price_asc').order).toEqual([
        ['sellingPrice', 'ASC'],
        ['id', 'ASC'],
      ]);
      expect(productController._resolveProductListSort('price_desc').order).toEqual([
        ['sellingPrice', 'DESC'],
        ['id', 'DESC'],
      ]);
    });
  });

  describe('getProducts', () => {
    it('passes resolved order from sort query (default name_asc)', async () => {
      const req = { tenantId: 't1', query: {}, shopScoped: false };
      const res = mockRes();

      await productController.getProducts(req, res, jest.fn());

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['name', 'ASC'], ['id', 'ASC']],
        }),
      );
    });

    it('accepts sortBy alias and whitelist values', async () => {
      const req = { tenantId: 't1', query: { sortBy: 'price_desc' }, shopScoped: false };
      const res = mockRes();

      await productController.getProducts(req, res, jest.fn());

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['sellingPrice', 'DESC'], ['id', 'DESC']],
        }),
      );
    });

    it('relevance with a search puts the exact name, then names starting with it, first', async () => {
      Product.sequelize.escape = jest.fn((value) => `'${value}'`);
      const req = { tenantId: 't1', query: { sort: 'relevance', search: ' MacBook ' }, shopScoped: false };

      await productController.getProducts(req, mockRes(), jest.fn());

      const { order } = Product.findAndCountAll.mock.calls[0][0];
      expect(order.slice(1)).toEqual([['name', 'ASC'], ['id', 'ASC']]);
      expect(order[0][1]).toBe('ASC');
      expect(order[0][0].literal).toContain("= 'macbook' THEN 0");
      expect(order[0][0].literal).toContain("LIKE 'macbook%' THEN 1");
      expect(order[0][0].literal).toContain("LIKE '% macbook%' THEN 2");
    });

    it('relevance without a search falls back to name_asc', async () => {
      const req = { tenantId: 't1', query: { sort: 'relevance' }, shopScoped: false };

      await productController.getProducts(req, mockRes(), jest.fn());

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({ order: [['name', 'ASC'], ['id', 'ASC']] }),
      );
    });

    it('rejects unknown sort and uses name_asc', async () => {
      const req = { tenantId: 't1', query: { sort: 'not_a_real_sort' }, shopScoped: false };
      const res = mockRes();

      await productController.getProducts(req, res, jest.fn());

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['name', 'ASC'], ['id', 'ASC']],
        }),
      );
    });
  });

  describe('stock filters', () => {
    const { Op } = require('sequelize');
    const listWhere = async (query) => {
      await productController.getProducts({ tenantId: 't1', query, shopScoped: false }, mockRes(), jest.fn());
      return Product.findAndCountAll.mock.calls[0][0].where;
    };
    // The stock clause is added after the search clause.
    const stockClause = (where) => where[Op.and][where[Op.and].length - 1][Op.or];

    it('ignores stock when no stock filter is set', async () => {
      const where = await listWhere({});
      expect(where.trackStock).toBeUndefined();
      expect(where[Op.and]).toBeUndefined();
    });

    it('lowStock keeps tracked products above 0 and at or below their reorder level', async () => {
      const where = await listWhere({ lowStock: 'true' });
      expect(where.trackStock).toEqual({ [Op.ne]: false });
      expect(stockClause(where)).toEqual([{
        [Op.and]: [
          { where: { col: 'Product.quantityOnHand' }, rest: [Op.gt, 0] },
          { where: { col: 'Product.quantityOnHand' }, rest: [Op.lte, { col: 'Product.reorderLevel' }] },
        ],
      }]);
    });

    it('outOfStock keeps tracked products at 0 or less, and both together return either', async () => {
      const out = await listWhere({ outOfStock: 'true' });
      expect(stockClause(out)).toEqual([{ where: { col: 'Product.quantityOnHand' }, rest: [Op.lte, 0] }]);

      Product.findAndCountAll.mockClear();
      const both = await listWhere({ lowStock: 'true', outOfStock: 'true', search: 'soap' });
      expect(stockClause(both)).toHaveLength(2);
      expect(both[Op.and]).toHaveLength(2);
    });
  });
});
