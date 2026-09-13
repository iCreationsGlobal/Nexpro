jest.mock('../../../utils/storeTenantEntitlements', () => ({
  tenantHasEffectiveFeature: jest.fn(),
}));

jest.mock('../../../models', () => ({
  OnlineStoreSettings: { findOne: jest.fn() },
  OnlineProductListing: { findOne: jest.fn() },
  Product: {},
  Customer: { findOne: jest.fn(), create: jest.fn() },
  PreBooking: { create: jest.fn(), findByPk: jest.fn() },
  PreBookingItem: { create: jest.fn() },
}));

jest.mock('../../../services/rentalAvailabilityService', () => ({
  assertItemsAvailable: jest.fn(),
  calculateRentalTotals: jest.fn(),
}));

jest.mock('../../../utils/storefrontRentalListingUtils', () => ({
  resolveListingCommerceMode: jest.fn(),
  resolveRentalRatePerDay: jest.fn(),
}));

jest.mock('../../../utils/shopUtils', () => ({
  ensureDefaultShop: jest.fn(),
}));

jest.mock('../../../services/rentalNotificationService', () => ({
  notifyPreBookingCreated: jest.fn().mockResolvedValue({ sent: 1 }),
}));

jest.mock('../../../services/rentalSettingsService', () => ({
  getRentalSettings: jest.fn().mockResolvedValue({ dayBillingMode: 'end_of_day' }),
}));

const { tenantHasEffectiveFeature } = require('../../../utils/storeTenantEntitlements');
const {
  OnlineStoreSettings,
  OnlineProductListing,
  Customer,
  PreBooking,
  PreBookingItem,
} = require('../../../models');
const {
  assertItemsAvailable,
  calculateRentalTotals,
} = require('../../../services/rentalAvailabilityService');
const {
  resolveListingCommerceMode,
  resolveRentalRatePerDay,
} = require('../../../utils/storefrontRentalListingUtils');
const { ensureDefaultShop } = require('../../../utils/shopUtils');
const rentalNotificationService = require('../../../services/rentalNotificationService');
const { submitPublicRentalBookingRequest } = require('../../../controllers/publicRentalBookingController');

describe('publicRentalBookingController.submitPublicRentalBookingRequest', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantHasEffectiveFeature.mockResolvedValue(true);
    OnlineStoreSettings.findOne.mockResolvedValue({
      id: 'store-1',
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      slug: 'demo-rentals',
      displayName: 'Demo Rentals',
      enabled: true,
    });
    ensureDefaultShop.mockResolvedValue({ id: 'shop-1' });
  });

  it('rejects booking when tenant rentals feature is disabled', async () => {
    tenantHasEffectiveFeature.mockResolvedValue(false);
    const res = mockRes();

    await submitPublicRentalBookingRequest({
      params: { slug: 'demo-rentals' },
      body: { listingId: 'listing-1' },
    }, res, jest.fn());

    expect(tenantHasEffectiveFeature).toHaveBeenCalledWith('tenant-1', 'rentals');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorCode: 'RENTALS_NOT_ENABLED',
    }));
    expect(OnlineProductListing.findOne).not.toHaveBeenCalled();
  });

  it('creates a pending pre-booking for a valid rentable listing', async () => {
    const startDate = '2026-12-01';
    const endDate = '2026-12-03';

    OnlineProductListing.findOne.mockResolvedValue({
      id: 'listing-1',
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      status: 'published',
      metadata: {},
      product: {
        id: 'product-1',
        isActive: true,
        isRentable: true,
        rentalRatePerDay: 50,
      },
    });
    resolveListingCommerceMode.mockReturnValue({ isRentable: true, commerceMode: 'rental' });
    resolveRentalRatePerDay.mockReturnValue(50);
    assertItemsAvailable.mockResolvedValue(undefined);
    calculateRentalTotals.mockReturnValue({ days: 3, subtotal: 150, total: 150 });
    Customer.findOne.mockResolvedValue(null);
    Customer.create.mockResolvedValue({ id: 'customer-1', name: 'Jane Doe', phone: '0240000000' });
    PreBooking.create.mockResolvedValue({
      id: 'pre-1',
      status: 'pending',
      startDate,
      endDate,
      amount: 150,
      metadata: {},
    });
    PreBookingItem.create.mockResolvedValue({ id: 'pre-item-1' });
    PreBooking.findByPk.mockResolvedValue({
      id: 'pre-1',
      status: 'pending',
      items: [{ id: 'pre-item-1', productId: 'product-1', quantity: 1 }],
    });

    const res = mockRes();
    await submitPublicRentalBookingRequest({
      params: { slug: 'demo-rentals' },
      body: {
        listingId: 'listing-1',
        name: 'Jane Doe',
        phone: '0240000000',
        startDate,
        endDate,
        quantity: 1,
      },
    }, res, jest.fn());

    expect(tenantHasEffectiveFeature).toHaveBeenCalledWith('tenant-1', 'rentals');
    expect(PreBooking.create).toHaveBeenCalled();
    expect(rentalNotificationService.notifyPreBookingCreated).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});
