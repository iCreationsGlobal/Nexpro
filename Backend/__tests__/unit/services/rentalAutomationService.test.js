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

jest.mock('../../../services/automationEngineService', () => ({
  runRentalCreatedAutomations: jest.fn().mockResolvedValue({}),
  runRentalCreatedStaffAutomations: jest.fn().mockResolvedValue({}),
  runRentalCheckedOutAutomations: jest.fn().mockResolvedValue({}),
  runRentalReturnedAutomations: jest.fn().mockResolvedValue({}),
  runRentalReturnedStaffAutomations: jest.fn().mockResolvedValue({}),
  runRentalCancelledAutomations: jest.fn().mockResolvedValue({}),
}));

const { generateRentalInvoice } = require('../../../services/rentalInvoiceService');
const { cancelUnpaidRentalInvoice } = require('../../../services/rentalInvoicePaymentService');
const {
  runRentalCreatedAutomations,
  runRentalCheckedOutAutomations,
  runRentalReturnedAutomations,
  runRentalCancelledAutomations,
} = require('../../../services/automationEngineService');
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

  it('creates an invoice and fires created automations', async () => {
    const result = await runPostRentalAutomation({
      event: 'created',
      rental,
      tenantId: 'tenant-1',
    });

    expect(generateRentalInvoice).toHaveBeenCalledWith('rental-1', { applyHeldDeposit: false });
    expect(runRentalCreatedAutomations).toHaveBeenCalled();
    expect(result.created).toBe(true);
  });

  it('applies deposit on return', async () => {
    await runPostRentalAutomation({
      event: 'returned',
      rental,
      tenantId: 'tenant-1',
    });

    expect(generateRentalInvoice).toHaveBeenCalledWith('rental-1', { applyHeldDeposit: true });
    expect(runRentalReturnedAutomations).toHaveBeenCalled();
  });

  it('cancels unpaid invoice on cancel', async () => {
    await runPostRentalAutomation({
      event: 'cancelled',
      rental,
      tenantId: 'tenant-1',
    });

    expect(cancelUnpaidRentalInvoice).toHaveBeenCalledWith(rental);
    expect(generateRentalInvoice).not.toHaveBeenCalled();
    expect(runRentalCancelledAutomations).toHaveBeenCalled();
  });

  it('fires checkout automations without applying deposit', async () => {
    await runPostRentalAutomation({
      event: 'checkout',
      rental,
      tenantId: 'tenant-1',
    });

    expect(generateRentalInvoice).toHaveBeenCalledWith('rental-1', { applyHeldDeposit: false });
    expect(runRentalCheckedOutAutomations).toHaveBeenCalled();
  });
});
