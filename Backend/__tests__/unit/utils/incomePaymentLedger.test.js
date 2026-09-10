jest.mock('../../../models', () => ({
  Payment: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

const { Payment } = require('../../../models');
const {
  createSaleIncomePayment,
  createSaleIncomePaymentForSettlement,
  createInvoiceIncomePayment,
  mapToPaymentModelMethod,
} = require('../../../utils/incomePaymentLedger');

describe('incomePaymentLedger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps card to credit_card for Payment enum', () => {
    expect(mapToPaymentModelMethod('card')).toBe('credit_card');
    expect(mapToPaymentModelMethod('mobile_money')).toBe('mobile_money');
  });

  it('creates a sale payment capped at sale.total (change not counted)', async () => {
    Payment.findOne.mockResolvedValue(null);
    Payment.create.mockResolvedValue({ id: 'pay-1', amount: 100 });

    const sale = {
      id: 'sale-1',
      tenantId: 'tenant-1',
      total: 100,
      amountPaid: 120,
      customerId: 'cust-1',
      paymentMethod: 'cash',
    };

    const result = await createSaleIncomePayment(sale, { amount: 120 });
    expect(result.created).toBe(true);
    expect(Payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        description: 'sale:sale-1',
        type: 'income',
        status: 'completed',
      }),
      undefined
    );
  });

  it('settlement only books the unpaid delta', async () => {
    Payment.findOne.mockResolvedValue(null);
    Payment.create.mockResolvedValue({ id: 'pay-2', amount: 1200 });

    const sale = {
      id: 'sale-2',
      tenantId: 'tenant-1',
      total: 2000,
      amountPaid: 800,
      paymentMethod: 'cash',
    };

    const result = await createSaleIncomePaymentForSettlement(sale, {
      newAmountPaid: 2000,
      paymentDate: new Date('2026-09-15'),
    });

    expect(result.delta).toBe(1200);
    expect(Payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1200,
        description: 'sale:sale-2',
      }),
      undefined
    );
  });

  it('skips create when reference already exists (idempotent)', async () => {
    Payment.findOne.mockResolvedValue({ id: 'existing', amount: 50 });

    const result = await createInvoiceIncomePayment(
      { id: 'inv-1', tenantId: 'tenant-1', customerId: 'c1' },
      { amount: 50, referenceNumber: 'REF-1' }
    );

    expect(result.created).toBe(false);
    expect(Payment.create).not.toHaveBeenCalled();
  });
});
