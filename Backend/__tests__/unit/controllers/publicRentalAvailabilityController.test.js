jest.mock('../../../utils/storeTenantEntitlements', () => ({
  tenantHasEffectiveFeature: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../models', () => ({
  OnlineStoreSettings: { findOne: jest.fn() },
  OnlineProductListing: { findOne: jest.fn() },
  Product: { findOne: jest.fn() },
  Customer: {},
  PreBooking: {},
  PreBookingItem: {},
}));

jest.mock('../../../services/rentalAvailabilityService', () => ({
  checkRentalAvailability: jest.fn(),
  calculateRentalTotals: jest.fn(),
  assertItemsAvailable: jest.fn(),
}));

jest.mock('../../../utils/storefrontRentalListingUtils', () => ({
  resolveListingCommerceMode: jest.fn(),
  resolveRentalRatePerDay: jest.fn(),
}));

jest.mock('../../../utils/shopUtils', () => ({
  ensureDefaultShop: jest.fn(),
}));

jest.mock('../../../services/rentalSettingsService', () => ({
  getRentalSettings: jest.fn().mockResolvedValue({ dayBillingMode: 'end_of_day' }),
}));

const {
  OnlineStoreSettings,
  OnlineProductListing,
  Product,
} = require('../../../models');
const {
  checkRentalAvailability,
  calculateRentalTotals,
} = require('../../../services/rentalAvailabilityService');
const {
  resolveListingCommerceMode,
  resolveRentalRatePerDay,
} = require('../../../utils/storefrontRentalListingUtils');
const { ensureDefaultShop } = require('../../../utils/shopUtils');
const { getPublicRentalAvailability } = require('../../../controllers/publicRentalBookingController');

describe('publicRentalBookingController.getPublicRentalAvailability', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const baseReq = {
    params: { slug: 'rental-store' },
    query: {
      listingId: 'listing-1',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      quantity: '2',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    OnlineStoreSettings.findOne.mockResolvedValue({
      id: 'store-1',
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      slug: 'rental-store',
      displayName: 'Rental Store',
    });
    OnlineProductListing.findOne.mockResolvedValue({
      id: 'listing-1',
      title: 'Camera Kit',
      product: { id: 'product-1', name: 'Camera Kit', metadata: {} },
      metadata: {},
    });
    resolveListingCommerceMode.mockReturnValue({ isRentable: true, isSalable: false, listingMode: 'rent' });
    resolveRentalRatePerDay.mockReturnValue(150);
    checkRentalAvailability.mockResolvedValue({
      availableQty: 3,
      totalQty: 5,
      isRentable: true,
      notFound: false,
      overlaps: true,
    });
    calculateRentalTotals.mockReturnValue({ days: 3, total: 900, subtotal: 900 });
  });

  it('returns availability using the same service as staff-side checks', async () => {
    const res = mockRes();
    const next = jest.fn();

    await getPublicRentalAvailability({ ...baseReq }, res, next);

    expect(checkRentalAvailability).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      productId: 'product-1',
      branchId: 'shop-1',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        listingId: 'listing-1',
        productId: 'product-1',
        availableQty: 3,
        totalQty: 5,
        isRentable: true,
        requestedQty: 2,
        canFulfill: true,
        estimatedTotal: 900,
        days: 3,
        rentalRatePerDay: 150,
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('resolves productId when listingId is omitted', async () => {
    Product.findOne.mockResolvedValue({ id: 'product-1', name: 'Camera Kit', metadata: {} });
    OnlineProductListing.findOne.mockResolvedValue({
      id: 'listing-1',
      productId: 'product-1',
      metadata: {},
    });

    const req = {
      params: { slug: 'rental-store' },
      query: {
        productId: 'product-1',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
      },
    };

    const res = mockRes();
    await getPublicRentalAvailability(req, res, jest.fn());

    expect(Product.findOne).toHaveBeenCalledWith({
      where: { id: 'product-1', tenantId: 'tenant-1', isActive: true },
    });
    expect(checkRentalAvailability).toHaveBeenCalledWith(expect.objectContaining({ productId: 'product-1' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('marks canFulfill false when requested quantity exceeds availability', async () => {
    checkRentalAvailability.mockResolvedValue({
      availableQty: 1,
      totalQty: 5,
      isRentable: true,
      notFound: false,
      overlaps: true,
    });

    const res = mockRes();
    await getPublicRentalAvailability({ ...baseReq, query: { ...baseReq.query, quantity: '2' } }, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        requestedQty: 2,
        availableQty: 1,
        canFulfill: false,
      }),
    });
  });

  it('requires listingId or productId', async () => {
    const res = mockRes();
    await getPublicRentalAvailability({
      params: { slug: 'rental-store' },
      query: { startDate: '2026-09-01', endDate: '2026-09-03' },
    }, res, jest.fn());

    expect(checkRentalAvailability).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'listingId or productId is required',
    }));
  });

  it('resolves branch from default shop when store has no shopId', async () => {
    OnlineStoreSettings.findOne.mockResolvedValue({
      id: 'store-1',
      tenantId: 'tenant-1',
      shopId: null,
      slug: 'rental-store',
      displayName: 'Rental Store',
    });
    ensureDefaultShop.mockResolvedValue({ id: 'default-shop-1' });

    const res = mockRes();
    await getPublicRentalAvailability({ ...baseReq }, res, jest.fn());

    expect(ensureDefaultShop).toHaveBeenCalledWith('tenant-1', { name: 'Rental Store' });
    expect(checkRentalAvailability).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'default-shop-1' }));
  });
});
