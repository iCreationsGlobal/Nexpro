jest.mock('../../../config/database', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    col: jest.fn((name) => ({ col: name })),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    literal: jest.fn((value) => ({ literal: value })),
    where: jest.fn((attr, ...rest) => ({ where: attr, rest })),
  },
}));

jest.mock('../../../controllers/expenseController', () => ({
  generateExpenseNumber: jest.fn(),
}));

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };

jest.mock('../../../models', () => ({
  Product: {
    findOne: jest.fn(),
    sequelize: { transaction: jest.fn(async () => mockTransaction) },
  },
  ProductVariant: { findOne: jest.fn() },
  ProductStockMovement: {},
  Shop: {},
  ProductCategory: {},
  Barcode: {},
  SaleItem: {},
  Sale: {},
  Customer: {},
  User: {},
  OnlineProductListing: {},
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
  userCanAccessShopId: jest.fn(() => true),
}));

jest.mock('../../../utils/productStockUtils', () => ({
  parseQuantity: (value) => {
    const qty = Number.parseFloat(value);
    return Number.isFinite(qty) ? qty : 0;
  },
  applyStockChange: jest.fn(),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateProductListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));

const { Product, ProductVariant } = require('../../../models');
const { applyStockChange } = require('../../../utils/productStockUtils');
const { userCanAccessShopId } = require('../../../utils/shopUtils');
const { invalidateProductListCache } = require('../../../middleware/cache');
const productController = require('../../../controllers/productController');

describe('productController receiveStock', () => {
  const products = {
    soap: { id: 'soap', name: 'Bar soap', shopId: 'shop-1', hasVariants: false, trackStock: true },
    shirt: { id: 'shirt', name: 'Polo shirt', shopId: null, hasVariants: true, trackStock: true },
    service: { id: 'service', name: 'Delivery fee', shopId: 'shop-1', hasVariants: false, trackStock: false },
  };
  const variants = { 'shirt-m': { id: 'shirt-m', productId: 'shirt', name: 'M', trackStock: true } };

  const run = async (body, reqOverrides = {}) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();
    await productController.receiveStock(
      { tenantId: 't1', user: { id: 'u1' }, shopFilterId: 'shop-2', body, ...reqOverrides },
      res,
      next,
    );
    return { res, next, body: res.json.mock.calls[0]?.[0] };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Product.findOne.mockImplementation(async ({ where }) => products[where.id] || null);
    ProductVariant.findOne.mockImplementation(async ({ where }) => {
      const variant = variants[where.id];
      return variant && variant.productId === where.productId ? variant : null;
    });
    applyStockChange.mockImplementation(async ({ delta }) => ({ previousQuantity: 2, newQuantity: 2 + delta }));
  });

  it('adds every item in one transaction with a shared reference', async () => {
    const { res, body } = await run({
      items: [
        { productId: 'soap', quantity: 24 },
        { productId: 'shirt', variantId: 'shirt-m', quantity: '6' },
      ],
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    expect(mockTransaction.rollback).not.toHaveBeenCalled();
    expect(invalidateProductListCache).toHaveBeenCalledWith('t1');

    const calls = applyStockChange.mock.calls.map(([args]) => args);
    expect(calls[0]).toMatchObject({ productId: 'soap', productVariantId: null, shopId: 'shop-1', delta: 24, type: 'receive', transaction: mockTransaction });
    // A shared-catalog product (no home shop) is received into the active shop.
    expect(calls[1]).toMatchObject({ productId: 'shirt', productVariantId: 'shirt-m', shopId: 'shop-2', delta: 6 });
    expect(calls[0].reference).toMatch(/^receive:/);
    expect(calls[1].reference).toBe(calls[0].reference);
    expect(body.data.received.map((row) => [row.name, row.newQuantity])).toEqual([['Bar soap', 26], ['Polo shirt — M', 8]]);
  });

  it.each([
    [{ items: [] }, 'Add at least one item to receive'],
    [{ items: Array.from({ length: 201 }, () => ({ productId: 'soap', quantity: 1 })) }, 'Receive up to 200 items at a time'],
    [{ items: [{ productId: 'soap', quantity: 0 }] }, 'Every item needs a quantity greater than zero'],
    [{ items: [{ productId: 'soap', quantity: -3 }] }, 'Every item needs a quantity greater than zero'],
  ])('rejects a bad delivery before touching stock: %#', async (body, message) => {
    const { res, body: json } = await run(body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(json.message).toBe(message);
    expect(Product.sequelize.transaction).not.toHaveBeenCalled();
  });

  it.each([
    [[{ productId: 'missing', quantity: 1 }], 404, 'A product in this delivery was not found. Refresh and try again.'],
    [[{ productId: 'shirt', quantity: 1 }], 400, 'Polo shirt: choose which variant arrived.'],
    [[{ productId: 'shirt', variantId: 'other', quantity: 1 }], 404, 'Polo shirt: this variant was not found. Refresh and try again.'],
    [[{ productId: 'service', quantity: 1 }], 400, 'Delivery fee: stock is not tracked for this item.'],
  ])('saves nothing when any item fails: %#', async (failing, status, message) => {
    const { res, body } = await run({ items: [{ productId: 'soap', quantity: 5 }, ...failing] });
    expect(res.status).toHaveBeenCalledWith(status);
    expect(body.message).toBe(message);
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
    expect(invalidateProductListCache).not.toHaveBeenCalled();
  });

  it('refuses a shop the user cannot access', async () => {
    userCanAccessShopId.mockReturnValueOnce(false);
    const { res } = await run({ items: [{ productId: 'soap', quantity: 1 }] });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('passes unexpected errors on after rolling back', async () => {
    applyStockChange.mockRejectedValueOnce(new Error('connection lost'));
    const { next } = await run({ items: [{ productId: 'soap', quantity: 1 }] });
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'connection lost' }));
  });
});
