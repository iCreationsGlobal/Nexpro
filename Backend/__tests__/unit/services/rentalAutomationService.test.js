jest.mock('../../../models', () => ({
  Rental: { findByPk: jest.fn() },
  RentalItem: {},
  Product: {},
  Customer: {},
  LateCharge: {},
  DamageReport: {},
}));

jest.mock('../../../services/rentalInvoiceService', () => ({
  generateRentalInvoice: jest.fn(),
  syncRentalInvoice: jest.fn(),
  computeRentalTotalDue: jest.fn(() => 100),
}));

jest.mock('../../../services/rentalInvoicePaymentService', () => ({
  cancelUnpaidRentalInvoice: jest.fn(),
}));

jest.mock('../../../services/customerBalanceService', () => ({
  updateCustomerBalance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateInvoiceListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));

jest.mock('../../../services/rentalNotificationService', () => ({
  sendRentalLifecycleMessage: jest.fn().mockResolvedValue({ sent: true }),
}));

jest.mock('../../../services/businessEvents', () => ({
  emitBusinessEvent: jest.fn(),
}));

const { generateRentalInvoice } = require('../../../services/rentalInvoiceService');
const { cancelUnpaidRentalInvoice } = require('../../../services/rentalInvoicePaymentService');
const { sendRentalLifecycleMessage } = require('../../../services/rentalNotificationService');
const { emitBusinessEvent } = require('../../../services/businessEvents');
const { runPostRentalAutomation } = require('../../../services/rentalAutomationService');

describe('runPostRentalAutomation', () => {
  const rental = {
    id: 'rental-1',
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    totalDue: 100,
    items: [],
    lateCharges: [],
    damageReports: [],
    reload: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    generateRentalInvoice.mockResolvedValue({ invoice: { id: 'inv-1' }, created: true });
  });

  it('creates an invoice, sends the confirmation and reports rental.created', async () => {
    const result = await runPostRentalAutomation({
      event: 'created',
      rental,
      tenantId: 'tenant-1',
    });

    expect(generateRentalInvoice).toHaveBeenCalledWith('rental-1', { applyHeldDeposit: false });
    expect(rental.reload).toHaveBeenCalled();
    expect(sendRentalLifecycleMessage).toHaveBeenCalledWith({
      rental,
      invoice: { id: 'inv-1' },
      event: 'created',
    });
    expect(emitBusinessEvent).toHaveBeenCalledWith('tenant-1', 'rental.created', {
      rentalId: 'rental-1',
      customerId: 'customer-1',
      invoiceId: 'inv-1',
    });
    expect(result.created).toBe(true);
  });

  it('treats a confirmed pre-booking as a new rental', async () => {
    await runPostRentalAutomation({
      event: 'prebooking_confirmed',
      rental,
      tenantId: 'tenant-1',
    });

    expect(sendRentalLifecycleMessage).toHaveBeenCalledWith(expect.objectContaining({ event: 'created' }));
    expect(emitBusinessEvent).toHaveBeenCalledWith('tenant-1', 'rental.created', expect.any(Object));
  });

  it('keeps the invoice result when the customer message fails', async () => {
    sendRentalLifecycleMessage.mockRejectedValueOnce(new Error('sms down'));

    const result = await runPostRentalAutomation({
      event: 'created',
      rental,
      tenantId: 'tenant-1',
    });

    expect(result.created).toBe(true);
  });

  it('applies deposit on return and sends the return message', async () => {
    await runPostRentalAutomation({
      event: 'returned',
      rental,
      tenantId: 'tenant-1',
    });

    expect(generateRentalInvoice).toHaveBeenCalledWith('rental-1', { applyHeldDeposit: true });
    expect(sendRentalLifecycleMessage).toHaveBeenCalledWith(expect.objectContaining({ event: 'returned' }));
    expect(emitBusinessEvent).toHaveBeenCalledWith('tenant-1', 'rental.returned', expect.any(Object));
  });

  it('cancels unpaid invoice on cancel', async () => {
    await runPostRentalAutomation({
      event: 'cancelled',
      rental,
      tenantId: 'tenant-1',
    });

    expect(cancelUnpaidRentalInvoice).toHaveBeenCalledWith(rental);
    expect(generateRentalInvoice).not.toHaveBeenCalled();
    expect(sendRentalLifecycleMessage).not.toHaveBeenCalled();
    expect(emitBusinessEvent).toHaveBeenCalledWith('tenant-1', 'rental.cancelled', expect.objectContaining({
      rentalId: 'rental-1',
    }));
  });

  it('sends the handover message on checkout without applying deposit', async () => {
    await runPostRentalAutomation({
      event: 'checkout',
      rental,
      tenantId: 'tenant-1',
    });

    expect(generateRentalInvoice).toHaveBeenCalledWith('rental-1', { applyHeldDeposit: false });
    expect(sendRentalLifecycleMessage).toHaveBeenCalledWith(expect.objectContaining({ event: 'checked_out' }));
    expect(emitBusinessEvent).toHaveBeenCalledWith('tenant-1', 'rental.checked_out', expect.any(Object));
  });

  it('sends no customer message or event for extensions', async () => {
    await runPostRentalAutomation({
      event: 'extended',
      rental,
      tenantId: 'tenant-1',
    });

    expect(sendRentalLifecycleMessage).not.toHaveBeenCalled();
    expect(emitBusinessEvent).not.toHaveBeenCalled();
  });
});
