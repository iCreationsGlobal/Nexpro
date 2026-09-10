jest.mock('../../../models', () => {
  const findByPk = jest.fn();
  return {
    Tenant: {
      findByPk,
      scope: jest.fn(() => ({ findByPk }))
    }
  };
});

jest.mock('../../../services/paystackService', () => ({
  createTransferRecipient: jest.fn(),
  initiateTransfer: jest.fn(),
  getMoMoBankCode: jest.fn()
}));

jest.mock('../../../utils/incomePaymentLedger', () => ({
  createSaleIncomePaymentForSettlement: jest.fn().mockResolvedValue({ created: true, delta: 96 }),
}));

const { Tenant } = require('../../../models');
const { applyPaystackChargeToSaleFromTx } = require('../../../services/paystackSalePayment');
const { createSaleIncomePaymentForSettlement } = require('../../../utils/incomePaymentLedger');

describe('paystackSalePayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Tenant.findByPk.mockResolvedValue({ metadata: {} });
    Tenant.scope.mockImplementation(() => ({ findByPk: Tenant.findByPk }));
  });

  it('applies a successful direct checkout charge and marks sale completed', async () => {
    const sale = {
      id: 'sale-1',
      tenantId: 'tenant-1',
      saleNumber: 'S-100',
      total: 96,
      amountPaid: 0,
      status: 'pending',
      paymentMethod: 'cash',
      metadata: { paystackCheckout: { reference: 'SALE-sale-1-123' } },
      update: jest.fn().mockResolvedValue(undefined)
    };

    const tx = {
      status: 'success',
      amount: 9600,
      channel: 'card',
      metadata: { sale_id: 'sale-1', tenant_id: 'tenant-1', payment_source: 'sale_direct_checkout' }
    };

    const outcome = await applyPaystackChargeToSaleFromTx(sale, 'SALE-sale-1-123', tx);
    expect(outcome.applied).toBe(true);
    expect(outcome.nextStatus).toBe('completed');
    expect(createSaleIncomePaymentForSettlement).toHaveBeenCalledWith(
      sale,
      expect.objectContaining({
        newAmountPaid: 96,
        referenceNumber: 'SALE-sale-1-123',
      })
    );
    expect(sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        amountPaid: 96,
        paymentMethod: 'card'
      })
    );
  });

  it('skips duplicate application for the same Paystack reference', async () => {
    const sale = {
      id: 'sale-2',
      tenantId: 'tenant-1',
      total: 96,
      amountPaid: 96,
      status: 'completed',
      metadata: { paystackRef: 'SALE-sale-2-456' },
      update: jest.fn()
    };

    const outcome = await applyPaystackChargeToSaleFromTx(sale, 'SALE-sale-2-456', {
      status: 'success',
      amount: 9600,
      metadata: { sale_id: 'sale-2', tenant_id: 'tenant-1' }
    });

    expect(outcome.duplicate).toBe(true);
    expect(outcome.applied).toBe(false);
    expect(sale.update).not.toHaveBeenCalled();
  });
});
