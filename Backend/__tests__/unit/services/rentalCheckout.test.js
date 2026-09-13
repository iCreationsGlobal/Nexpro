const {
  isRentalStartDateReached,
  canCheckoutRental,
  syncRentalLifecycleStatus,
  calculateExtensionPreview,
  getDayCount,
} = require('../../../services/rentalAvailabilityService');

describe('rental checkout helpers', () => {
  it('detects when rental start date has been reached', () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    expect(isRentalStartDateReached(today)).toBe(true);
    expect(isRentalStartDateReached(yesterday)).toBe(true);
    expect(isRentalStartDateReached(tomorrow)).toBe(false);
  });

  it('allows checkout for confirmed rentals when start date is reached', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(canCheckoutRental({ status: 'confirmed', startDate: today })).toBe(true);
    expect(canCheckoutRental({ status: 'active', startDate: today })).toBe(false);
  });

  it('blocks early checkout unless override is allowed', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const rental = { status: 'confirmed', startDate: tomorrow };

    expect(canCheckoutRental(rental)).toBe(false);
    expect(canCheckoutRental(rental, { allowEarlyOverride: true })).toBe(true);
  });
});

describe('syncRentalLifecycleStatus checkout behavior', () => {
  it('does not auto-promote confirmed rentals to active', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const rental = {
      status: 'confirmed',
      startDate: yesterday,
      endDate: yesterday,
      update: jest.fn().mockResolvedValue(undefined),
    };

    await syncRentalLifecycleStatus(rental);

    expect(rental.update).not.toHaveBeenCalled();
    expect(rental.status).toBe('confirmed');
  });

  it('still promotes active rentals to overdue when past end date', async () => {
    const start = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const rental = {
      status: 'active',
      startDate: start,
      endDate: end,
      update: jest.fn().mockImplementation(async (payload) => {
        rental.status = payload.status;
      }),
    };

    await syncRentalLifecycleStatus(rental);

    expect(rental.update).toHaveBeenCalledWith({ status: 'overdue' });
    expect(rental.status).toBe('overdue');
  });
});

describe('calculateExtensionPreview', () => {
  it('computes extension days and additional charge from daily rates', () => {
    const rental = {
      startDate: '2026-01-01',
      endDate: '2026-01-05',
      amount: 500,
    };
    const items = [
      { id: 'item-1', productId: 'prod-1', quantity: 2, rentalRatePerDay: 50 },
    ];

    const preview = calculateExtensionPreview(rental, items, '2026-01-08');

    expect(preview.previousDurationDays).toBe(getDayCount('2026-01-01', '2026-01-05'));
    expect(preview.newDurationDays).toBe(getDayCount('2026-01-01', '2026-01-08'));
    expect(preview.extensionDays).toBe(3);
    expect(preview.extensionStartDate).toBe('2026-01-06');
    expect(preview.additionalCharge).toBe(300);
    expect(preview.newAmount).toBe(800);
    expect(preview.items[0].newSubtotal).toBe(800);
    expect(preview.items[0].additionalSubtotal).toBe(300);
  });

  it('returns zero extension days when new end date is not later', () => {
    const rental = {
      startDate: '2026-01-01',
      endDate: '2026-01-05',
      amount: 500,
    };
    const items = [{ id: 'item-1', productId: 'prod-1', quantity: 1, rentalRatePerDay: 100 }];

    const preview = calculateExtensionPreview(rental, items, '2026-01-05');

    expect(preview.extensionDays).toBe(0);
    expect(preview.additionalCharge).toBe(0);
  });
});

describe('getDayCount billing modes', () => {
  it('uses inclusive calendar days for end of day', () => {
    expect(getDayCount('2026-08-29', '2026-08-29')).toBe(1);
    expect(getDayCount('2026-08-29', '2026-08-30', 'end_of_day')).toBe(2);
  });

  it('uses nights for overnight equipment hires', () => {
    expect(getDayCount('2026-08-29', '2026-08-30', 'overnight')).toBe(1);
    expect(getDayCount('2026-08-29', '2026-09-01', { dayBillingMode: 'overnight' })).toBe(3);
  });
});

