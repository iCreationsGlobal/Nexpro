/**
 * @jest-environment node
 */

const mockTransaction = jest.fn(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));

jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: (...args) => mockTransaction(...args),
  },
}));

jest.mock('../../../models', () => ({
  PartnerCashoutRequest: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
  },
  PartnerCommission: {
    findAll: jest.fn(),
    update: jest.fn(),
  },
  PartnerReferral: {
    count: jest.fn(),
  },
  Partnership: {
    count: jest.fn(),
  },
  Marketer: {
    findByPk: jest.fn(),
  },
  Tenant: {},
  PartnerProgramSettings: {},
}));

jest.mock('../../../services/partnerProgramService', () => ({
  money: (n) => Math.round((Number(n) || 0) * 100) / 100,
}));

const {
  PartnerCashoutRequest,
  PartnerCommission,
  Marketer,
  PartnerReferral,
  Partnership,
} = require('../../../models');
const {
  createCashout,
  rejectCashout,
  markCashoutPaid,
  getMarketerDashboard,
} = require('../../../services/partnerCashoutService');

describe('partnerCashoutService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createCashout locks due commissions and server-computes amount', async () => {
    Marketer.findByPk.mockResolvedValue({
      id: 'm1',
      momoNumber: '0241234567',
      bankDetails: null,
    });
    PartnerCommission.findAll.mockResolvedValue([
      { id: 'c1', tenantId: 't1', amount: 10, marketerId: 'm1', status: 'due' },
      { id: 'c2', tenantId: 't1', amount: 5.5, marketerId: 'm1', status: 'due' },
    ]);
    PartnerCashoutRequest.create.mockResolvedValue({ id: 'cash1' });
    PartnerCommission.update.mockResolvedValue([2]);
    PartnerCashoutRequest.findByPk.mockResolvedValue({
      id: 'cash1',
      amount: 15.5,
      status: 'pending',
      marketerId: 'm1',
    });

    const result = await createCashout({
      marketerId: 'm1',
      commissionIds: ['c1', 'c2'],
    });

    expect(PartnerCashoutRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        marketerId: 'm1',
        amount: 15.5,
        status: 'pending',
      }),
      expect.any(Object)
    );
    expect(PartnerCommission.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ remittanceStatus: 'collected' }),
      })
    );
    expect(PartnerCommission.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cashout_pending', cashoutRequestId: 'cash1' }),
      expect.any(Object)
    );
    expect(result.id).toBe('cash1');
  });

  test('rejectCashout releases commissions back to due', async () => {
    const cashout = {
      id: 'cash1',
      tenantId: 't1',
      status: 'pending',
      notes: null,
      update: jest.fn().mockResolvedValue(undefined),
    };
    PartnerCashoutRequest.findOne.mockResolvedValue(cashout);
    PartnerCommission.update.mockResolvedValue([2]);
    PartnerCashoutRequest.findByPk.mockResolvedValue({ id: 'cash1', status: 'rejected' });

    const result = await rejectCashout({
      tenantId: 't1',
      cashoutId: 'cash1',
      processedByUserId: 'u1',
      notes: 'Wrong amount',
    });

    expect(PartnerCommission.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'due', cashoutRequestId: null }),
      expect.any(Object)
    );
    expect(cashout.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' }),
      expect.any(Object)
    );
    expect(result.status).toBe('rejected');
  });

  test('markCashoutPaid is idempotent when already paid', async () => {
    PartnerCashoutRequest.findOne.mockResolvedValue({
      id: 'cash1',
      tenantId: 't1',
      status: 'paid',
    });
    PartnerCashoutRequest.findByPk.mockResolvedValue({ id: 'cash1', status: 'paid' });

    const result = await markCashoutPaid({
      tenantId: 't1',
      cashoutId: 'cash1',
    });

    expect(PartnerCommission.update).not.toHaveBeenCalled();
    expect(result.status).toBe('paid');
  });

  test('getMarketerDashboard aggregates balances', async () => {
    PartnerCommission.findAll
      .mockResolvedValueOnce([{ amount: 10 }, { amount: 5 }])
      .mockResolvedValueOnce([{ amount: 3 }])
      .mockResolvedValueOnce([{ amount: 20 }])
      .mockResolvedValueOnce([]);
    PartnerCashoutRequest.count.mockResolvedValue(1);
    Partnership.count.mockResolvedValue(2);
    PartnerReferral.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);

    const dash = await getMarketerDashboard('m1');
    expect(dash.availableBalance).toBe(15);
    expect(dash.pendingCashoutAmount).toBe(3);
    expect(dash.pendingRemittanceAmount).toBe(0);
    expect(dash.totalEarned).toBe(38);
    expect(dash.referrals).toEqual({
      total: 3,
      pending: 1,
      matched: 2,
      conflict: 0,
    });
  });
});
