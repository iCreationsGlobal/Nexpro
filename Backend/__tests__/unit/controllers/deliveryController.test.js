const { Op } = require('sequelize');

jest.mock('../../../config/database', () => ({
  sequelize: {
    where: jest.fn((left, right) => ({ type: 'where', left, right })),
    literal: jest.fn((sql) => ({ type: 'literal', sql })),
    transaction: jest.fn(),
  },
  testConnection: jest.fn(),
}));

jest.mock('../../../models', () => ({
  Job: { findAll: jest.fn(), findOne: jest.fn() },
  Sale: { findAll: jest.fn(), findOne: jest.fn() },
  Rental: { findAll: jest.fn(), findOne: jest.fn(), update: jest.fn() },
  Customer: {},
  SaleActivity: { create: jest.fn() },
  User: {},
  UserTenant: { findOne: jest.fn() },
  MarketplaceOrderPayment: { findOne: jest.fn() },
}));

jest.mock('../../../utils/tenantUtils', () => ({
  applyTenantFilter: jest.fn((tenantId, where = {}) => ({ ...where, tenantId })),
}));

jest.mock('../../../utils/shopUtils', () => ({
  applyShopFilter: jest.fn((_req, where = {}) => where),
  applyShopReadFilter: jest.fn((_req, where = {}) => ({ ...where, shopReadApplied: true })),
}));

jest.mock('../../../utils/studioLocationUtils', () => ({
  applyStudioLocationFilter: jest.fn((_req, where = {}) => where),
}));

jest.mock('../../../utils/deliveryStatus', () => ({
  parseDeliveryStatusInput: jest.fn((value) => {
    if (value === null || ['ready_for_delivery', 'out_for_delivery', 'delivered', 'returned'].includes(value)) {
      return value;
    }
    return undefined;
  }),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateSaleListCache: jest.fn(),
}));

jest.mock('../../../middleware/auth', () => ({
  getEffectiveRole: jest.fn((req) => req.tenantRole || req.user?.role || 'admin'),
}));

jest.mock('../../../services/tradeAssuranceService', () => ({
  markDeliveryReleaseWindowForSale: jest.fn(),
}));

const { sequelize } = require('../../../config/database');
const { Job, Sale, Rental, SaleActivity, MarketplaceOrderPayment } = require('../../../models');
const { applyShopReadFilter } = require('../../../utils/shopUtils');
const { invalidateSaleListCache } = require('../../../middleware/cache');
const deliveryController = require('../../../controllers/deliveryController');

describe('deliveryController', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const baseReq = (overrides = {}) => ({
    tenantId: 'tenant-1',
    tenantRole: 'admin',
    user: { id: 'user-1', role: 'admin' },
    query: {},
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Job.findAll.mockResolvedValue([]);
    Sale.findAll.mockResolvedValue([]);
    Rental.findAll.mockResolvedValue([]);
    Rental.findOne.mockResolvedValue(null);
    Rental.update.mockResolvedValue([1]);
    SaleActivity.create.mockResolvedValue({ id: 'activity-1' });
    MarketplaceOrderPayment.findOne.mockResolvedValue(null);
  });

  it('queries paid online delivery orders alongside regular completed sales', async () => {
    const req = baseReq({ shopScoped: true, shopFilterId: 'shop-1' });
    const res = mockRes();
    const next = jest.fn();

    await deliveryController.getDeliveryQueue(req, res, next);

    expect(applyShopReadFilter).toHaveBeenCalled();
    const saleQuery = Sale.findAll.mock.calls[0][0];
    expect(saleQuery.include).toEqual(expect.arrayContaining([
      expect.objectContaining({ as: 'customer' }),
      expect.objectContaining({ as: 'marketplacePayment', required: false }),
    ]));

    const eligibility = saleQuery.where[Op.and][0];
    const [regularSaleBranch, onlineOrderBranch] = eligibility[Op.or];
    expect(regularSaleBranch[Op.and]).toEqual(expect.arrayContaining([
      { status: 'completed' },
      expect.objectContaining({ type: 'literal', sql: expect.stringContaining("<> 'online_store'") }),
    ]));

    const onlineEligibility = onlineOrderBranch[Op.and][0];
    expect(onlineEligibility[Op.and]).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'where' }),
      { deliveryRequired: true },
      expect.objectContaining({
        [Op.or]: expect.arrayContaining([
          { status: 'completed' },
          { '$marketplacePayment.status$': { [Op.in]: ['paid_held', 'released', 'disputed'] } },
        ]),
      }),
    ]));
    expect(sequelize.literal).toHaveBeenCalledWith('"Sale"."metadata"->>\'source\'');
    expect(next).not.toHaveBeenCalled();
  });

  it('formats storefront delivery rows with delivery address details', async () => {
    Job.findAll.mockResolvedValue([]);
    Sale.findAll.mockResolvedValue([{
      id: 'sale-1',
      saleNumber: 'SALE-1',
      status: 'completed',
      total: '120.50',
      updatedAt: '2026-06-10T10:00:00.000Z',
      deliveryStatus: null,
      customer: { name: 'Tenant Customer', phone: '0240000000' },
      metadata: {
        source: 'online_store',
        fulfillmentMethod: 'delivery',
        deliveryAddress: {
          recipientName: 'Ama Shopper',
          phone: '0551112222',
          line1: '12 Ring Road',
          city: 'Accra',
          region: 'Greater Accra',
        },
      },
    }]);

    const res = mockRes();
    await deliveryController.getDeliveryQueue(baseReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        rows: [expect.objectContaining({
          entityType: 'sale',
          reference: 'SALE-1',
          title: 'Online delivery order',
          customerName: 'Ama Shopper',
          customerPhone: '0551112222',
          addressSummary: '12 Ring Road, Accra, Greater Accra',
          total: 120.5,
        })],
      }),
    }));
  });

  it('allows paid held online delivery orders to receive delivery status updates', async () => {
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      finished: false,
    };
    sequelize.transaction.mockResolvedValue(transaction);

    const sale = {
      id: 'sale-1',
      status: 'pending',
      deliveryRequired: true,
      deliveryStatus: null,
      deliveryAssignedTo: null,
      metadata: { source: 'online_store', tradeAssurance: { paymentStatus: 'paid_held' } },
      update: jest.fn().mockResolvedValue(undefined),
    };
    Sale.findOne.mockResolvedValue(sale);
    MarketplaceOrderPayment.findOne.mockResolvedValue({ id: 'payment-1', status: 'paid_held' });

    const req = baseReq({
      body: {
        updates: [{ entityType: 'sale', id: 'sale-1', deliveryStatus: 'ready_for_delivery' }],
      },
    });
    const res = mockRes();
    const next = jest.fn();

    await deliveryController.patchDeliveryStatuses(req, res, next);

    expect(sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryStatus: 'ready_for_delivery',
        metadata: expect.objectContaining({
          deliveryTracking: expect.objectContaining({ status: 'ready_for_delivery' }),
        }),
      }),
      { transaction }
    );
    expect(transaction.commit).toHaveBeenCalled();
    expect(invalidateSaleListCache).toHaveBeenCalledWith('tenant-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects delivery status changes after customer confirms delivered online order', async () => {
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      finished: false,
    };
    sequelize.transaction.mockResolvedValue(transaction);

    const sale = {
      id: 'sale-1',
      status: 'completed',
      orderStatus: 'completed',
      deliveryRequired: true,
      deliveryStatus: 'delivered',
      deliveryAssignedTo: null,
      metadata: {
        source: 'online_store',
        confirmedReceivedAt: '2026-06-10T13:30:00.000Z',
        tradeAssurance: { paymentStatus: 'paid_held' },
      },
      update: jest.fn().mockResolvedValue(undefined),
    };
    Sale.findOne.mockResolvedValue(sale);
    MarketplaceOrderPayment.findOne.mockResolvedValue({ id: 'payment-1', status: 'paid_held' });

    const req = baseReq({
      body: {
        updates: [{ entityType: 'sale', id: 'sale-1', deliveryStatus: 'out_for_delivery' }],
      },
    });
    const res = mockRes();
    const next = jest.fn();

    await deliveryController.patchDeliveryStatuses(req, res, next);

    expect(sale.update).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(207);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      data: expect.objectContaining({
        results: [expect.objectContaining({
          ok: false,
          errorCode: 'ORDER_DELIVERY_CONFIRMED_LOCKED',
          message: expect.stringContaining('confirmed by the customer'),
        })],
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects online pickup orders in delivery status updates', async () => {
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      finished: false,
    };
    sequelize.transaction.mockResolvedValue(transaction);
    Sale.findOne.mockResolvedValue({
      id: 'sale-1',
      status: 'completed',
      deliveryRequired: false,
      metadata: { source: 'online_store' },
    });
    MarketplaceOrderPayment.findOne.mockResolvedValue({ id: 'payment-1', status: 'paid_held' });

    const res = mockRes();
    await deliveryController.patchDeliveryStatuses(
      baseReq({ body: { updates: [{ entityType: 'sale', id: 'sale-1', deliveryStatus: 'ready_for_delivery' }] } }),
      res,
      jest.fn()
    );

    expect(transaction.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(207);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      data: expect.objectContaining({
        results: [expect.objectContaining({
          ok: false,
          message: 'Only paid online delivery orders can use delivery status here',
        })],
      }),
    }));
  });

  it('includes scheduled rental deliveries in the active queue', async () => {
    Rental.findAll.mockResolvedValue([{
      id: 'rental-1',
      status: 'confirmed',
      amount: 250,
      updatedAt: '2026-08-29T10:00:00.000Z',
      customer: {
        name: 'Rental Customer',
        phone: '0240000001',
        metadata: {
          rental: {
            delivery: {
              address: '10 Fleet St',
              city: 'Accra',
              state: 'Greater Accra',
            },
          },
        },
      },
      metadata: {
        deliveries: {
          pickup: {
            type: 'rental_pickup',
            rentalId: 'rental-1',
            scheduled: true,
            scheduledAt: '2026-08-29T09:00:00.000Z',
            deliveryStatus: 'ready_for_delivery',
            address: { line1: '10 Fleet St', city: 'Accra', state: 'Greater Accra' },
          },
        },
      },
    }]);

    const res = mockRes();
    await deliveryController.getDeliveryQueue(baseReq(), res, jest.fn());

    expect(Rental.findAll).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        rows: [expect.objectContaining({
          entityType: 'rental',
          deliveryLeg: 'pickup',
          deliveryType: 'rental_pickup',
          customerName: 'Rental Customer',
          addressSummary: '10 Fleet St, Accra, Greater Accra',
        })],
      }),
    }));
  });

  it('updates rental delivery leg status in metadata', async () => {
    const rental = {
      id: 'rental-1',
      metadata: {
        deliveries: {
          pickup: {
            type: 'rental_pickup',
            rentalId: 'rental-1',
            scheduled: true,
            deliveryStatus: 'ready_for_delivery',
            address: { line1: '10 Fleet St', city: 'Accra' },
          },
        },
      },
      update: jest.fn().mockResolvedValue(undefined),
    };
    Rental.findOne.mockResolvedValue(rental);

    const res = mockRes();
    await deliveryController.patchDeliveryStatuses(
      baseReq({
        body: {
          updates: [{
            entityType: 'rental',
            id: 'rental-1',
            deliveryLeg: 'pickup',
            deliveryStatus: 'out_for_delivery',
          }],
        },
      }),
      res,
      jest.fn()
    );

    expect(rental.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        deliveries: expect.objectContaining({
          pickup: expect.objectContaining({
            deliveryStatus: 'out_for_delivery',
          }),
        }),
      }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
