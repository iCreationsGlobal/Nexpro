jest.mock('../../../config/database', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    col: jest.fn((name) => ({ col: name })),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    literal: jest.fn((value) => ({ literal: value })),
  },
}));

const mockTransaction = {
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../../models', () => ({
  Product: {
    create: jest.fn(),
    findOne: jest.fn(),
    sequelize: {
      transaction: jest.fn(),
      col: jest.fn((name) => ({ col: name })),
      fn: jest.fn((name, ...args) => ({ fn: name, args })),
      where: jest.fn((attr, value) => ({ where: attr, value })),
    },
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
  getPagination: jest.fn(),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateProductListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));

jest.mock('../../../controllers/expenseController', () => ({
  generateExpenseNumber: jest.fn(),
}));

const { Op } = require('sequelize');
const { Product } = require('../../../models');
const productController = require('../../../controllers/productController');

describe('productController createProduct — same name already there', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };
  const request = (body) => ({
    tenantId: 'tenant-1',
    tenant: { businessType: 'shop', metadata: {} },
    user: { id: 'user-1', role: 'admin' },
    body,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Product.sequelize.transaction.mockResolvedValue(mockTransaction);
    Product.create.mockResolvedValue({ id: 'new-1', name: 'MacBook M4' });
    Product.findOne.mockResolvedValue(null);
  });

  it('returns 409 with the existing product when asked to check and the name is taken', async () => {
    Product.findOne.mockResolvedValue({ id: 'p-1', name: 'MacBook M4', quantityOnHand: 12, sellingPrice: 14500 });
    const res = mockRes();
    const next = jest.fn();

    await productController.createProduct(
      request({ name: '  macbook   m4 ', sellingPrice: 14500, checkDuplicateName: true }),
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(Product.create).not.toHaveBeenCalled();
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'DUPLICATE_PRODUCT_NAME',
      data: expect.objectContaining({ id: 'p-1', name: 'MacBook M4', quantityOnHand: 12 }),
    }));
    // Matched on the trimmed, lower-cased name with single spaces, among active products.
    const { where } = Product.findOne.mock.calls[0][0];
    expect(where).toEqual(expect.objectContaining({ tenantId: 'tenant-1', isActive: true }));
    expect(where[Op.and][0].value).toBe('macbook m4');
  });

  it('creates the product when asked to check and the name is new, without saving the flag', async () => {
    const res = mockRes();

    await productController.createProduct(
      request({ name: 'MacBook M5', sellingPrice: 16000, checkDuplicateName: true }),
      res,
      jest.fn(),
    );

    expect(Product.findOne).toHaveBeenCalled();
    expect(Product.create).toHaveBeenCalled();
    expect(Product.create.mock.calls[0][0]).not.toHaveProperty('checkDuplicateName');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('does not check when the flag is not sent (Quick Sale, older apps, "add anyway")', async () => {
    const res = mockRes();

    await productController.createProduct(
      request({ name: 'MacBook M4', sellingPrice: 14500, checkDuplicateName: false }),
      res,
      jest.fn(),
    );

    expect(Product.findOne).not.toHaveBeenCalled();
    expect(Product.create).toHaveBeenCalled();
    expect(Product.create.mock.calls[0][0]).not.toHaveProperty('checkDuplicateName');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
