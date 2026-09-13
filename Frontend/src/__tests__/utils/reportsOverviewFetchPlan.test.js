import { describe, it, expect } from 'vitest';
import { getReportsOverviewFetchPlan } from '../../pages/reports/overview/reportsOverviewFetchPlan';

describe('getReportsOverviewFetchPlan', () => {
  it('loads rental overview and invoice phase1 without product sales for rental tenants', () => {
    const plan = getReportsOverviewFetchPlan({ businessType: 'rental' });

    expect(plan.isRental).toBe(true);
    expect(plan.fetchRentalOverview).toBe(true);
    expect(plan.includeProductSales).toBe(false);
    expect(plan.isShopOrPharmacy).toBe(false);
    expect(plan.endpoints).toEqual([
      '/reports/overview/phase1',
      '/reports/rental/overview',
    ]);
  });

  it('does not fetch rental overview for studio tenants', () => {
    const plan = getReportsOverviewFetchPlan({ businessType: 'printing_press' });

    expect(plan.isRental).toBe(false);
    expect(plan.fetchRentalOverview).toBe(false);
    expect(plan.includeProductSales).toBe(false);
    expect(plan.endpoints).toEqual(['/reports/overview/phase1']);
  });

  it('includes product sales for shop tenants and skips rental overview', () => {
    const plan = getReportsOverviewFetchPlan({ businessType: 'shop' });

    expect(plan.includeProductSales).toBe(true);
    expect(plan.fetchRentalOverview).toBe(false);
    expect(plan.endpoints).not.toContain('/reports/rental/overview');
  });
});
