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

describe('product sticker names (labelName)', () => {
  const apply = productController._applyLabelNamePayload;

  it('saves the name in metadata without losing the other metadata', () => {
    const product = { metadata: { productCode: 'D-1', storeImages: { a: 1 } } };
    const payload = { labelName: '  Black long dress XL  ' };
    apply(product, payload);
    expect(payload).toEqual({ metadata: { productCode: 'D-1', storeImages: { a: 1 }, labelName: 'Black long dress XL' } });
  });

  it('removes the saved name when it is cleared, and caps its length', () => {
    const cleared = { labelName: '' };
    apply({ metadata: { productCode: 'D-1', labelName: 'Old' } }, cleared);
    expect(cleared).toEqual({ metadata: { productCode: 'D-1' } });
    const long = { labelName: 'x'.repeat(80) };
    apply({}, long);
    expect(long.metadata.labelName).toHaveLength(60);
  });

  it('merges into metadata sent in the same request, and leaves payloads without a name alone', () => {
    const payload = { labelName: 'Gown M', metadata: { productCode: 'NEW' } };
    apply({ metadata: { productCode: 'OLD' } }, payload);
    expect(payload).toEqual({ metadata: { productCode: 'NEW', labelName: 'Gown M' } });
    const untouched = { name: 'Gown' };
    apply({ metadata: { labelName: 'Gown M' } }, untouched);
    expect(untouched).toEqual({ name: 'Gown' });
  });

  it('sends the saved name with the product list', async () => {
    Product.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await productController.getProducts({ tenantId: 't1', query: {}, shopScoped: false }, res, jest.fn());
    const { attributes } = Product.findAndCountAll.mock.calls[0][0];
    expect(attributes.include).toEqual(expect.arrayContaining([
      [{ literal: `"Product"."metadata"->>'labelName'` }, 'labelName'],
    ]));
  });
});
