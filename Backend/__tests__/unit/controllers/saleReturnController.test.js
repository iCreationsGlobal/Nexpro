jest.mock('../../../config/database', () => ({
  sequelize: {
    col: jest.fn((name) => ({ col: name })),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    literal: jest.fn((value) => ({ literal: value })),
    query: jest.fn(),
    transaction: jest.fn(),
    where: jest.fn((left, right) => ({ where: [left, right] })),
  },
}));

jest.mock('../../../models', () => ({
  Sale: {
    findOne: jest.fn(),
  },
  SaleItem: {},
  SaleReturn: {
    findOne: jest.fn(),
    create: jest.fn(),
    findAndCountAll: jest.fn(),
  },
  SaleReturnItem: {
    findAll: jest.fn(),
    bulkCreate: jest.fn(),
  },
  SaleReturnExchangeItem: {
    bulkCreate: jest.fn(),
  },
  SaleActivity: {
    create: jest.fn(),
  },
  Product: {
    findByPk: jest.fn(),
  },
  ProductVariant: {
    findByPk: jest.fn(),
  },
  ProductShopStock: {
    findOne: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn(),
  },
  Customer: {},
  Shop: {},
  User: {},
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateSaleListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));

jest.mock('../../../utils/shopUtils', () => ({
  applyShopFilter: jest.fn((req, where) => where),
  attachShopToPayload: jest.fn((req, body) => body),
  assertShopRecordAccess: jest.fn(),
}));

jest.mock('../../../utils/productStockUtils', () => ({
  applyStockChange: jest.fn().mockResolvedValue({
    skipped: false,
    previousQuantity: 10,
    newQuantity: 11,
    quantityDelta: 1,
  }),
  getShopStockQuantity: jest.fn().mockResolvedValue(10),
}));

jest.mock('../../../middleware/auth', () => ({
  getEffectiveRole: jest.fn(() => 'manager'),
}));

jest.mock('../../../config/config', () => ({
  nodeEnv: 'test',
  pagination: { defaultPageSize: 10, maxPageSize: 100 },
}));

const { sequelize } = require('../../../config/database');
const {
  Sale,
  SaleReturn,
  SaleReturnItem,
  SaleReturnExchangeItem,
  SaleActivity,
  Product,
  ProductVariant,
} = require('../../../models');
const { assertShopRecordAccess } = require('../../../utils/shopUtils');
const { applyStockChange, getShopStockQuantity } = require('../../../utils/productStockUtils');
const saleReturnController = require('../../../controllers/saleReturnController');

describe('saleReturnController', () => {
  let transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    assertShopRecordAccess.mockImplementation(() => undefined);
    transaction = {
      commit: jest.fn(),
      rollback: jest.fn(),
      LOCK: { UPDATE: 'UPDATE' },
    };
    sequelize.transaction.mockResolvedValue(transaction);
  });

  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  const buildSale = (overrides = {}) => {
    const items = overrides.items || [
      {
        id: 'item-1',
        productId: 'prod-1',
        productVariantId: null,
        name: 'Widget',
        sku: 'W1',
        quantity: 4,
        unitPrice: 10,
        total: 40,
      },
      {
        id: 'item-2',
        productId: 'prod-2',
        productVariantId: null,
        name: 'Gadget',
        sku: 'G1',
        quantity: 2,
        unitPrice: 20,
        total: 40,
      },
    ];
    return {
      id: 'sale-1',
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      saleNumber: 'SALE-0001',
      status: 'completed',
      deletedAt: null,
      total: 80,
      paymentMethod: 'cash',
      metadata: {},
      items,
      update: jest.fn().mockResolvedValue(undefined),
      ...overrides,
      items: overrides.items || items,
    };
  };

  describe('getSaleReturnable', () => {
    it('blocks soft-deleted sales as ineligible', async () => {
      const sale = buildSale({ deletedAt: new Date().toISOString() });
      Sale.findOne.mockResolvedValue(sale);
      SaleReturnItem.findAll.mockResolvedValue([]);

      const req = { params: { id: 'sale-1' }, tenantId: 'tenant-1', user: { id: 'u1' } };
      const res = buildRes();
      await saleReturnController.getSaleReturnable(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.data.eligibility.eligible).toBe(false);
      expect(payload.data.eligibility.code).toBe('SALE_SOFT_DELETED');
    });

    it('reports remaining returnable qty after prior returns', async () => {
      const sale = buildSale();
      Sale.findOne.mockResolvedValue(sale);
      SaleReturnItem.findAll.mockResolvedValue([
        { saleItemId: 'item-1', qtyReturned: '2' },
      ]);

      const req = { params: { id: 'sale-1' }, tenantId: 'tenant-1', user: { id: 'u1' } };
      const res = buildRes();
      await saleReturnController.getSaleReturnable(req, res, jest.fn());

      const lines = res.json.mock.calls[0][0].data.lines;
      expect(lines.find((l) => l.saleItemId === 'item-1').returnableQty).toBe(2);
      expect(lines.find((l) => l.saleItemId === 'item-2').returnableQty).toBe(2);
      expect(res.json.mock.calls[0][0].data.eligibility.eligible).toBe(true);
    });
  });

  describe('createSaleReturn', () => {
    const setupHappyPathStock = () => {
      Product.findByPk.mockImplementation(async (id) => ({
        id,
        tenantId: 'tenant-1',
        name: id === 'prod-1' ? 'Widget' : 'Exchange Product',
        sku: 'SKU',
        trackStock: true,
        quantityOnHand: 100,
        update: jest.fn().mockResolvedValue(undefined),
      }));
      SaleReturn.findOne
        .mockResolvedValueOnce({ returnNumber: null }) // generateReturnNumber last
        .mockResolvedValueOnce({
          id: 'ret-1',
          returnNumber: 'RET-20260715-0001',
          items: [],
          exchangeItems: [],
          originalSale: { id: 'sale-1', saleNumber: 'SALE-0001', status: 'completed' },
        });
      SaleReturn.create.mockResolvedValue({
        id: 'ret-1',
        returnNumber: 'RET-20260715-0001',
      });
      SaleReturnItem.bulkCreate.mockResolvedValue([]);
      SaleReturnExchangeItem.bulkCreate.mockResolvedValue([]);
      SaleActivity.create.mockResolvedValue({});
    };

    it('rejects over-return quantities', async () => {
      const sale = buildSale();
      Sale.findOne.mockResolvedValue(sale);
      SaleReturnItem.findAll.mockResolvedValue([
        { saleItemId: 'item-1', qtyReturned: '3' },
      ]);

      const req = {
        params: { id: 'sale-1' },
        tenantId: 'tenant-1',
        user: { id: 'mgr-1' },
        body: {
          type: 'refund',
          items: [{ saleItemId: 'item-1', qtyReturned: 2, disposition: 'restock' }],
          refundMethod: 'cash',
        },
      };
      const res = buildRes();
      await saleReturnController.createSaleReturn(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].errorCode).toBe('OVER_RETURN');
      expect(transaction.rollback).toHaveBeenCalled();
      expect(transaction.commit).not.toHaveBeenCalled();
    });

    it('records partial refund and restocks stock', async () => {
      const sale = buildSale();
      Sale.findOne.mockResolvedValue(sale);
      SaleReturnItem.findAll.mockResolvedValue([]);
      SaleReturn.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'ret-1', returnNumber: 'RET-20260715-0001', items: [], exchangeItems: [] });
      SaleReturn.create.mockResolvedValue({ id: 'ret-1', returnNumber: 'RET-20260715-0001' });
      SaleReturnItem.bulkCreate.mockResolvedValue([]);
      SaleActivity.create.mockResolvedValue({});

      const req = {
        params: { id: 'sale-1' },
        tenantId: 'tenant-1',
        user: { id: 'mgr-1' },
        body: {
          type: 'refund',
          items: [{ saleItemId: 'item-1', qtyReturned: 1, disposition: 'restock', reasonCode: 'customer_changed_mind' }],
          refundMethod: 'cash',
          reasonSummary: 'Changed mind',
        },
      };
      const res = buildRes();
      await saleReturnController.createSaleReturn(req, res, jest.fn());

      expect(applyStockChange).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          shopId: 'shop-1',
          delta: 1,
          type: 'return',
        })
      );
      expect(sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            returnSummary: expect.objectContaining({
              totalReturnedQty: 1,
              fullyReturned: false,
            }),
          }),
        }),
        expect.anything()
      );
      expect(sale.update.mock.calls[0][0].status).toBeUndefined();
      expect(SaleActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'refund' }),
        expect.anything()
      );
      expect(transaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('write_off disposition does not restock', async () => {
      const sale = buildSale();
      Sale.findOne.mockResolvedValue(sale);
      SaleReturnItem.findAll.mockResolvedValue([]);
      SaleReturn.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'ret-1', returnNumber: 'RET-20260715-0001', items: [], exchangeItems: [] });
      SaleReturn.create.mockResolvedValue({ id: 'ret-1', returnNumber: 'RET-20260715-0001' });
      SaleReturnItem.bulkCreate.mockResolvedValue([]);
      SaleActivity.create.mockResolvedValue({});

      const req = {
        params: { id: 'sale-1' },
        tenantId: 'tenant-1',
        user: { id: 'mgr-1' },
        body: {
          type: 'refund',
          items: [{ saleItemId: 'item-1', qtyReturned: 1, disposition: 'write_off', reasonCode: 'damaged' }],
          refundMethod: 'cash',
        },
      };
      const res = buildRes();
      await saleReturnController.createSaleReturn(req, res, jest.fn());

      expect(applyStockChange).not.toHaveBeenCalled();
      expect(transaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rejects soft-deleted sales on create', async () => {
      Sale.findOne.mockResolvedValue(buildSale({ deletedAt: new Date().toISOString() }));

      const req = {
        params: { id: 'sale-1' },
        tenantId: 'tenant-1',
        user: { id: 'mgr-1' },
        body: {
          type: 'refund',
          items: [{ saleItemId: 'item-1', qtyReturned: 1, disposition: 'restock' }],
        },
      };
      const res = buildRes();
      await saleReturnController.createSaleReturn(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].errorCode).toBe('SALE_SOFT_DELETED');
      expect(transaction.rollback).toHaveBeenCalled();
    });

    it('exchange decrements outgoing stock and rejects insufficient stock', async () => {
      const sale = buildSale();
      Sale.findOne.mockResolvedValue(sale);
      SaleReturnItem.findAll.mockResolvedValue([]);
      Product.findByPk.mockImplementation(async (id) => ({
        id,
        tenantId: 'tenant-1',
        name: id === 'prod-x' ? 'Exchange SKU' : 'Widget',
        sku: 'SKU',
        trackStock: true,
        quantityOnHand: id === 'prod-x' ? 1 : 10,
        update: jest.fn(),
      }));
      getShopStockQuantity.mockImplementation(async ({ productId }) => (
        productId === 'prod-x' ? 1 : 10
      ));

      const req = {
        params: { id: 'sale-1' },
        tenantId: 'tenant-1',
        user: { id: 'mgr-1' },
        body: {
          type: 'exchange',
          items: [{ saleItemId: 'item-1', qtyReturned: 1, disposition: 'restock' }],
          exchangeItems: [{ productId: 'prod-x', quantity: 5, unitPrice: 15 }],
        },
      };
      const res = buildRes();
      await saleReturnController.createSaleReturn(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].errorCode).toBe('EXCHANGE_INSUFFICIENT_STOCK');
      expect(transaction.rollback).toHaveBeenCalled();
    });

    it('sets sale status to refunded when fully returned', async () => {
      setupHappyPathStock();
      const sale = buildSale({
        items: [{
          id: 'item-1',
          productId: 'prod-1',
          productVariantId: null,
          name: 'Widget',
          sku: 'W1',
          quantity: 1,
          unitPrice: 10,
          total: 10,
        }],
      });
      Sale.findOne.mockResolvedValue(sale);
      SaleReturnItem.findAll.mockResolvedValue([]);

      const req = {
        params: { id: 'sale-1' },
        tenantId: 'tenant-1',
        user: { id: 'mgr-1' },
        body: {
          type: 'refund',
          items: [{ saleItemId: 'item-1', qtyReturned: 1, disposition: 'restock' }],
          refundMethod: 'mobile_money',
        },
      };
      const res = buildRes();
      await saleReturnController.createSaleReturn(req, res, jest.fn());

      expect(sale.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'refunded' }),
        expect.anything()
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
