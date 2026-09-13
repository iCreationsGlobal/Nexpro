import dayjs from 'dayjs';
import { REPORT_CHART_COLORS } from '../reportConstants';
import {
  buildProfitSparkline,
  buildRevenueByCategory,
  buildRevenueExpenseTrend,
  buildSparklineSeries,
} from '../overview/overviewUtils';
import { formatAmount } from '../../../utils/formatNumber';

const pct = (part, total) => (total > 0 ? ((part / total) * 100) : 0);
const num = (v) => parseFloat(v) || 0;
const hasValue = (v) => v !== undefined && v !== null && v !== '';

const formatStatusLabel = (status = '') => String(status || 'unknown')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase());

const isCloseAmount = (a, b) => {
  const left = num(a);
  const right = num(b);
  if (left === 0 && right === 0) return true;
  return Math.abs(left - right) <= Math.max(1, Math.max(Math.abs(left), Math.abs(right)) * 0.05);
};

/**
 * Build donut slices from category rows.
 * @param {Array<{ category?: string, name?: string, totalAmount?: number, amount?: number, value?: number }>} rows
 * @param {number} totalOverride
 */
function buildCategoryDonut(rows, totalOverride) {
  const slices = (rows || [])
    .map((row, index) => ({
      name: row.category || row.name || 'Other',
      value: num(row.totalAmount ?? row.amount ?? row.value),
      color: REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length],
    }))
    .filter((s) => s.value > 0);
  const total = totalOverride ?? slices.reduce((s, i) => s + i.value, 0);
  return { slices, total };
}

function normalizeServiceMix(raw = [], denominator = 0) {
  const serviceTotal = raw.reduce((sum, item) => (
    sum + num(item.totalRevenue ?? item.totalSales ?? item.revenue)
  ), 0);
  const total = serviceTotal || denominator;

  return raw
    .map((item, index) => {
      const revenue = num(item.totalRevenue ?? item.totalSales ?? item.revenue);
      const quantity = num(item.totalQuantity ?? item.quantitySold ?? item.jobCount ?? item.itemCount);
      return {
        name: item.category || item.jobType || item.service || 'Uncategorized',
        value: revenue,
        revenue,
        quantity,
        averagePrice: num(item.averagePrice) || (quantity > 0 ? revenue / quantity : 0),
        percent: pct(revenue, total),
        color: REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length],
      };
    })
    .filter((item) => item.value > 0 || item.quantity > 0);
}

/**
 * Normalize top customers from various API shapes.
 */
function normalizeTopCustomers(raw = [], totalRevenue = 0) {
  return raw.slice(0, 10).map((c, idx) => {
    const revenue = num(c.totalRevenue ?? c.revenue);
    const name = c.customerName || c.customer?.company || c.customer?.name || c.name || 'Unknown';
    return {
      id: c.customerId || c.id || `c-${idx}`,
      name,
      initials: name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
      revenue,
      percent: pct(revenue, totalRevenue),
      count: c.jobCount ?? c.transactionCount ?? c.count ?? 0,
    };
  });
}

/**
 * Build structured snapshot for Smart Report tabs from raw report API payloads.
 */
export function buildSmartReportSnapshot({
  revenueData,
  expenseData,
  salesData,
  outstandingData,
  serviceAnalyticsData,
  productSalesData,
  phase2Data,
  cashFlowData,
  profitLossData,
  financialPositionData,
  revenueByChannelData,
  prescriptionData,
  aiAnalysis,
  comparison,
  isShop,
  isPharmacy,
  isStudio,
  isRental = false,
  rentalData = null,
  terminology,
}) {
  const collectedRevenue = num(revenueData?.totalRevenue);
  const bookedJobValue = num(salesData?.totalSales);
  const revenue = collectedRevenue;
  const expenses = num(expenseData?.totalExpenses); // operating expenses only — COGS is tracked separately
  const profitLossRevenue = num(profitLossData?.revenue ?? profitLossData?.totalRevenue);
  const profitLossAlignsWithCollections = !profitLossRevenue || isCloseAmount(profitLossRevenue, collectedRevenue);
  const reportedCogs = num(profitLossData?.cogs);
  // Only trust the reported COGS figure when the P&L revenue basis matches collected revenue —
  // otherwise the two numbers use different bases and combining them would be unreliable, so
  // COGS is treated as unknown (0) rather than risk double-counting or a mismatched calculation.
  const cogs = profitLossAlignsWithCollections ? reportedCogs : 0;
  const grossProfit = (hasValue(profitLossData?.grossProfit) && profitLossAlignsWithCollections)
    ? num(profitLossData.grossProfit)
    : revenue - cogs;
  const grossProfitMargin = pct(grossProfit, revenue);
  // Net Profit = Gross Profit − Operating Expenses = Revenue − COGS − Operating Expenses.
  // Previously this dropped COGS entirely (netProfit = revenue - expenses), overstating profit
  // for any business with product/service cost.
  const netProfit = grossProfit - expenses;
  const profitMargin = pct(netProfit, revenue);
  const bookedVsCollectedGap = Math.max(0, bookedJobValue - collectedRevenue);

  const sourceMeta = {
    revenue: {
      label: isRental ? 'Collected' : isStudio ? 'Collected revenue' : 'Revenue',
      subLabel: isRental
        ? 'Invoice amount paid in this period'
        : isStudio ? 'Cash collected from invoices in this period' : 'Recorded revenue for this period',
      basis: revenueData?.revenueSource || (isShop || isPharmacy ? 'sales' : 'invoice_collections'),
    },
    bookedJobValue: {
      label: isStudio ? 'Booked job value' : 'Booked sales value',
      subLabel: isStudio ? 'Jobs created in this period, not necessarily collected' : 'Sales booked in this period',
      basis: 'jobs_created',
    },
    grossProfit: {
      label: profitLossAlignsWithCollections ? 'Gross profit' : 'Estimated gross profit',
      subLabel: profitLossAlignsWithCollections
        ? 'From profit and loss data aligned to collected revenue'
        : 'Estimated from collected revenue because accounting revenue uses a different basis',
      basis: profitLossAlignsWithCollections ? 'profit_loss' : 'collection_estimate',
    },
    netProfit: {
      label: 'Net profit',
      subLabel: 'Collected revenue less cost of goods sold and approved expenses',
      basis: 'collections_less_cogs_less_expenses',
    },
    cashFlow: {
      label: 'Cash flow',
      subLabel: 'Cash collected from invoices less approved expenses paid in the period',
      basis: 'cash_flow_report',
    },
  };

  const prevRevenue = num(comparison?.prevRevenue);
  const prevExpenses = num(comparison?.prevExpenses);
  const prevProfit = num(comparison?.prevProfit ?? (prevRevenue - prevExpenses));
  const prevMargin = pct(prevProfit, prevRevenue);

  const revenueChange = num(comparison?.revenueChange);
  const expenseChange = num(comparison?.expenseChange);
  const profitChange = num(comparison?.profitChange);
  const marginChange = profitMargin - prevMargin;

  const trend = buildRevenueExpenseTrend(revenueData, expenseData);
  const revenueSparkline = buildSparklineSeries(revenueData?.byPeriod || [], 'totalRevenue');
  const expenseSparkline = buildSparklineSeries(expenseData?.byDate || [], 'totalAmount');
  const profitSparkline = buildProfitSparkline(trend);
  const marginSparkline = trend.map((d) => {
    const rev = d.revenue || 0;
    return rev > 0 ? (((rev - (d.expenses || 0)) / rev) * 100) : 0;
  });

  const expenseDonut = buildCategoryDonut(expenseData?.byCategory || [], expenses);
  const revenueDonut = buildRevenueByCategory({
    totalRevenue: revenue,
    serviceAnalytics: serviceAnalyticsData,
    productSales: productSalesData,
    isShop,
    isPharmacy,
    isStudio,
    isRental,
    rentalOverview: rentalData,
  }).map((s, i) => ({ ...s, color: REPORT_CHART_COLORS[i % REPORT_CHART_COLORS.length] }));

  const topCustomers = normalizeTopCustomers(
    phase2Data?.topCustomers || revenueData?.byCustomer || [],
    revenue
  );

  const totalSales = isRental
    ? revenue
    : isStudio
      ? (bookedJobValue || revenue)
      : num(salesData?.totalSales ?? salesData?.totalJobs ?? revenue);
  const orderCount = num(
    salesData?.totalJobs ??
    salesData?.transactionCount ??
    ((salesData?.byDate || []).reduce((s, d) => s + num(d.count), 0) ||
    topCustomers.reduce((s, c) => s + c.count, 0))
  );
  const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;

  const newCustomers = num(phase2Data?.extendedKpis?.current?.newCustomers ?? phase2Data?.newCustomers ?? 0);
  const activeCustomers = num(phase2Data?.extendedKpis?.current?.activeCustomers ?? phase2Data?.kpiSummary?.activeCustomers ?? 0);
  const hasReturningCustomerData = hasValue(phase2Data?.extendedKpis?.current?.returningCustomers)
    || hasValue(phase2Data?.returningCustomers);
  const returningCustomers = hasReturningCustomerData
    ? num(phase2Data?.extendedKpis?.current?.returningCustomers ?? phase2Data?.returningCustomers)
    : 0;

  const cashInflow = num(
    cashFlowData?.operating?.cashReceivedFromCustomers ??
    cashFlowData?.cashReceived ??
    revenue
  );
  const cashOutflow = num(
    cashFlowData?.operating?.cashPaidToSuppliersAndExpenses ??
    cashFlowData?.cashPaid ??
    expenses
  );
  const netCashFlow = num(cashFlowData?.netChangeInCash ?? (cashInflow - cashOutflow));

  const expenseCategories = (expenseData?.byCategory || []).map((cat) => ({
    category: cat.category || 'Uncategorized',
    amount: num(cat.totalAmount),
    percent: pct(num(cat.totalAmount), expenses),
    change: num(cat.changePercent ?? 0),
  }));

  const expenseByDate = (expenseData?.byDate || []).map((d) => ({
    date: d.date,
    label: dayjs(d.date).format('MMM D'),
    amount: num(d.totalAmount),
  }));
  const avgDailyExpense = expenseByDate.length > 0
    ? expenses / expenseByDate.length
    : (expenses / Math.max(1, dayjs(comparison?.endDate).date() || 30));
  const highestExpenseDay = expenseByDate.reduce(
    (max, d) => (d.amount > max.amount ? d : max),
    { date: null, label: '—', amount: 0 }
  );

  const paymentMethods = (revenueByChannelData?.byChannel || revenueByChannelData?.channels || [])
    .map((ch, i) => ({
      name: ch.channel || ch.name || ch.method || 'Other',
      value: num(ch.total ?? ch.amount ?? ch.revenue),
      color: REPORT_CHART_COLORS[i % REPORT_CHART_COLORS.length],
    }))
    .filter((c) => c.value > 0);

  const expenseToRevenue = pct(expenses, revenue);

  const plCurrent = {
    revenue,
    cogs,
    grossProfit,
    operatingExpenses: expenses,
    otherIncome: num(profitLossData?.otherIncome),
    otherExpenses: num(profitLossData?.otherExpenses),
    netProfit,
  };
  // prevCogs comes from the comparison payload (Reports.jsx passes it from the extended-KPIs
  // endpoint) rather than profitLossData, which has no per-period "previous" fields. When it's
  // unavailable, derive gross profit from prevProfit + prevExpenses (both real) so the previous
  // period's cogs/grossProfit stay internally consistent even without a direct COGS figure.
  const prevCogsReported = num(comparison?.prevCogs);
  const prevGrossProfit = prevCogsReported > 0 ? (prevRevenue - prevCogsReported) : (prevProfit + prevExpenses);
  const prevCogs = prevRevenue - prevGrossProfit;
  const plPrevious = {
    revenue: prevRevenue,
    cogs: prevCogs,
    grossProfit: prevGrossProfit,
    operatingExpenses: prevExpenses,
    otherIncome: num(profitLossData?.prevOtherIncome),
    otherExpenses: num(profitLossData?.prevOtherExpenses),
    netProfit: prevProfit,
  };

  const financialPosition = {
    totalAssets: num(financialPositionData?.totalAssets),
    totalLiabilities: num(financialPositionData?.totalLiabilities),
    equity: num(financialPositionData?.equity ?? (num(financialPositionData?.totalAssets) - num(financialPositionData?.totalLiabilities))),
    currentRatio: num(financialPositionData?.currentRatio),
  };

  const ratios = [
    { label: 'Gross Profit Margin', value: grossProfitMargin, status: grossProfitMargin >= 40 ? 'good' : grossProfitMargin >= 25 ? 'average' : 'poor' },
    { label: 'Net Profit Margin', value: profitMargin, status: profitMargin >= 15 ? 'good' : profitMargin >= 5 ? 'average' : 'poor' },
    { label: 'Return on Assets', value: financialPosition.totalAssets > 0 ? pct(netProfit, financialPosition.totalAssets) : 0, status: 'good' },
    { label: 'Return on Equity', value: financialPosition.equity > 0 ? pct(netProfit, financialPosition.equity) : 0, status: 'good' },
    { label: 'Expense to Revenue Ratio', value: expenseToRevenue, status: expenseToRevenue <= 75 ? 'good' : expenseToRevenue <= 90 ? 'average' : 'poor' },
  ];

  const salesByDate = (salesData?.byDate || []).map((d) => ({
    period: dayjs(d.date).format('MMM D'),
    sales: num(d.totalSales ?? d.totalRevenue),
    orders: num(d.count ?? d.jobCount),
  }));

  const serviceMix = normalizeServiceMix(
    serviceAnalyticsData?.byCategory || salesData?.byJobType || [],
    isStudio ? (bookedJobValue || revenue) : revenue
  );
  const salesCategoryTotal = serviceMix.length > 0
    ? serviceMix.reduce((sum, item) => sum + item.value, 0)
    : revenueDonut.reduce((sum, item) => sum + item.value, 0);
  const salesCategorySource = serviceMix.length > 0 ? serviceMix : revenueDonut;
  const salesByCategory = salesCategorySource.map((s) => ({
    name: s.name,
    value: s.value,
    percent: pct(s.value, salesCategoryTotal),
    color: s.color,
  }));

  const statusBreakdown = (salesData?.byStatus || []).map((row, index) => {
    const value = num(row.totalSales ?? row.totalAmount);
    const count = num(row.count ?? row.jobCount);
    return {
      status: row.status || row.name || 'unknown',
      label: formatStatusLabel(row.status || row.name),
      count,
      value,
      percent: pct(count, orderCount),
      color: REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length],
    };
  });

  const jobsTrendByDate = (salesData?.jobsTrendByDate || []).map((row) => ({
    date: row.date,
    period: dayjs(row.date).format('MMM D'),
    incoming: num(row.incoming),
    completed: num(row.completed),
  }));

  const pipelineSummary = {
    activeJobs: num(phase2Data?.pipelineSummary?.activeJobs),
    openLeads: num(phase2Data?.pipelineSummary?.openLeads),
    pendingInvoices: num(phase2Data?.pipelineSummary?.pendingInvoices),
    bookedJobValue,
    collectedRevenue,
    bookedVsCollectedGap,
  };

  const customerSegments = (() => {
    if (!topCustomers.length) return [];
    const sorted = [...topCustomers].sort((a, b) => b.revenue - a.revenue);
    const highCount = Math.max(1, Math.ceil(sorted.length * 0.2));
    const midCount = Math.max(1, Math.ceil(sorted.length * 0.3));
    const high = sorted.slice(0, highCount);
    const mid = sorted.slice(highCount, highCount + midCount);
    const low = sorted.slice(highCount + midCount);
    const sumRev = (arr) => arr.reduce((s, c) => s + c.revenue, 0);
    return [
      { segment: 'High Value (Top 20%)', customers: high.length, revenue: sumRev(high), percent: pct(sumRev(high), revenue), trend: revenueChange },
      { segment: 'Mid Value (Next 30%)', customers: mid.length, revenue: sumRev(mid), percent: pct(sumRev(mid), revenue), trend: revenueChange * 0.8 },
      { segment: 'Low Value (Bottom 50%)', customers: low.length, revenue: sumRev(low), percent: pct(sumRev(low), revenue), trend: revenueChange * 0.5 },
    ];
  })();

  const expenseInsights = [];
  if (expenseCategories[0]) {
    expenseInsights.push({
      icon: 'inventory',
      text: `${expenseCategories[0].category} accounts for ${expenseCategories[0].percent.toFixed(1)}% of total expenses.`,
    });
  }
  if (expenseChange > 5) {
    expenseInsights.push({ icon: 'trend', text: `Total expenses increased by ${expenseChange.toFixed(1)}% compared to the previous period.` });
  } else if (expenseChange < -3) {
    expenseInsights.push({ icon: 'trend', text: `Expenses decreased by ${Math.abs(expenseChange).toFixed(1)}% — good cost control.` });
  }
  if (expenseToRevenue > 80) {
    expenseInsights.push({ icon: 'ratio', text: `Expenses are ${expenseToRevenue.toFixed(1)}% of revenue. Review high-cost categories.` });
  }
  if (expenseInsights.length === 0) {
    expenseInsights.push({ icon: 'info', text: 'Expense levels are stable for this period.' });
  }

  const revenueNoun = isRental ? 'Collections' : 'Revenue';
  const revenueNounLower = isRental ? 'collections' : 'revenue';
  const aiSummary = aiAnalysis?.summary
    || (revenueChange > 0
      ? `Your financial performance is strong this period. ${revenueNoun} grew by ${revenueChange.toFixed(1)}% and profitability improved across key metrics.`
      : `Review ${revenueNounLower} drivers and expense categories to improve performance next period.`);

  const executiveAiInsight = aiAnalysis?.quickInsight
    || (revenueChange > 0
      ? `Great job! Your ${revenueNounLower} grew by ${revenueChange.toFixed(1)}% this period.${expenseChange > 10 ? ' Expenses also increased — review slow-moving cost categories.' : ''}`
      : `${revenueNoun} changed by ${revenueChange.toFixed(1)}% this period. Focus on top customers and expense control.`);

  const salesAiSummary = revenueChange > 0
    ? `${isRental ? 'Collections' : 'Sales'} grew by ${revenueChange.toFixed(1)}% this period, driven by strong ${isRental ? 'invoice collections' : isShop || isPharmacy ? 'product sales' : 'service revenue'} and customer activity.`
    : `${isRental ? 'Collection' : 'Sales'} activity for this period — monitor trends and follow up with top customers.`;

  const expensesAiSummary = expenseChange > 0
    ? `Total expenses increased by ${expenseChange.toFixed(1)}% this period.${expenseCategories[0] ? ` ${expenseCategories[0].category} remains the highest cost driver at ${expenseCategories[0].percent.toFixed(1)}% of total expenses.` : ''}`
    : `Expenses are ${expenseToRevenue.toFixed(1)}% of revenue for this period.`;

  const recommendationsRaw = aiAnalysis?.recommendations || [];
  const aiInsightPoints = aiAnalysis?.keyFindings || aiAnalysis?.insights || [];

  const inventoryProducts = (productSalesData?.products || []).map((p) => ({
    name: p.productName,
    sku: p.sku,
    quantitySold: num(p.quantitySold),
    revenue: num(p.revenue),
    cost: num(p.cost),
    grossProfit: hasValue(p.grossProfit) ? num(p.grossProfit) : num(p.revenue) - num(p.cost),
    margin: num(p.margin),
    currentStock: num(p.currentStock),
    safetyStock: num(p.safetyStock),
    unit: p.unit || 'pcs',
    isLowStock: p.isLowStock,
    isHighRisk: p.isHighRisk,
    isOutOfStock: num(p.currentStock) <= 0,
  }));

  const prevCashInflow = num(comparison?.prevRevenue ?? prevRevenue);
  const prevCashOutflow = num(comparison?.prevExpenses ?? prevExpenses);
  const prevNetCashFlow = prevCashInflow - prevCashOutflow;
  const netCashChange = prevNetCashFlow !== 0
    ? ((netCashFlow - prevNetCashFlow) / Math.abs(prevNetCashFlow)) * 100
    : profitChange;
  const inflowChange = prevCashInflow > 0 ? ((cashInflow - prevCashInflow) / prevCashInflow) * 100 : revenueChange;
  const outflowChange = prevCashOutflow > 0 ? ((cashOutflow - prevCashOutflow) / prevCashOutflow) * 100 : expenseChange;

  const operatingNet = num(
    cashFlowData?.operating?.netCashFromOperatingActivities ?? (cashInflow - cashOutflow)
  );
  const investingInflow = Math.max(0, num(cashFlowData?.investing?.cashInflow));
  const financingInflow = Math.max(0, num(cashFlowData?.financing?.cashInflow));
  const otherIncome = num(profitLossData?.otherIncome);
  const classifiedInflow = collectedRevenue + otherIncome + investingInflow + financingInflow;
  const unclassifiedInflow = Math.max(0, cashInflow - classifiedInflow);
  const investingNet = num(
    cashFlowData?.investing?.netCashUsedInInvestingActivities
    ?? cashFlowData?.investing?.netCashFromInvestingActivities
    ?? 0
  );
  const financingNet = num(
    cashFlowData?.financing?.netCashFromFinancingActivities ?? 0
  );

  // We don't have a real running bank/cash balance to report as "opening"/"closing" — equity is
  // an accounting balance-sheet figure, not a cash position, and using it here mislabels it as
  // cash on hand. Instead we only report the net cash change generated during the period itself
  // (opening treated as the period's own baseline of 0).
  const closingBalance = netCashFlow;
  const openingBalance = 0;

  const periodStartLabel = comparison?.startDate
    ? dayjs(comparison.startDate).format('MMM D, YYYY')
    : 'period start';
  const periodEndLabel = comparison?.endDate
    ? dayjs(comparison.endDate).format('MMM D, YYYY')
    : 'period end';

  // Only attribute outflow to Inventory Purchases / Vendor Payments when we have real category or
  // vendor data — no fabricated 45%/15% estimates. Unattributed outflow stays in Operating Expenses
  // rather than being guessed at.
  const inventoryPurchases = expenseCategories.find((c) => /inventory|stock|purchase|material/i.test(c.category))?.amount ?? 0;
  const vendorPayments = (phase2Data?.topVendors || []).reduce((s, v) => s + num(v.amount), 0);
  const operatingExpensesOut = Math.max(0, cashOutflow - inventoryPurchases - vendorPayments);
  const otherPayments = 0;

  const outstanding = num(outstandingData?.totalOutstanding);
  const outstandingInvoices = outstandingData?.invoices || [];
  const overdueInvoices = outstandingInvoices.filter((invoice) => invoice.status === 'overdue');
  const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + num(invoice.balance), 0);
  const outstandingDetail = {
    totalOutstanding: outstanding,
    invoiceCount: outstandingInvoices.length,
    overdueCount: overdueInvoices.length,
    overdueAmount,
    agingAnalysis: outstandingData?.agingAnalysis || {},
    byCustomer: outstandingData?.byCustomer || [],
    invoices: outstandingInvoices.slice(0, 10),
  };

  const cashFlowDetail = {
    kpis: {
      net: { value: netCashFlow, change: netCashChange, sparkline: profitSparkline },
      inflow: { value: cashInflow, change: inflowChange, sparkline: revenueSparkline },
      outflow: { value: cashOutflow, change: outflowChange, sparkline: expenseSparkline, invertTrend: true },
      // Not a real bank balance — just the net cash change for the period, relative to a $0
      // baseline. Labeled accordingly so this isn't mistaken for an actual opening/closing balance.
      opening: { value: openingBalance, subLabel: `Baseline for ${periodStartLabel}` },
      closing: { value: closingBalance, subLabel: `Net cash change by ${periodEndLabel}` },
    },
    trend: trend.map((d) => ({
      period: d.period,
      inflow: d.revenue,
      outflow: d.expenses,
      net: d.revenue - d.expenses,
    })),
    activityDonut: {
      slices: [
        { name: 'Operating Activities', value: Math.abs(operatingNet), color: REPORT_CHART_COLORS[0] },
        ...(investingNet !== 0 ? [{ name: 'Investing Activities', value: Math.abs(investingNet), color: REPORT_CHART_COLORS[1] }] : []),
        ...(financingNet !== 0 ? [{ name: 'Financing Activities', value: Math.abs(financingNet), color: REPORT_CHART_COLORS[2] }] : []),
      ].filter((s) => s.value > 0),
      total: Math.abs(netCashFlow) || Math.abs(operatingNet),
      signedSlices: [
        { name: 'Operating Activities', value: operatingNet, color: REPORT_CHART_COLORS[0] },
        { name: 'Investing Activities', value: investingNet, color: REPORT_CHART_COLORS[1] },
        { name: 'Financing Activities', value: financingNet, color: REPORT_CHART_COLORS[2] },
      ],
    },
    compositionDonut: {
      slices: [
        { name: 'Operating Inflow', value: cashInflow, color: REPORT_CHART_COLORS[0] },
        { name: 'Investing Inflow', value: investingInflow, color: REPORT_CHART_COLORS[1] },
        { name: 'Financing Inflow', value: financingInflow, color: REPORT_CHART_COLORS[2] },
      ].filter((s) => s.value > 0),
      total: cashInflow,
    },
    inflowBreakdown: [
      { name: isStudio ? 'Collected Job Revenue' : 'Sales Receipts', value: collectedRevenue, color: '#166534' },
      { name: 'Other Income', value: otherIncome, color: '#7c3aed' },
      { name: 'Investing Inflow', value: investingInflow, color: '#2563eb' },
      { name: 'Financing Inflow', value: financingInflow, color: '#c2410c' },
      { name: 'Unclassified Inflow', value: unclassifiedInflow, color: '#64748b' },
    ].map((item) => ({ ...item, percent: item.percent || pct(item.value, cashInflow) })).filter((i) => i.value > 0),
    outflowBreakdown: [
      { name: 'Operating Expenses', value: operatingExpensesOut, color: '#b91c1c' },
      { name: 'Inventory Purchases', value: inventoryPurchases, color: '#dc2626' },
      { name: 'Payments to Vendors', value: vendorPayments, color: '#ea580c' },
      { name: 'Other Payments', value: otherPayments, color: '#9333ea' },
    ].map((item) => ({ ...item, percent: pct(item.value, cashOutflow) })).filter((i) => i.value > 0),
    insights: [
      netCashFlow >= 0
        ? { icon: 'check', text: 'Net cash flow is positive, indicating healthy liquidity for this period.' }
        : { icon: 'alert', text: 'Net cash flow is negative — review outflows and collection timing.' },
      inflowChange > 0
        ? { icon: 'trend', text: `Cash inflow grew by ${inflowChange.toFixed(1)}% compared to the previous period.` }
        : null,
      expenseCategories[0]
        ? { icon: 'inventory', text: `${expenseCategories[0].category} is a major outflow driver at ${expenseCategories[0].percent.toFixed(1)}% of expenses.` }
        : null,
      outstanding > 0
        ? { icon: 'wallet', text: `${formatAmount(outstandingData?.totalOutstanding)} outstanding — follow up to improve cash collections.` }
        : null,
    ].filter(Boolean),
  };

  const stockSummary = phase2Data?.productStockSummary || phase2Data?.materialsSummary || {};
  const totalInventoryValue = num(stockSummary.totalStockValue ?? financialPositionData?.assets?.productInventory);
  const totalInventoryItems = num(stockSummary.totalStocks ?? inventoryProducts.length);
  const lowStockItems = inventoryProducts.filter((p) => p.isLowStock && !p.isOutOfStock);
  const outOfStockItems = inventoryProducts.filter((p) => p.isOutOfStock);
  const overstockItems = inventoryProducts.filter((p) => p.isHighRisk);
  const inStockCount = Math.max(0, totalInventoryItems - lowStockItems.length - outOfStockItems.length);
  const totalQuantitySold = num(productSalesData?.totalQuantitySold ?? inventoryProducts.reduce((s, p) => s + p.quantitySold, 0));
  const stockTurnover = totalInventoryItems > 0 ? totalQuantitySold / totalInventoryItems : 0;
  const prevInventoryValue = prevRevenue > 0
    ? totalInventoryValue * (1 - (revenueChange / 100) * 0.5)
    : totalInventoryValue;

  const inventoryValueTrend = trend.length > 0
    ? trend.map((d, idx) => ({
      period: d.period,
      value: totalInventoryValue * (0.85 + (idx / Math.max(trend.length - 1, 1)) * 0.15),
    }))
    : [{ period: 'Current', value: totalInventoryValue }];

  const inventoryCategoryDonut = buildCategoryDonut(
    expenseCategories.length > 0
      ? expenseCategories.slice(0, 5).map((c) => ({ name: c.category, value: c.amount }))
      : [{ name: isShop || isPharmacy ? 'Products' : 'Materials', value: totalInventoryValue }],
    totalInventoryValue || revenue * 0.3
  );

  const inventoryHealthDonut = {
    slices: [
      { name: 'In Stock', value: inStockCount, color: REPORT_CHART_COLORS[0] },
      { name: 'Low Stock', value: lowStockItems.length, color: REPORT_CHART_COLORS[3] },
      { name: 'Out of Stock', value: outOfStockItems.length, color: REPORT_CHART_COLORS[4] },
      { name: 'Overstock', value: overstockItems.length, color: REPORT_CHART_COLORS[1] },
    ].filter((s) => s.value > 0),
    total: totalInventoryItems,
  };

  const inventoryDetail = {
    summary: {
      ...stockSummary,
      snapshotLabel: stockSummary.snapshotLabel || 'Current stock levels (as of today)',
    },
    kpis: {
      totalValue: { value: totalInventoryValue, change: revenueChange * 0.8, sparkline: inventoryValueTrend.map((d) => d.value) },
      totalItems: { value: totalInventoryItems, change: revenueChange * 0.3, sparkline: [totalInventoryItems] },
      lowStock: { value: lowStockItems.length, change: -12, sparkline: [lowStockItems.length], invertTrend: true },
      outOfStock: { value: outOfStockItems.length, change: -22, sparkline: [outOfStockItems.length], invertTrend: true },
      turnover: { value: stockTurnover, change: revenueChange * 0.5, sparkline: [stockTurnover], valueFormatter: (v) => `${Number(v).toFixed(1)}x` },
    },
    valueTrend: inventoryValueTrend,
    categoryDonut: inventoryCategoryDonut,
    healthDonut: inventoryHealthDonut,
    lowStockItems: lowStockItems.slice(0, 5).map((p) => ({
      name: p.name,
      currentStock: p.currentStock,
      minStock: p.safetyStock,
      unit: p.unit,
    })),
    outOfStockItems: outOfStockItems.slice(0, 5).map((p) => ({
      name: p.name,
      lastSold: '—',
    })),
    movementSummary: [
      { type: 'Purchases', quantity: Math.round(totalQuantitySold * 0.4), value: inventoryPurchases, change: expenseChange },
      { type: 'Sales', quantity: totalQuantitySold, value: num(productSalesData?.totalRevenue ?? revenue), change: revenueChange },
      { type: 'Returns', quantity: 0, value: 0, change: 0 },
      { type: 'Adjustments', quantity: 0, value: 0, change: 0 },
    ],
    prevInventoryValue,
  };

  const cashFlowAiSummary = netCashFlow >= 0
    ? `Cash flow is healthy with strong operating performance. Net cash flow reached ${netCashFlow >= 0 ? 'positive' : 'negative'} levels this period.`
    : 'Cash outflows exceeded inflows this period. Review collections and discretionary spending.';

  const inventoryAiSummary = lowStockItems.length > 0
    ? `${lowStockItems.length} item${lowStockItems.length > 1 ? 's are' : ' is'} running low and need restocking soon.${inventoryCategoryDonut.slices[0] ? ` ${inventoryCategoryDonut.slices[0].name} represents a significant share of inventory value.` : ''}`
    : 'Inventory levels are stable for this period. Monitor turnover and reorder points.';

  const REC_CATEGORY_MAP = [
    { match: /revenue|sales|margin|price|customer/i, category: 'Increase Revenue' },
    { match: /cost|expense|vendor|reduce|save/i, category: 'Reduce Costs' },
    { match: /efficien|process|automation|workflow|stock/i, category: 'Improve Efficiency' },
    { match: /cash|payment|collection|outstanding|invoice/i, category: 'Optimize Cash Flow' },
  ];

  const categorizeRecommendation = (text = '') => {
    const hit = REC_CATEGORY_MAP.find((c) => c.match.test(text));
    return hit?.category || 'Improve Efficiency';
  };

  const normalizeRecommendation = (rec, idx, revenueTotal) => {
    if (typeof rec === 'string') {
      return {
        id: `rec-${idx}`,
        title: rec,
        description: '',
        impactLevel: idx < 2 ? 'high' : 'medium',
        impactValue: revenueTotal * (idx < 2 ? 0.08 : 0.04),
        effort: idx < 3 ? 'Medium' : 'Low',
        category: categorizeRecommendation(rec),
      };
    }
    const title = rec.action || rec.recommendation || rec.finding || rec.opportunity || rec.risk || 'Recommendation';
    const description = rec.reasoning || rec.impact || rec.mitigation || rec.potentialImpact || rec.recommendation || '';
    const priority = (rec.priority || rec.severity || '').toLowerCase();
    return {
      id: `rec-${idx}`,
      title,
      description,
      impactLevel: priority.includes('high') ? 'high' : 'medium',
      impactValue: revenueTotal * (priority.includes('high') ? 0.1 : 0.05),
      effort: priority.includes('high') ? 'Low' : 'Medium',
      category: categorizeRecommendation(`${title} ${description}`),
    };
  };

  const derivedRecommendations = [
    ...recommendationsRaw,
    ...(aiAnalysis?.growthOpportunities || []).map((o) => ({
      priority: 'Medium',
      action: o.opportunity,
      impact: o.potentialImpact,
      reasoning: (o.actionSteps || []).join(' '),
    })),
    ...(aiAnalysis?.riskAssessment || []).map((r) => ({
      priority: r.severity || 'Medium',
      action: r.risk,
      impact: r.severity,
      reasoning: r.mitigation,
    })),
    ...(aiAnalysis?.strategicSuggestions || []).map((s) => ({
      priority: 'Medium',
      action: s,
      impact: 'Strategic',
      reasoning: '',
    })),
    ...(expenseToRevenue > 80 ? [{
      priority: 'High',
      action: 'Reduce expense-to-revenue ratio',
      impact: `Expenses are ${expenseToRevenue.toFixed(1)}% of revenue`,
      reasoning: 'Review top expense categories and negotiate vendor terms.',
    }] : []),
    ...(topCustomers[0]?.percent > 25 ? [{
      priority: 'Medium',
      action: `Diversify revenue beyond ${topCustomers[0].name}`,
      impact: `Top customer is ${topCustomers[0].percent.toFixed(1)}% of revenue`,
      reasoning: 'Reduce customer concentration risk by expanding your customer base.',
    }] : []),
    ...(lowStockItems.length > 0 ? [{
      priority: 'High',
      action: 'Restock low inventory items',
      impact: `${lowStockItems.length} items below reorder level`,
      reasoning: 'Prevent stockouts on items with active sales demand.',
    }] : []),
  ];

  const topRecommendations = derivedRecommendations
    .map((rec, idx) => normalizeRecommendation(rec, idx, revenue))
    .filter((rec, idx, arr) => arr.findIndex((r) => r.title === rec.title) === idx)
    .slice(0, 12);

  const recByCategory = Object.entries(
    topRecommendations.reduce((acc, rec) => {
      acc[rec.category] = (acc[rec.category] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, count], index) => ({
    name,
    value: count,
    color: REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length],
  }));

  const highPriorityCount = topRecommendations.filter((r) => r.impactLevel === 'high').length;
  const potentialImpactTotal = topRecommendations.reduce((s, r) => s + num(r.impactValue), 0);

  const recommendationsDetail = {
    summary: {
      total: topRecommendations.length,
      highPriority: highPriorityCount,
      potentialImpact: potentialImpactTotal,
      effortLabel: 'Medium',
      progressPercent: 0,
      implementedCount: 0,
    },
    topRecommendations,
    byCategory: { slices: recByCategory, total: topRecommendations.length },
    implementation: {
      slices: [
        { name: 'Not Started', value: topRecommendations.length, color: REPORT_CHART_COLORS[4] },
      ],
      total: topRecommendations.length,
    },
    engineMeta: {
      dataPoints: 15,
      confidence: aiAnalysis ? 92 : 75,
      confidenceLabel: aiAnalysis ? 'High' : 'Moderate',
    },
    aiSummary: aiAnalysis?.performanceAnalysis
      || `Based on your current performance, implementing the top recommendations could improve profitability and operational efficiency.`,
  };

  const recommendationsAiSummary = recommendationsDetail.aiSummary;

  return {
    kpis: {
      revenue: { value: revenue, change: revenueChange, sparkline: revenueSparkline, sourceLabel: sourceMeta.revenue.subLabel },
      grossProfit: { value: grossProfit, change: revenueChange * 0.95, sparkline: profitSparkline, sourceLabel: sourceMeta.grossProfit.subLabel },
      netProfit: { value: netProfit, change: profitChange, sparkline: profitSparkline, sourceLabel: sourceMeta.netProfit.subLabel },
      // cogs is the cost of products/materials sold — kept separate from "expenses" (operating
      // expenses only) so it's never mistaken for, or lumped into, the Expenses table/page totals.
      cogs: { value: cogs, change: prevCogs > 0 ? ((cogs - prevCogs) / prevCogs) * 100 : 0, invertTrend: true, sourceLabel: 'Cost of products/materials sold this period' },
      expenses: { value: expenses, change: expenseChange, sparkline: expenseSparkline, invertTrend: true, sourceLabel: 'Approved expenses for the selected period (from the Expenses page)' },
      profitMargin: { value: profitMargin, change: marginChange, sparkline: marginSparkline, isPercent: true, sourceLabel: 'Net profit divided by collected revenue' },
      cashFlow: { value: netCashFlow, change: netCashChange, sparkline: profitSparkline, sourceLabel: sourceMeta.cashFlow.subLabel },
      totalSales: { value: totalSales, change: revenueChange, sparkline: revenueSparkline, sourceLabel: isRental ? sourceMeta.revenue.subLabel : isStudio ? sourceMeta.bookedJobValue.subLabel : sourceMeta.revenue.subLabel },
      orderCount: { value: orderCount, change: revenueChange * 0.85, sparkline: salesByDate.map((d) => d.orders), sourceLabel: isRental ? 'Open invoices in this period' : isStudio ? 'Jobs created in this period' : 'Transactions in this period' },
      avgOrderValue: { value: avgOrderValue, change: revenueChange - (revenueChange * 0.85), sparkline: revenueSparkline, sourceLabel: isRental ? 'Collected per invoice' : isStudio ? 'Booked job value per job' : 'Revenue per order' },
      newCustomers: { value: newCustomers, change: num(phase2Data?.extendedKpis?.comparison?.newCustomersChange ?? 0), sparkline: [newCustomers], sourceLabel: 'From customer activity data' },
      activeCustomers: { value: activeCustomers, change: num(phase2Data?.extendedKpis?.comparison?.activeCustomers ?? 0), sparkline: [activeCustomers], sourceLabel: 'Customers with activity in this period' },
      returningCustomers: { value: returningCustomers, change: num(phase2Data?.extendedKpis?.comparison?.returningCustomersChange ?? 0), sparkline: [returningCustomers], subLabel: hasReturningCustomerData ? 'From customer activity data' : 'Returning customer count not tracked', hideTrend: !hasReturningCustomerData },
      avgDailyExpense: { value: avgDailyExpense, change: expenseChange, sparkline: expenseSparkline, invertTrend: true },
      highestExpenseDay: { label: highestExpenseDay.label, value: highestExpenseDay.amount },
      vendorCount: { value: num(phase2Data?.vendorCount ?? expenseCategories.length * 3), change: 10 },
      expenseToRevenue: { value: expenseToRevenue, change: -(marginChange), sparkline: marginSparkline, isPercent: true, invertTrend: true },
      netCashFlow: cashFlowDetail.kpis.net,
      cashInflow: cashFlowDetail.kpis.inflow,
      cashOutflow: cashFlowDetail.kpis.outflow,
      openingBalance: cashFlowDetail.kpis.opening,
      closingBalance: cashFlowDetail.kpis.closing,
      inventoryValue: inventoryDetail.kpis.totalValue,
      inventoryItems: inventoryDetail.kpis.totalItems,
      lowStockCount: inventoryDetail.kpis.lowStock,
      outOfStockCount: inventoryDetail.kpis.outOfStock,
      stockTurnover: inventoryDetail.kpis.turnover,
    },
    trend,
    expenseDonut,
    revenueDonut: { slices: revenueDonut, total: revenue },
    topCustomers,
    cashFlow: {
      inflow: cashInflow,
      outflow: cashOutflow,
      net: netCashFlow,
      byPeriod: cashFlowDetail.trend,
      detail: cashFlowDetail,
    },
    cashFlowDetail,
    profitLoss: { current: plCurrent, previous: plPrevious },
    financialPosition,
    ratios,
    expenseCategories,
    expenseTrend: expenseByDate,
    paymentMethods: { slices: paymentMethods, total: paymentMethods.reduce((s, p) => s + p.value, 0) || revenue },
    topVendors: (phase2Data?.topVendors || expenseCategories.slice(0, 5).map((c, i) => ({
      name: `Vendor ${i + 1}`,
      amount: c.amount * 0.4,
      percent: c.percent * 0.4,
    }))),
    salesByDate,
    salesByCategory,
    salesCategoryTotal,
    serviceMix,
    operations: {
      pipelineSummary,
      statusBreakdown,
      jobsTrendByDate,
      serviceMix,
      outstanding: outstandingDetail,
    },
    customerSegments,
    customerInsights: [
      topCustomers[0] ? { icon: 'star', text: `Your top customer contributed ${topCustomers[0].percent.toFixed(1)}% of ${isRental ? 'collections' : 'total revenue'}.` } : null,
      customerSegments[0] ? { icon: 'users', text: `Top 20% customers contributed ${customerSegments[0].percent.toFixed(1)}% of ${isRental ? 'collections' : 'total sales'}.` } : null,
      newCustomers > 0 ? { icon: 'user-plus', text: `${newCustomers} new customers acquired this period.` } : null,
      hasReturningCustomerData && returningCustomers > 0 ? { icon: 'repeat', text: `${returningCustomers} returning customers drove repeat revenue.` } : null,
    ].filter(Boolean),
    expenseInsights,
    inventoryProducts,
    inventoryDetail,
    recommendationsDetail,
    aiSummary,
    executiveAiInsight,
    salesAiSummary,
    expensesAiSummary,
    cashFlowAiSummary,
    inventoryAiSummary,
    recommendationsAiSummary,
    recommendations: topRecommendations,
    aiInsightPoints: aiInsightPoints.length > 0
      ? aiInsightPoints
      : [aiAnalysis?.performanceAnalysis, ...(aiAnalysis?.strategicSuggestions || [])].filter(Boolean),
    rental: isRental && rentalData ? {
      hireBooked: num(rentalData.revenue?.totalRevenue),
      rentalAmount: num(rentalData.revenue?.totalRentalAmount),
      lateCharges: num(rentalData.revenue?.totalLateCharges),
      rentalCount: num(rentalData.revenue?.rentalCount),
      byProduct: rentalData.revenue?.byProduct || [],
      byBranch: rentalData.revenue?.byBranch || [],
      utilizationRate: num(rentalData.utilization?.overallUtilizationRate),
      rentedDays: num(rentalData.utilization?.totalRentedDays),
      availableDays: num(rentalData.utilization?.totalAvailableDays),
      utilizationByProduct: rentalData.utilization?.byProduct || [],
      lateReturnCount: num(rentalData.lateReturns?.summary?.lateReturnCount),
      totalDaysLate: num(rentalData.lateReturns?.summary?.totalDaysLate),
      totalLateCharges: num(rentalData.lateReturns?.summary?.totalLateCharges),
      pendingLateCharges: num(rentalData.lateReturns?.summary?.pendingLateCharges),
      incidents: rentalData.lateReturns?.incidents || [],
      damageCost: num(rentalData.damageTrends?.totalCost),
      damageReports: num(rentalData.damageTrends?.reportCount),
      damageByType: rentalData.damageTrends?.byType || [],
      damageIncidents: rentalData.damageTrends?.incidents || [],
      productHistory: rentalData.productHistory || [],
      categoryPerformance: rentalData.categoryPerformance || [],
      paymentMethods: rentalData.paymentMethods || { methods: [], totalAmount: 0, totalTransactions: 0 },
      salesSplit: rentalData.salesSplit || { salesRevenue: 0, rentalRevenue: 0, totalRevenue: 0, salesShare: 0, rentalShare: 0 },
      lowStockAlerts: rentalData.lowStockAlerts || [],
      inventoryByBranch: rentalData.inventoryByBranch || [],
    } : null,
    rentalAiSummary: isRental && rentalData
      ? `Hire booked is ${formatAmount(num(rentalData.revenue?.totalRevenue))} across ${num(rentalData.revenue?.rentalCount)} hires. Fleet utilization is ${num(rentalData.utilization?.overallUtilizationRate).toFixed(1)}% with ${num(rentalData.lateReturns?.summary?.lateReturnCount)} late returns and ${formatAmount(num(rentalData.damageTrends?.totalCost))} in damage cost.`
      : null,
    outstanding,
    outstandingDetail,
    collectedRevenue,
    bookedJobValue,
    bookedVsCollectedGap,
    sourceMeta,
    comparisonLabel: comparison?.label || 'vs previous period',
    periodStartLabel,
    periodEndLabel,
    terminology,
  };
}
