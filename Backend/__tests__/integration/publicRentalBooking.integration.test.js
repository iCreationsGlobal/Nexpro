/**
 * Public storefront rental booking integration tests (P2-09).
 * Submits booking requests and verifies availability enforcement end-to-end through controllers.
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
}));

jest.mock('../../utils/shopUtils', () => ({
  ensureDefaultShop: jest.fn().mockResolvedValue({ id: 'shop-1', name: 'Main location' }),
}));

jest.mock('../../services/rentalNotificationService', () => ({
  notifyPreBookingCreated: jest.fn().mockResolvedValue({ sent: 1 }),
}));

jest.mock('../../utils/storeTenantEntitlements', () => ({
  tenantHasEffectiveFeature: jest.fn().mockResolvedValue(true),
}));

const publicRentalBookingController = require('../../controllers/publicRentalBookingController');
const rentalNotificationService = require('../../services/rentalNotificationService');
const models = require('../../models');
const { Product, Customer } = models;

describe('Public rental booking integration', () => {
  beforeEach(() => {
    mockState.store = harness.createEmptyStore();
    jest.clearAllMocks();
  });

  const futureDates = () => {
    const today = harness.todayStr();
    return {
      startDate: harness.addDays(today, 3),
      endDate: harness.addDays(today, 6),
    };
  };

  it('submits a storefront booking request and creates a pending pre-booking', async () => {
    const product = await harness.seedRentableProduct(mockState.store, { Product }, {
      stockQty: 3,
      rentalRatePerDay: 120,
    });
    const { store, listing } = await harness.seedStorefront(models, { productId: product.id });
    const { startDate, endDate } = futureDates();

    const res = harness.createMockRes();
    await publicRentalBookingController.submitPublicRentalBookingRequest({
      params: { slug: store.slug },
      body: {
        listingId: listing.id,
        name: 'Store Guest',
        phone: '0555123456',
        email: 'guest@example.com',
        startDate,
        endDate,
        quantity: 2,
        notes: 'Need early pickup',
      },
    }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0].data;
    expect(payload.preBookingId).toBeTruthy();
    expect(payload.days).toBeGreaterThan(0);
    expect(payload.estimatedTotal).toBeGreaterThan(0);

    expect(mockState.store.preBookings).toHaveLength(1);
    expect(mockState.store.preBookings[0].status).toBe('pending');
    expect(mockState.store.preBookingItems).toHaveLength(1);
    expect(mockState.store.customers).toHaveLength(1);
    expect(rentalNotificationService.notifyPreBookingCreated).toHaveBeenCalled();
  });

  it('returns availability for a published rentable listing', async () => {
    const product = await harness.seedRentableProduct(mockState.store, { Product }, { stockQty: 2 });
    const { store, listing } = await harness.seedStorefront(models, { productId: product.id });
    const { startDate, endDate } = futureDates();

    const res = harness.createMockRes();
    await publicRentalBookingController.getPublicRentalAvailability({
      params: { slug: store.slug },
      query: {
        listingId: listing.id,
        startDate,
        endDate,
        quantity: '1',
      },
    }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0].data;
    expect(data.canFulfill).toBe(true);
    expect(data.availableQty).toBe(2);
    expect(data.estimatedTotal).toBeGreaterThan(0);
  });

  it('rejects booking when requested quantity exceeds available stock', async () => {
    const product = await harness.seedRentableProduct(mockState.store, { Product }, { stockQty: 1 });
    const { store, listing } = await harness.seedStorefront(models, { productId: product.id });
    const { startDate, endDate } = futureDates();

    const res = harness.createMockRes();
    await publicRentalBookingController.submitPublicRentalBookingRequest({
      params: { slug: store.slug },
      body: {
        listingId: listing.id,
        name: 'Store Guest',
        phone: '0555987654',
        startDate,
        endDate,
        quantity: 2,
      },
    }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].errorCode).toBe('INSUFFICIENT_RENTAL_STOCK');
    expect(mockState.store.preBookings).toHaveLength(0);
  });

  it('blocks a second overlapping booking after the first request reserves inventory', async () => {
    const product = await harness.seedRentableProduct(mockState.store, { Product }, { stockQty: 1 });
    const { store, listing } = await harness.seedStorefront(models, { productId: product.id });
    const { startDate, endDate } = futureDates();

    const firstRes = harness.createMockRes();
    await publicRentalBookingController.submitPublicRentalBookingRequest({
      params: { slug: store.slug },
      body: {
        listingId: listing.id,
        name: 'First Guest',
        phone: '0555111111',
        startDate,
        endDate,
        quantity: 1,
      },
    }, firstRes, jest.fn());
    expect(firstRes.status).toHaveBeenCalledWith(201);

    const secondRes = harness.createMockRes();
    await publicRentalBookingController.submitPublicRentalBookingRequest({
      params: { slug: store.slug },
      body: {
        listingId: listing.id,
        name: 'Second Guest',
        phone: '0555222222',
        startDate,
        endDate,
        quantity: 1,
      },
    }, secondRes, jest.fn());

    expect(secondRes.status).toHaveBeenCalledWith(400);
    expect(secondRes.json.mock.calls[0][0].errorCode).toBe('INSUFFICIENT_RENTAL_STOCK');
    expect(mockState.store.preBookings).toHaveLength(1);
  });

  it('reuses an existing customer matched by phone for repeat bookings', async () => {
    const product = await harness.seedRentableProduct(mockState.store, { Product }, { stockQty: 5 });
    const { store, listing } = await harness.seedStorefront(models, { productId: product.id });
    const { startDate, endDate } = futureDates();

    await Customer.create({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      name: 'Returning Guest',
      phone: '0555333444',
      email: 'returning@example.com',
    });

    const res = harness.createMockRes();
    await publicRentalBookingController.submitPublicRentalBookingRequest({
      params: { slug: store.slug },
      body: {
        listingId: listing.id,
        name: 'Returning Guest',
        phone: '0555333444',
        startDate,
        endDate,
        quantity: 1,
      },
    }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockState.store.customers).toHaveLength(1);
    expect(mockState.store.preBookings[0].customerId).toBe(mockState.store.customers[0].id);
  });
});
