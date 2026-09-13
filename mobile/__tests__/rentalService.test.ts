jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock('@/utils/shopScope', () => ({
  getActiveShopIdForScope: jest.fn().mockResolvedValue(null),
}));

import { api } from '@/services/api';
import { getActiveShopIdForScope } from '@/utils/shopScope';
import { rentalService } from '@/services/rentalService';

describe('rentalService.recordPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts a hire payment to /rentals/:id/payment', async () => {
    jest.mocked(api.post).mockResolvedValue({
      data: { success: true, data: { id: 'rental-1', amountPaid: 200 } },
    });

    await rentalService.recordPayment('rental-1', {
      amount: 100,
      paymentMethod: 'cash',
      notes: 'partial',
    });

    expect(api.post).toHaveBeenCalledWith('/rentals/rental-1/payment', {
      amount: 100,
      paymentMethod: 'cash',
      notes: 'partial',
    });
  });
});

describe('rentalService.createRental', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getActiveShopIdForScope).mockResolvedValue('shop-1');
  });

  it('posts a hire to /rentals with the active branch', async () => {
    jest.mocked(api.post).mockResolvedValue({
      data: { success: true, data: { id: 'rental-2' } },
    });

    await rentalService.createRental({
      customerId: 'cust-1',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      paymentMethod: 'credit',
      amountPaid: 0,
      items: [{ productId: 'prod-1', quantity: 1, rentalRatePerDay: 80 }],
      promisedPaymentDate: '2026-09-10',
    });

    expect(api.post).toHaveBeenCalledWith('/rentals', {
      customerId: 'cust-1',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      paymentMethod: 'credit',
      amountPaid: 0,
      items: [{ productId: 'prod-1', quantity: 1, rentalRatePerDay: 80 }],
      promisedPaymentDate: '2026-09-10',
      branchId: 'shop-1',
    });
  });

  it('checks availability against the active branch', async () => {
    jest.mocked(api.post).mockResolvedValue({
      data: { success: true, data: { canFulfillAll: true, items: [] } },
    });

    await rentalService.checkAvailability({
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      items: [{ productId: 'prod-1', quantity: 1 }],
    });

    expect(api.post).toHaveBeenCalledWith('/rentals/availability/check', {
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      items: [{ productId: 'prod-1', quantity: 1 }],
      branchId: 'shop-1',
    });
  });
});
