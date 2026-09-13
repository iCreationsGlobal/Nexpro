import { describe, it, expect } from 'vitest';
import { buildOverviewInsights, buildRevenueByCategory } from '../../pages/reports/overview/overviewUtils';

describe('rental overview copy', () => {
  it('labels collected vs hire booked when the two figures differ', () => {
    const insights = buildOverviewInsights({
      totalRevenue: 8000,
      totalExpenses: 1000,
      revenueChange: 0,
      expenseChange: 0,
      topCustomers: [],
      outstanding: { totalOutstanding: 0 },
      collectionRate: 90,
      isRental: true,
      rentalOverview: { revenue: { totalRevenue: 12000 } },
    });

    expect(insights[0]).toContain('Collected (invoice amount paid)');
    expect(insights[0]).toContain('Hire booked');
    expect(insights.join(' ')).not.toMatch(/Jobs Summary|Total sales/i);
  });

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
