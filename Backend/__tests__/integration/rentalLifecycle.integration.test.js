/**
 * Rental lifecycle integration tests (P2-09).
 * Exercises controller flows with real rentalAvailabilityService and in-memory models.
 */
const harness = require('./helpers/rentalIntegrationHarness');

const mockState = { store: null };

jest.mock('../../config/database', () => {
  const { buildDatabaseMock } = require('./helpers/rentalIntegrationHarness');
  return buildDatabaseMock();
});

jest.mock('../../models', () => {
  const { buildModelMocks } = require('./helpers/rentalIntegrationHarness');
  return buildModelMocks(() => mockState.store);
});

jest.mock('../../utils/productStockUtils', () => ({
  getShopStockQuantity: jest.fn(async ({ productId }) => {
    const product = mockState.store?.products.find((row) => row.id === productId);
    return Number(product?.stockQty ?? 0);
  }),
}));

jest.mock('../../services/rentalUnitService', () => ({
  productTracksSerialUnits: jest.fn(() => false),
  loadProductForUnitTracking: jest.fn(async (productId) => {
    return mockState.store?.products.find((row) => row.id === productId) || null;
  }),
  countOperationalUnits: jest.fn(async () => 0),
  getBookedUnitIdsForRange: jest.fn(async () => []),
  validateItemUnitAssignments: jest.fn().mockResolvedValue(undefined),
  applyUnitAssignments: jest.fn().mockResolvedValue(undefined),
  releaseRentalUnits: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/rentalSettingsService', () => ({
  getRentalSettings: jest.fn().mockResolvedValue({
    gracePeriodValue: 0,
    gracePeriodUnit: 'hours',
    lateChargeRatePercent: 0,
    defaultDepositPercent: 0,
  }),
  getGraceAdjustedDueDate: jest.requireActual('../../services/rentalSettingsService').getGraceAdjustedDueDate,
  normalizeDayBillingMode: jest.requireActual('../../services/rentalSettingsService').normalizeDayBillingMode,
  DEFAULT_RENTAL_SETTINGS: jest.requireActual('../../services/rentalSettingsService').DEFAULT_RENTAL_SETTINGS,
}));

jest.mock('../../services/rentalDepositService', () => ({
  initializeRentalDeposit: jest.fn().mockResolvedValue({ deposit: null }),
  parseDepositInput: jest.fn(),
  buildDepositMetadata: jest.fn(),
  recordDepositPayment: jest.fn(),
  getRentalDeposit: jest.fn(() => ({ amount: 0, paid: 0, status: 'none' })),
  getDepositRefundableAmount: jest.fn(() => 0),
  resolveSuggestedDepositAmount: jest.fn(() => 0),
  refundRentalDeposit: jest.fn(),
  applyRentalDepositManually: jest.fn(),
  rentalPaymentMethodToPaymentModel: jest.fn((method) => method || 'cash'),
}));

const mockGenerateRentalInvoice = jest.fn();
jest.mock('../../services/rentalInvoiceService', () => ({
  generateRentalInvoice: (...args) => mockGenerateRentalInvoice(...args),
  computeRentalTotalDue: jest.fn((rental) => Number(rental.totalDue ?? rental.amount ?? 0)),
  syncRentalInvoice: jest.fn(),
}));

jest.mock('../../services/rentalCustomerHistoryService', () => ({
  updateRentalCustomerHistory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/rentalDamageService', () => ({
  autoCreateExpenseFromDamage: jest.fn(),
}));

jest.mock('../../services/rentalPdfService', () => ({
  buildRentalAgreementDocument: jest.fn(),
  buildRentalReturnInspectionDocument: jest.fn(),
}));

jest.mock('../../services/rentalNotificationService', () => ({}));

jest.mock('../../services/rentalAutomationService', () => ({
  enqueuePostRentalAutomation: jest.fn(),
  runPostRentalAutomation: jest.fn(),
}));

jest.mock('../../services/rentalInvoicePaymentService', () => ({
  syncRentalInvoiceAndRefreshCustomerBalance: jest.fn(),
}));

jest.mock('../../services/rentalDeliveryService', () => ({
  parseScheduleDeliveryInput: jest.fn(() => ({ enabled: false })),
  buildScheduledDeliveryLeg: jest.fn(),
  mergeDeliveryLegMetadata: jest.fn((rental, _leg, metadata) => ({
    ...((rental?.metadata && typeof rental.metadata === 'object') ? rental.metadata : {}),
    ...metadata,
  })),
  resolveRentalDeliveryAddress: jest.fn(() => 'addr'),
}));

jest.mock('../../utils/shopUtils', () => ({
  ensureDefaultShop: jest.fn().mockResolvedValue({ id: 'shop-1', name: 'Main location' }),
}));

jest.mock('../../middleware/auth', () => ({
  getEffectiveRole: jest.fn((req) => req.user?.role || 'staff'),
}));

const rentalController = require('../../controllers/rentalController');
const { Product, Customer, Rental, RentalItem, PreBooking } = require('../../models');

describe('Rental lifecycle integration', () => {
  beforeEach(() => {
    mockState.store = harness.createEmptyStore();
    jest.clearAllMocks();
    mockGenerateRentalInvoice.mockResolvedValue({
      invoice: { id: 'invoice-1', status: 'draft' },
      created: true,
    });
  });

  const runLifecycle = async ({
    startDate,
    endDate,
    extendTo,
    returnDate,
  }) => {
    const product = await harness.seedRentableProduct(mockState.store, { Product }, {
      stockQty: 2,
      rentalRatePerDay: 50,
    });
    const customer = await harness.seedCustomer({ Customer });

    const createRes = harness.createMockRes();
    await rentalController.createRental({
      ...harness.createStaffReq({
        body: {
          customerId: customer.id,
          branchId: 'shop-1',
          startDate,
          endDate,
          items: [{ productId: product.id, quantity: 1, rentalRatePerDay: 50 }],
        },
      }),
    }, createRes, jest.fn());

    expect(createRes.status).toHaveBeenCalledWith(201);
    const rentalId = createRes.json.mock.calls[0][0].data.id;

    const checkoutRes = harness.createMockRes();
    await rentalController.checkoutRental({
      ...harness.createStaffReq({
        params: { id: rentalId },
        user: { id: 'user-1', tenantId: 'tenant-1', role: 'admin' },
        body: { handoverNotes: 'Handed over in good condition' },
      }),
    }, checkoutRes, jest.fn());

    expect(checkoutRes.status).toHaveBeenCalledWith(200);
    expect(checkoutRes.json.mock.calls[0][0].data.status).toBe('active');

    const extendRes = harness.createMockRes();
    await rentalController.extendRental({
      ...harness.createStaffReq({
        params: { id: rentalId },
        body: { newEndDate: extendTo, reason: 'Customer requested extra days' },
      }),
    }, extendRes, jest.fn());

    expect(extendRes.status).toHaveBeenCalledWith(200);
    expect(extendRes.json.mock.calls[0][0].data.rental.endDate).toBe(extendTo);

    const returnRes = harness.createMockRes();
    await rentalController.returnRental({
      ...harness.createStaffReq({
        params: { id: rentalId },
        body: { actualReturnDate: returnDate, inspectionNotes: 'Returned complete' },
      }),
    }, returnRes, jest.fn());

    expect(returnRes.status).toHaveBeenCalledWith(200);
    expect(returnRes.json.mock.calls[0][0].data.status).toBe('returned');
    expect(returnRes.json.mock.calls[0][0].invoiceCreated).toBe(true);
    expect(mockGenerateRentalInvoice).toHaveBeenCalledWith(rentalId, { applyHeldDeposit: true });

    const completeRes = harness.createMockRes();
    await rentalController.updateRental({
      ...harness.createStaffReq({
        params: { id: rentalId },
        body: { status: 'completed' },
      }),
    }, completeRes, jest.fn());

    expect(completeRes.status).toHaveBeenCalledWith(200);
    expect(completeRes.json.mock.calls[0][0].data.status).toBe('completed');

    return { rentalId, product, customer };
  };

  it('runs full lifecycle: create → checkout → extend → return → invoice → complete', async () => {
    const today = harness.todayStr();
    const startDate = harness.addDays(today, 1);
    const endDate = harness.addDays(today, 3);
    const extendTo = harness.addDays(today, 5);
    const returnDate = extendTo;

    const { rentalId } = await runLifecycle({ startDate, endDate, extendTo, returnDate });

    const storedRental = mockState.store.rentals.find((row) => row.id === rentalId);
    expect(storedRental.status).toBe('completed');
    expect(mockState.store.rentalExtensions).toHaveLength(1);
    expect(mockGenerateRentalInvoice).toHaveBeenCalledTimes(3);
    expect(mockGenerateRentalInvoice).toHaveBeenNthCalledWith(1, rentalId, { applyHeldDeposit: false });
    expect(mockGenerateRentalInvoice).toHaveBeenNthCalledWith(2, rentalId, { applyHeldDeposit: true });
    expect(mockGenerateRentalInvoice).toHaveBeenNthCalledWith(3, rentalId, { applyHeldDeposit: true });
  });

  it('blocks double-booking overlapping rentals for the same product', async () => {
    const today = harness.todayStr();
    const startDate = harness.addDays(today, 1);
    const endDate = harness.addDays(today, 4);

    const product = await harness.seedRentableProduct(mockState.store, { Product }, { stockQty: 1 });
    const customer = await harness.seedCustomer({ Customer });

    const firstRes = harness.createMockRes();
    await rentalController.createRental({
      ...harness.createStaffReq({
        body: {
          customerId: customer.id,
          branchId: 'shop-1',
          startDate,
          endDate,
          items: [{ productId: product.id, quantity: 1, rentalRatePerDay: 50 }],
        },
      }),
    }, firstRes, jest.fn());

    expect(firstRes.status).toHaveBeenCalledWith(201);

    const secondRes = harness.createMockRes();
    const next = jest.fn();
    await rentalController.createRental({
      ...harness.createStaffReq({
        body: {
          customerId: customer.id,
          branchId: 'shop-1',
          startDate: harness.addDays(today, 2),
          endDate: harness.addDays(today, 5),
          items: [{ productId: product.id, quantity: 1, rentalRatePerDay: 50 }],
        },
      }),
    }, secondRes, next);

    expect(secondRes.status).toHaveBeenCalledWith(400);
    expect(secondRes.json.mock.calls[0][0].errorCode).toBe('INSUFFICIENT_RENTAL_STOCK');
    expect(next).not.toHaveBeenCalled();
    expect(mockState.store.rentals).toHaveLength(1);
  });

  it('converts a pending pre-booking into a rental on confirm', async () => {
    const today = harness.todayStr();
    const startDate = harness.addDays(today, 2);
    const endDate = harness.addDays(today, 5);

    const product = await harness.seedRentableProduct(mockState.store, { Product }, { stockQty: 2 });
    const customer = await harness.seedCustomer({ Customer });

    const preBooking = await PreBooking.create({
      tenantId: 'tenant-1',
      customerId: customer.id,
      branchId: 'shop-1',
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      status: 'pending',
      notes: 'Awaiting confirmation',
    });

    await require('../../models').PreBookingItem.create({
      preBookingId: preBooking.id,
      productId: product.id,
      branchId: 'shop-1',
      quantity: 1,
      requestedRatePerDay: 75,
    });

    const confirmRes = harness.createMockRes();
    await rentalController.confirmPreBooking({
      ...harness.createStaffReq({ params: { id: preBooking.id } }),
    }, confirmRes, jest.fn());

    expect(confirmRes.status).toHaveBeenCalledWith(200);
    const payload = confirmRes.json.mock.calls[0][0].data;
    expect(payload.rental.status).toMatch(/confirmed|active/);
    expect(payload.preBooking.status).toBe('converted');
    expect(payload.preBooking.convertedToRentalId).toBe(payload.rental.id);
    expect(mockState.store.rentals).toHaveLength(1);
    expect(mockState.store.rentalItems).toHaveLength(1);
  });

  it('blocks confirming a pre-booking when inventory is already reserved', async () => {
    const today = harness.todayStr();
    const startDate = harness.addDays(today, 2);
    const endDate = harness.addDays(today, 5);

    const product = await harness.seedRentableProduct(mockState.store, { Product }, { stockQty: 1 });
    const customer = await harness.seedCustomer({ Customer });

    await rentalController.createRental({
      ...harness.createStaffReq({
        body: {
          customerId: customer.id,
          branchId: 'shop-1',
          startDate,
          endDate,
          items: [{ productId: product.id, quantity: 1, rentalRatePerDay: 50 }],
        },
      }),
    }, harness.createMockRes(), jest.fn());

    const preBooking = await PreBooking.create({
      tenantId: 'tenant-1',
      customerId: customer.id,
      branchId: 'shop-1',
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      status: 'pending',
    });

    await require('../../models').PreBookingItem.create({
      preBookingId: preBooking.id,
      productId: product.id,
      branchId: 'shop-1',
      quantity: 1,
      requestedRatePerDay: 75,
    });

    const confirmRes = harness.createMockRes();
    await rentalController.confirmPreBooking({
      ...harness.createStaffReq({ params: { id: preBooking.id } }),
    }, confirmRes, jest.fn());

    expect(confirmRes.status).toHaveBeenCalledWith(400);
    expect(confirmRes.json.mock.calls[0][0].errorCode).toBe('INSUFFICIENT_RENTAL_STOCK');
    expect(mockState.store.rentals).toHaveLength(1);
  });
});
