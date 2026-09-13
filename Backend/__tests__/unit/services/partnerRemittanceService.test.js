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
  PartnerRemittance: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
  },
  PartnerCommission: {
    findAll: jest.fn(),
    update: jest.fn(),
  },
  Tenant: {},
}));

jest.mock('../../../services/partnerProgramService', () => ({
  money: (n) => Math.round((Number(n) || 0) * 100) / 100,
}));

const { PartnerRemittance, PartnerCommission } = require('../../../models');
const { createRemittance } = require('../../../services/partnerRemittanceService');

describe('partnerRemittanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createRemittance collects owed commissions and splits platform vs marketer share', async () => {
    PartnerCommission.findAll.mockResolvedValue([
      { id: 'c1', amount: 100, platformFeeAmount: 20, marketerShareAmount: 80 },
      { id: 'c2', amount: 50, platformFeeAmount: 10, marketerShareAmount: 40 },
    ]);
    PartnerRemittance.create.mockResolvedValue({ id: 'r1' });
    PartnerCommission.update.mockResolvedValue([2]);
    PartnerRemittance.findByPk.mockResolvedValue({
      id: 'r1',
      amount: 150,
      platformFeeAmount: 30,
      marketerShareAmount: 120,
      status: 'paid',
    });

    const result = await createRemittance({
      tenantId: 't1',
      commissionIds: ['c1', 'c2'],
      paidByUserId: 'u1',
    });

    expect(PartnerRemittance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        amount: 150,
        platformFeeAmount: 30,
        marketerShareAmount: 120,
        status: 'paid',
      }),
      expect.any(Object)
    );
    expect(PartnerCommission.update).toHaveBeenCalledWith(
      expect.objectContaining({ remittanceStatus: 'collected', remittanceId: 'r1' }),
      expect.any(Object)
    );
    expect(result.amount).toBe(150);
  });
});
