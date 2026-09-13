/**
 * @jest-environment node
 */

jest.mock('../../../models', () => ({
  PartnerCommission: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Partnership: {
    findOne: jest.fn(),
  },
  Customer: { findOne: jest.fn() },
  Sale: { findOne: jest.fn() },
  Invoice: { findOne: jest.fn() },
  Job: { findOne: jest.fn() },
}));

jest.mock('../../../services/sabitoAppPlatformService', () => ({
  getPlatformFeePercent: jest.fn(),
}));

const {
  PartnerCommission,
  Partnership,
  Customer,
  Sale,
} = require('../../../models');
const {
  maybeCreateCommissionForPayment,
  resolveRate,
} = require('../../../services/partnerCommissionService');
const sabitoAppPlatformService = require('../../../services/sabitoAppPlatformService');

describe('partnerCommissionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sabitoAppPlatformService.getPlatformFeePercent.mockResolvedValue(20);
  });

  test('resolveRate returns first when no prior commission', async () => {
    PartnerCommission.findOne.mockResolvedValue(null);
    const partnership = {
      id: 'p1',
      firstClientRatePercent: 10,
      returningClientRatePercent: 5,
      attributionMonths: 12,
    };
    const result = await resolveRate(partnership, 'c1');
    expect(result).toEqual({ rateType: 'first', ratePercent: 10 });
  });

  test('resolveRate returns returning within attribution window', async () => {
    PartnerCommission.findOne.mockResolvedValue({
      createdAt: new Date(),
    });
    const partnership = {
      id: 'p1',
      firstClientRatePercent: 10,
      returningClientRatePercent: 5,
      attributionMonths: 12,
    };
    const result = await resolveRate(partnership, 'c1');
    expect(result).toEqual({ rateType: 'returning', ratePercent: 5 });
  });

  test('maybeCreateCommissionForPayment creates due commission from sale attribution', async () => {
    PartnerCommission.findOne.mockResolvedValueOnce(null); // by paymentId
    Sale.findOne.mockResolvedValue({
      id: 'sale1',
      partnershipId: 'part1',
      partnerMarketerId: 'm1',
      customerId: 'c1',
      invoiceId: null,
    });
    Partnership.findOne.mockResolvedValue({
      id: 'part1',
      marketerId: 'm1',
      tenantId: 't1',
      status: 'active',
      firstClientRatePercent: 10,
      returningClientRatePercent: 5,
      attributionMonths: 12,
    });
    PartnerCommission.findOne.mockResolvedValueOnce(null); // prior for rate
    PartnerCommission.create.mockResolvedValue({
      id: 'comm1',
      amount: 10,
      rateType: 'first',
    });

    const result = await maybeCreateCommissionForPayment({
      tenantId: 't1',
      paymentAmount: 100,
      paymentId: 'pay1',
      saleId: 'sale1',
    });

    expect(PartnerCommission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        partnershipId: 'part1',
        marketerId: 'm1',
        paymentId: 'pay1',
        rateType: 'first',
        ratePercent: 10,
        paymentAmount: 100,
        amount: 10,
        platformFeePercent: 20,
        platformFeeAmount: 2,
        marketerShareAmount: 8,
        remittanceStatus: 'owed',
        status: 'due',
      })
    );
    expect(result.amount).toBe(10);
  });

  test('maybeCreateCommissionForPayment no-ops without attribution', async () => {
    PartnerCommission.findOne.mockResolvedValue(null);
    Sale.findOne.mockResolvedValue({
      id: 'sale1',
      partnershipId: null,
      partnerMarketerId: null,
      customerId: 'c1',
    });
    Customer.findOne.mockResolvedValue({
      id: 'c1',
      partnershipId: null,
      partnerMarketerId: null,
    });

    const result = await maybeCreateCommissionForPayment({
      tenantId: 't1',
      paymentAmount: 50,
      saleId: 'sale1',
      customerId: 'c1',
    });
    expect(result).toBeNull();
    expect(PartnerCommission.create).not.toHaveBeenCalled();
  });
});
