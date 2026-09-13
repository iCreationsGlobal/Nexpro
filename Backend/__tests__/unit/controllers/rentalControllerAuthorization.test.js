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

const { Rental } = require('../../../models');
const {
  canTransitionRentalStatus,
  canCheckoutRental,
  syncRentalLifecycleStatus,
} = require('../../../services/rentalAvailabilityService');
const { getEffectiveRole } = require('../../../middleware/auth');
const rentalController = require('../../../controllers/rentalController');

jest.mock('../../../middleware/auth', () => ({
  getEffectiveRole: jest.fn(),
}));

describe('rentalController role enforcement', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    syncRentalLifecycleStatus.mockResolvedValue(undefined);
    canTransitionRentalStatus.mockReturnValue(true);
  });

  describe('updateRental', () => {
    const rentalRecord = {
      id: 'rental-1',
      tenantId: 'tenant-1',
      status: 'confirmed',
      startDate: '2026-01-01',
      endDate: '2026-01-05',
      metadata: {},
      update: jest.fn().mockResolvedValue(undefined),
      reload: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      Rental.findOne.mockResolvedValue(rentalRecord);
    });

    it('returns 403 when staff tries to cancel a rental', async () => {
      getEffectiveRole.mockReturnValue('staff');
      const req = {
        tenantId: 'tenant-1',
        params: { id: 'rental-1' },
        body: { status: 'cancelled' },
        user: { id: 'user-1', role: 'staff' },
      };
      const res = mockRes();
      const next = jest.fn();

      await rentalController.updateRental(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Only managers and admins can cancel rentals',
      });
      expect(rentalRecord.update).not.toHaveBeenCalled();
    });

    it('allows manager to cancel a rental', async () => {
      getEffectiveRole.mockReturnValue('manager');
      const req = {
        tenantId: 'tenant-1',
        params: { id: 'rental-1' },
        body: { status: 'cancelled' },
        user: { id: 'user-1', role: 'manager' },
      };
      const res = mockRes();
      const next = jest.fn();

      await rentalController.updateRental(req, res, next);

      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(rentalRecord.update).toHaveBeenCalled();
    });
  });

  describe('checkoutRental', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const rentalRecord = {
      id: 'rental-1',
      tenantId: 'tenant-1',
      status: 'confirmed',
      startDate: tomorrow,
      endDate: tomorrow,
      metadata: {},
      update: jest.fn().mockResolvedValue(undefined),
      reload: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      Rental.findOne.mockResolvedValue(rentalRecord);
      canCheckoutRental.mockImplementation((rental, { allowEarlyOverride } = {}) => {
        if (rental.status !== 'confirmed') return false;
        if (allowEarlyOverride) return true;
        return rental.startDate <= new Date().toISOString().slice(0, 10);
      });
    });

    it('returns 403 when staff attempts early checkout', async () => {
      getEffectiveRole.mockReturnValue('staff');
      const req = {
        tenantId: 'tenant-1',
        params: { id: 'rental-1' },
        body: {},
        user: { id: 'user-1', role: 'staff' },
      };
      const res = mockRes();
      const next = jest.fn();

      await rentalController.checkoutRental(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Rental start date has not been reached yet. Only managers and admins can hand over early.',
      });
      expect(rentalRecord.update).not.toHaveBeenCalled();
    });

    it('allows manager early checkout', async () => {
      getEffectiveRole.mockReturnValue('manager');
      const req = {
        tenantId: 'tenant-1',
        params: { id: 'rental-1' },
        body: {},
        user: { id: 'user-1', role: 'manager' },
      };
      const res = mockRes();
      const next = jest.fn();

      await rentalController.checkoutRental(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(rentalRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' })
      );
    });
  });
});
