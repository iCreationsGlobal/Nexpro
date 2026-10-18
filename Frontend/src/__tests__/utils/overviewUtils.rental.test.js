import { describe, it, expect } from 'vitest';
import { buildRevenueByCategory } from '../../pages/reports/overview/overviewUtils';

describe('rental overview copy', () => {
  it('builds hire-item slices instead of product-sales or jobs categories', () => {
    const slices = buildRevenueByCategory({
      totalRevenue: 5000,
      isRental: true,
      rentalOverview: {
        revenue: { byProduct: [{ productName: 'Scaffolding', revenue: 5000 }] },
      },
    });

    expect(slices[0].name).toBe('Scaffolding');
    expect(slices.some((slice) => /Jobs|Products/.test(slice.name))).toBe(false);
  });
});
