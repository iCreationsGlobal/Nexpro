jest.mock('../../../models', () => {
  const findByPk = jest.fn();
  return {
    Sale: { findOne: jest.fn(), sequelize: { transaction: jest.fn(async fn => fn({ LOCK: { UPDATE: 'UPDATE' } })) } },
    Payment: { findOne: jest.fn().mockResolvedValue(null) },
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

jest.mock('../../../services/partnerPaymentService', () => ({ recordSalePayment: jest.fn() }));
const { Tenant, Sale, Payment } = require('../../../models');
const { recordSalePayment } = require('../../../services/partnerPaymentService');
const { applyPaystackChargeToSaleFromTx } = require('../../../services/paystackSalePayment');

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

    Sale.findOne.mockResolvedValue(sale);
    const outcome = await applyPaystackChargeToSaleFromTx(sale, 'SALE-sale-1-123', tx);
    expect(outcome.applied).toBe(true);
    expect(recordSalePayment).toHaveBeenCalledWith(sale, 96, expect.objectContaining({ transaction: expect.any(Object), reference: 'SALE-sale-1-123' }));
    expect(outcome.nextStatus).toBe('completed');
    expect(sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        amountPaid: 96,
        paymentMethod: 'card'
      }), expect.objectContaining({ transaction: expect.any(Object) })
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

    Sale.findOne.mockResolvedValue(sale);
    const outcome = await applyPaystackChargeToSaleFromTx(sale, 'SALE-sale-2-456', {
      status: 'success',
      amount: 9600,
      metadata: { sale_id: 'sale-2', tenant_id: 'tenant-1' }
    });

    expect(outcome.duplicate).toBe(true);
    expect(outcome.applied).toBe(false);
    expect(sale.update).not.toHaveBeenCalled();
  });
  it('rejects an older reference already recorded as a payment', async () => {
    const sale = { id: 'sale-3', tenantId: 'tenant-1', total: 100, amountPaid: 20, metadata: {}, update: jest.fn() };
    Sale.findOne.mockResolvedValue(sale);
    Payment.findOne.mockResolvedValueOnce({ id: 'existing' });
    const result = await applyPaystackChargeToSaleFromTx(sale, 'old-reference', { status: 'success', amount: 2000 });
    expect(result.duplicate).toBe(true);
    expect(sale.update).not.toHaveBeenCalled();
    expect(recordSalePayment).not.toHaveBeenCalled();
  });

});
