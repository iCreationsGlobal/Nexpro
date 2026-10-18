import { buildSmartReportSnapshot } from './buildSmartReportSnapshot';

/**
 * Resolve tab-ready snapshot from a saved/generated Smart Report.
 * Uses embedded snapshot when present; otherwise builds minimal view from legacy report sections.
 * @param {Object} report
 * @returns {Object}
 */
export function getSmartReportSnapshot(report) {
  if (report?.snapshot) return report.snapshot;

  const perf = report?.insights?.find((i) => i.type === 'performance');
  const revenueMetric = perf?.metrics?.find((m) => m.label === 'Total Revenue');
  const expenseMetric = perf?.metrics?.find((m) => m.label === 'Total Expenses');
  const profitMetric = perf?.metrics?.find((m) => m.label === 'Net Profit');

  const revenue = revenueMetric?.value ?? 0;
  const expenses = expenseMetric?.value ?? 0;
  const netProfit = profitMetric?.value ?? (revenue - expenses);

  return buildSmartReportSnapshot({
    revenueData: { totalRevenue: revenue, byPeriod: [], byCustomer: [] },
    expenseData: { totalExpenses: expenses, byCategory: [], byDate: [] },
    salesData: {},
    outstandingData: {},
    serviceAnalyticsData: {},
    productSalesData: {},
    phase2Data: {},
    cashFlowData: {},
    profitLossData: {},
    financialPositionData: {},
    revenueByChannelData: {},
    prescriptionData: null,
    comparison: {
      prevRevenue: revenueMetric?.prevValue ?? 0,
      prevExpenses: expenseMetric?.prevValue ?? 0,
      prevProfit: profitMetric?.prevValue ?? 0,
      revenueChange: revenueMetric?.change ?? 0,
      expenseChange: expenseMetric?.change ?? 0,
      profitChange: profitMetric?.change ?? 0,
      label: 'vs previous period',
    },
    isShop: false,
    isPharmacy: false,
    isStudio: false,
    isRental: false,
    rentalData: null,
    terminology: {},
  });
}

/**
 * Format period label for Smart Report header.
 * @param {Object} report
 * @returns {string}
 */
export function formatSmartReportPeriodLabel(report) {
  if (report?.periodLabel) return report.periodLabel;
  if (report?.durationType && ['day', 'week', 'month', 'custom'].includes(report.durationType)) {
    const label = {
      day: 'Daily',
      week: 'Weekly',
      month: 'Monthly',
      custom: 'Custom',
    }[report.durationType];
    return report?.period ? `${label} Report • ${report.period}` : `${label} Report`;
  }
  if (report?.durationType === 'yearly' && report?.year) {
    return `Yearly Report • ${report.year}`;
  }
  if (report?.month && report?.year) {
    return `Monthly Report • ${report.month} ${report.year}`;
  }
  return report?.period ? `Report • ${report.period}` : 'Smart Report';
}
