jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock('../../../models', () => ({
  Rental: { findOne: jest.fn() },
  RentalItem: {},
  PreBooking: {},
  PreBookingItem: {},
  DamageReport: {},
  Product: {},
  Customer: {},
  Invoice: {},
  Expense: {},
  LateCharge: {},
  RentalExtension: {},
  RentalUnit: {},
  Payment: { create: jest.fn() },
}));

jest.mock('../../../services/rentalAvailabilityService', () => ({
  calculateRentalTotals: jest.fn(),
  calculateExtensionPreview: jest.fn(),
  checkRentalAvailability: jest.fn(),
  checkBatchAvailability: jest.fn(),
  assertItemsAvailable: jest.fn(),
  recalculateLateCharge: jest.fn(),
  getInitialRentalStatus: jest.fn(),
  canTransitionRentalStatus: jest.fn(),
  canCheckoutRental: jest.fn(),
  syncRentalLifecycleStatus: jest.fn(),
  getDayCount: jest.fn(),
}));

jest.mock('../../../services/rentalSettingsService', () => ({
  getRentalSettings: jest.fn(),
}));

jest.mock('../../../services/rentalDamageService', () => ({
  autoCreateExpenseFromDamage: jest.fn(),
}));

jest.mock('../../../services/rentalInvoiceService', () => ({
  generateRentalInvoice: jest.fn(),
  computeRentalTotalDue: jest.fn(),
  syncRentalInvoice: jest.fn(),
}));

jest.mock('../../../services/rentalCustomerHistoryService', () => ({
  updateRentalCustomerHistory: jest.fn(),
}));

jest.mock('../../../services/rentalDepositService', () => ({
  initializeRentalDeposit: jest.fn(),
  parseDepositInput: jest.fn(),
  buildDepositMetadata: jest.fn(),
  recordDepositPayment: jest.fn(),
  getRentalDeposit: jest.fn(),
  getDepositRefundableAmount: jest.fn(),
  resolveSuggestedDepositAmount: jest.fn(),
  refundRentalDeposit: jest.fn(),
  applyRentalDepositManually: jest.fn(),
  rentalPaymentMethodToPaymentModel: jest.fn((method) => method || 'cash'),
}));

jest.mock('../../../services/rentalAutomationService', () => ({
  enqueuePostRentalAutomation: jest.fn(),
  runPostRentalAutomation: jest.fn(),
}));

jest.mock('../../../services/rentalInvoicePaymentService', () => ({
  syncRentalInvoiceAndRefreshCustomerBalance: jest.fn(),
}));

jest.mock('../../../services/rentalDeliveryService', () => ({
  parseScheduleDeliveryInput: jest.fn(() => ({ enabled: false })),
  buildScheduledDeliveryLeg: jest.fn(),
  mergeDeliveryLegMetadata: jest.fn((rental) => rental?.metadata || {}),
  resolveRentalDeliveryAddress: jest.fn(),
}));

jest.mock('../../../services/rentalPdfService', () => ({
  buildRentalAgreementDocument: jest.fn(),
  buildRentalReturnInspectionDocument: jest.fn(),
}));

jest.mock('../../../services/rentalNotificationService', () => ({}));

jest.mock('../../../utils/shopUtils', () => ({
  ensureDefaultShop: jest.fn(),
}));

jest.mock('../../../middleware/auth', () => ({
  getEffectiveRole: jest.fn(() => 'staff'),
}));

const { Rental, Payment } = require('../../../models');
const { generateRentalInvoice } = require('../../../services/rentalInvoiceService');
const { rentalPaymentMethodToPaymentModel } = require('../../../services/rentalDepositService');
const { syncRentalInvoiceAndRefreshCustomerBalance } = require('../../../services/rentalInvoicePaymentService');
const rentalController = require('../../../controllers/rentalController');

describe('rentalController.recordRentalPayment', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const buildRental = (overrides = {}) => ({
    id: 'rental-1',
    tenantId: 'tenant-1',
    customerId: 'cust-1',
    status: 'active',
    totalDue: 400,
    amountPaid: 100,
    paymentMethod: 'cash',
    metadata: { invoiceId: 'inv-1' },
    get: jest.fn(function get({ plain } = {}) {
      return plain ? { ...this } : this;
    }),
    update: jest.fn().mockResolvedValue(undefined),
    reload: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    generateRentalInvoice.mockResolvedValue({ invoice: { id: 'inv-1' }, created: false });
    syncRentalInvoiceAndRefreshCustomerBalance.mockResolvedValue({ id: 'inv-1', amountPaid: 200 });
    Payment.create.mockResolvedValue({ id: 'pay-1', amount: 100, description: 'rental:rental-1' });
    rentalPaymentMethodToPaymentModel.mockImplementation((method) => method || 'cash');
  });

  it('records a hire payment, syncs the invoice, and leaves rental status unchanged', async () => {
    const rental = buildRental();
    Rental.findOne.mockResolvedValue(rental);

    const res = mockRes();
    await rentalController.recordRentalPayment({
      tenantId: 'tenant-1',
      params: { id: 'rental-1' },
      body: { amount: 100, paymentMethod: 'momo', notes: 'partial' },
      user: { id: 'user-1', role: 'staff' },
    }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(rental.update).toHaveBeenCalledWith(expect.objectContaining({
      amountPaid: 200,
      paymentMethod: 'momo',
    }));
    expect(rental.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: expect.anything() }));
    expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 100,
      description: 'rental:rental-1',
      notes: 'partial',
      status: 'completed',
    }));
    expect(syncRentalInvoiceAndRefreshCustomerBalance).toHaveBeenCalledWith(rental, { tenantId: 'tenant-1' });
  });

  it('rejects payments that exceed the remaining hire balance', async () => {
    const rental = buildRental();
    Rental.findOne.mockResolvedValue(rental);

    const res = mockRes();
    await rentalController.recordRentalPayment({
      tenantId: 'tenant-1',
      params: { id: 'rental-1' },
      body: { amount: 400 },
      user: { id: 'user-1' },
    }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Payment.create).not.toHaveBeenCalled();
    expect(rental.update).not.toHaveBeenCalled();
  });

  it('rejects payment on a cancelled rental', async () => {
    Rental.findOne.mockResolvedValue(buildRental({ status: 'cancelled' }));

    const res = mockRes();
    await rentalController.recordRentalPayment({
      tenantId: 'tenant-1',
      params: { id: 'rental-1' },
      body: { amount: 50 },
      user: { id: 'user-1' },
    }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Payment.create).not.toHaveBeenCalled();
  });
});
