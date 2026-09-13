import { describe, it, expect } from 'vitest';
import { buildSmartReportSnapshot } from '../../pages/reports/smart-report/buildSmartReportSnapshot';

const baseArgs = {
  revenueData: { totalRevenue: 10000 },
  expenseData: { totalExpenses: 2000, byCategory: [] },
  salesData: { totalSales: 10000 },
  outstandingData: { totalOutstanding: 0, invoices: [] },
  serviceAnalyticsData: {},
  productSalesData: {},
  phase2Data: {},
  cashFlowData: {},
  profitLossData: { revenue: 10000, cogs: 3000, grossProfit: 7000 },
  financialPositionData: {},
  revenueByChannelData: {},
  prescriptionData: null,
  aiAnalysis: null,
  comparison: { prevRevenue: 8000, prevExpenses: 1500, prevCogs: 2000, prevProfit: 4500, label: 'vs previous period' },
  isShop: true,
  isPharmacy: false,
  isStudio: false,
  terminology: {},
};

describe('buildSmartReportSnapshot profit formulas', () => {
  it('computes Net Profit = Revenue - COGS - Operating Expenses (not Revenue - Expenses)', () => {
    const snapshot = buildSmartReportSnapshot(baseArgs);

    // Gross Profit = Revenue - COGS = 10000 - 3000 = 7000
    expect(snapshot.kpis.grossProfit.value).toBe(7000);
    // Net Profit = Gross Profit - Operating Expenses = 7000 - 2000 = 5000
    // (previously this was Revenue - Expenses = 10000 - 2000 = 8000, silently dropping COGS)
    expect(snapshot.kpis.netProfit.value).toBe(5000);
    expect(snapshot.profitLoss.current.cogs).toBe(3000);
    expect(snapshot.profitLoss.current.grossProfit).toBe(7000);
    expect(snapshot.profitLoss.current.netProfit).toBe(5000);
    // Cost of Goods Sold must be exposed as its own KPI (not folded into `expenses`, which is
    // operating expenses only) so the UI can render it as a separate card, never as an
    // Expenses-table entry.
    expect(snapshot.kpis.cogs.value).toBe(3000);
    expect(snapshot.kpis.expenses.value).toBe(2000);
  });

  it('falls back to a COGS of 0 (not a fabricated figure) when the P&L revenue basis does not align with collected revenue', () => {
    const snapshot = buildSmartReportSnapshot({
      ...baseArgs,
      // profitLossData revenue very different from collected revenue -> considered misaligned
      profitLossData: { revenue: 1, cogs: 3000, grossProfit: -2999 },
    });

    expect(snapshot.profitLoss.current.cogs).toBe(0);
    expect(snapshot.kpis.grossProfit.value).toBe(10000);
    expect(snapshot.kpis.netProfit.value).toBe(8000); // 10000 - 0 - 2000
  });

  it('does not fabricate 45%/15% inventory/vendor cash outflow estimates when no real category or vendor data exists', () => {
    const snapshot = buildSmartReportSnapshot(baseArgs);
    const outflow = snapshot.cashFlowDetail.outflowBreakdown;

    const inventoryItem = outflow.find((i) => i.name === 'Inventory Purchases');
    const vendorItem = outflow.find((i) => i.name === 'Payments to Vendors');
    const otherItem = outflow.find((i) => i.name === 'Other Payments');

    // With no matching expense category and no topVendors data, these fabricated buckets
    // must not appear (they're filtered out once their value is 0), and 100% of outflow should
    // be attributed to the real "Operating Expenses" bucket instead of being guessed.
    expect(inventoryItem).toBeUndefined();
    expect(vendorItem).toBeUndefined();
    expect(otherItem).toBeUndefined();
    const operatingItem = outflow.find((i) => i.name === 'Operating Expenses');
    expect(operatingItem.value).toBe(snapshot.cashFlow.outflow);
  });

  it('does not report equity as a fabricated closing cash balance', () => {
    const snapshot = buildSmartReportSnapshot({
      ...baseArgs,
      financialPositionData: { totalAssets: 100000, totalLiabilities: 20000, equity: 80000 },
    });

    // Closing balance must reflect the period's net cash change, not the balance-sheet equity figure.
    expect(snapshot.cashFlowDetail.kpis.closing.value).not.toBe(80000);
    expect(snapshot.cashFlowDetail.kpis.closing.value).toBe(snapshot.cashFlow.net);
  });

  it('attaches rental operations snapshot and collected wording for rental tenants', () => {
    const snapshot = buildSmartReportSnapshot({
      ...baseArgs,
      isShop: false,
      isRental: true,
      profitLossData: { revenue: 10000, cogs: 0, grossProfit: 10000 },
      rentalData: {
        revenue: { totalRevenue: 15000, totalRentalAmount: 14000, totalLateCharges: 1000, rentalCount: 8, byProduct: [{ productName: 'Excavator', revenue: 9000 }] },
        utilization: { overallUtilizationRate: 42.5, totalRentedDays: 85, totalAvailableDays: 200, byProduct: [] },
        lateReturns: { summary: { lateReturnCount: 2, totalDaysLate: 5, totalLateCharges: 1000, pendingLateCharges: 200 }, incidents: [] },
        damageTrends: { totalCost: 350, reportCount: 1, byType: [] },
      },
    });

    expect(snapshot.sourceMeta.revenue.label).toBe('Collected');
    expect(snapshot.kpis.totalSales.value).toBe(10000);
    expect(snapshot.rental.hireBooked).toBe(15000);
    expect(snapshot.rental.utilizationRate).toBe(42.5);
    expect(snapshot.rental.lateReturnCount).toBe(2);
    expect(snapshot.rental.damageCost).toBe(350);
    expect(snapshot.rental.productHistory).toEqual([]);
    expect(snapshot.rental.lowStockAlerts).toEqual([]);
    expect(snapshot.rentalAiSummary).toContain('Hire booked');
    expect(snapshot.revenueDonut.slices.some((slice) => slice.name === 'Excavator')).toBe(true);
  });
});
