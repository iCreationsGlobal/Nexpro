import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CircleDollarSign,
  FileText,
  Gauge,
  Package,
  Percent,
  Receipt,
  UserPlus,
  Users,
  Wallet
} from 'lucide-react';
import OverviewHeader from './OverviewHeader';
import OverviewKpiCard from './OverviewKpiCard';
import OverviewSecondaryKpiCard from './OverviewSecondaryKpiCard';
import MiniSparkline from './MiniSparkline';
import RevenueExpensesTrendChart from './RevenueExpensesTrendChart';
import RevenueByCategoryChart from './RevenueByCategoryChart';
import AIQuickInsightsCard from './AIQuickInsightsCard';
import TopCustomersTable from './TopCustomersTable';
import ProfitLossSummaryCard from './ProfitLossSummaryCard';
import CashFlowSummaryCard from './CashFlowSummaryCard';
import OutstandingPaymentsList from './OutstandingPaymentsList';
import BusinessHealthFooter from './BusinessHealthFooter';
import { buildAskAiUrl } from '../../../utils/buildAskAiUrl';
import { formatPeriodLabel } from '../../../utils/formatPeriodLabel';
import {
  buildOverviewInsights,
  buildProfitSparkline,
  buildRevenueByCategory,
  buildRevenueExpenseTrend,
  buildSparklineSeries,
  deriveBusinessHealth,
  getOverdueInvoices
} from './overviewUtils';

/**
 * Executive Reports Overview dashboard matching the product mockup.
 */
export default function ReportsOverviewDashboard({
  overviewStats,
  dateRange,
  dateFilter,
  onDateRangeSelect,
  onPresetSelect,
  onCustomize,
  onDownload,
  downloading = false,
  isShop = false,
  isPharmacy = false,
  isStudio = false
}) {
  const navigate = useNavigate();
  const isRetail = isShop || isPharmacy;

  const askAiUrl = useMemo(
    () => buildAskAiUrl({
      from: 'reports',
      startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
      endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
      periodLabel: formatPeriodLabel(dateFilter, dateRange),
    }),
    [dateFilter, dateRange]
  );

  const {
    revenue,
    expenses,
    outstanding,
    sales,
    serviceAnalytics,
    productSales,
    topCustomers,
    extendedKpis,
    profitLossDetail,
    cashFlow,
    comparisonLabel = 'vs previous period'
  } = overviewStats || {};

  const current = extendedKpis?.current || {};
  const comparison = extendedKpis?.comparison || {};
  const metricSource = current.metricSource || profitLossDetail?.source || 'operational';
  const isAccountingMetricSource = metricSource === 'accounting';
  const hasAccountingMismatch = profitLossDetail?.accountingSource === 'accounting'
    && profitLossDetail?.profitLossAlignsWithCollections === false
    && !isAccountingMetricSource;
  const metricSourceLabel = isAccountingMetricSource
    ? 'Accounting basis'
    : hasAccountingMismatch
      ? 'Operational basis; accounting P&L differs'
      : 'Operational basis';

  const retailRevenueFloor = isRetail
    ? Math.max(
        revenue?.totalRevenue || 0,
        sales?.totalSales || 0,
        productSales?.totalRevenue || 0
      )
    : 0;

  const totalRevenue = isRetail && !isAccountingMetricSource
    ? Math.max(current.totalRevenue ?? 0, retailRevenueFloor)
    : (current.totalRevenue ?? profitLossDetail?.revenue ?? revenue?.totalRevenue ?? 0);
  const cogs = current.cogs ?? profitLossDetail?.cogs ?? 0;
  const totalExpenses = current.totalExpenses ?? profitLossDetail?.expenses ?? expenses?.totalExpenses ?? 0;
  const operatingExpenses = current.operatingExpenses
    ?? profitLossDetail?.operatingExpenses
    ?? Math.max(0, totalExpenses - cogs);
  const grossProfit = current.grossProfit ?? (totalRevenue - cogs);
  const netProfit = current.netProfit ?? (totalRevenue - totalExpenses);
  const grossProfitMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100) : 0;
  const netProfitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;

  const trendData = useMemo(
    () => buildRevenueExpenseTrend(revenue, expenses),
    [revenue, expenses]
  );

  const categoryData = useMemo(
    () => buildRevenueByCategory({
      totalRevenue,
      serviceAnalytics,
      productSales,
      isShop,
      isPharmacy,
      isStudio
    }),
    [totalRevenue, serviceAnalytics, productSales, isShop, isPharmacy, isStudio]
  );

  const revenueSparkline = useMemo(
    () => buildSparklineSeries(revenue?.byPeriod || [], 'totalRevenue'),
    [revenue?.byPeriod]
  );

  const expenseSparkline = useMemo(
    () => buildSparklineSeries(expenses?.byDate || [], 'totalAmount'),
    [expenses?.byDate]
  );

  const profitSparkline = useMemo(() => buildProfitSparkline(trendData), [trendData]);

  const marginSparkline = useMemo(() => {
    if (!trendData.length) return [0];
    return trendData.map((d) => {
      const rev = d.revenue || 0;
      return rev > 0 ? ((rev - (d.expenses || 0)) / rev) * 100 : 0;
    });
  }, [trendData]);

  const insights = useMemo(
    () => buildOverviewInsights({
      totalRevenue,
      // Use operating expenses (not the COGS-inclusive totalExpenses) so this insight reflects
      // controllable overhead rather than COGS, which naturally scales with sales volume.
      totalExpenses: operatingExpenses,
      revenueChange: comparison.totalRevenue ?? 0,
      expenseChange: comparison.operatingExpenses ?? 0,
      topCustomers,
      outstanding,
      collectionRate: current.collectionRate ?? 0,
      isShop,
      isPharmacy,
      productSales
    }),
    [totalRevenue, operatingExpenses, comparison, topCustomers, outstanding, current.collectionRate, isShop, isPharmacy, productSales]
  );

  const overdueInvoices = useMemo(
    () => getOverdueInvoices(outstanding?.invoices, 5),
    [outstanding?.invoices]
  );

  const health = useMemo(
    () => deriveBusinessHealth({
      netProfitMargin,
      collectionRate: current.collectionRate ?? 0,
      outstanding,
      totalRevenue,
      revenueChange: comparison.totalRevenue ?? 0
    }),
    [netProfitMargin, current.collectionRate, outstanding, totalRevenue, comparison.totalRevenue]
  );

  const plData = useMemo(() => ({
    revenue: totalRevenue,
    cogs,
    expenses: totalExpenses,
    operatingExpenses,
    grossProfit,
    netProfit,
    source: metricSource
  }), [totalRevenue, cogs, totalExpenses, operatingExpenses, grossProfit, netProfit, metricSource]);

  const averageValueLabel = isRetail ? 'Average Sale Value' : 'Average Invoice Value';
  const topCustomersTitle = isRetail ? 'Top Customers by Sales' : 'Top Customers by Revenue';

  const Sparkline = ({ data, positive }) => (
    <MiniSparkline data={data} positive={positive} />
  );

  return (
    <div id="overview-report-content">
      <OverviewHeader
        dateRange={dateRange}
        onDateRangeSelect={onDateRangeSelect}
        onPresetSelect={onPresetSelect}
        activePreset={dateFilter}
        onCustomize={onCustomize}
        onDownload={onDownload}
        downloading={downloading}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4 mb-4">
        <OverviewKpiCard
          label="Total Revenue"
          value={totalRevenue}
          change={comparison.totalRevenue}
          comparisonLabel={comparisonLabel}
          sparklineData={revenueSparkline}
          SparklineChart={Sparkline}
          sourceLabel={metricSourceLabel}
          icon={Wallet}
          iconBgColor="#dcfce7"
          iconColor="#166534"
        />
        {isRetail && (
          <>
            {/* Cost of Goods Sold is the cost of products/materials sold — it is NOT an entry in the
                Expenses table/page, so it gets its own card and must never be labeled "Expenses". */}
            <OverviewKpiCard
              label="Cost of Goods Sold"
              value={cogs}
              change={comparison.cogs}
              comparisonLabel={comparisonLabel}
              invertTrend
              sourceLabel="Cost of products/materials sold this period"
              icon={Package}
              iconBgColor="#ffedd5"
              iconColor="#c2410c"
            />
          </>
        )}
        <OverviewKpiCard
          label="Operating Expenses"
          value={operatingExpenses}
          change={comparison.operatingExpenses}
          comparisonLabel={comparisonLabel}
          sparklineData={expenseSparkline}
          SparklineChart={Sparkline}
          invertTrend
          sourceLabel="From the Expenses page (approved, non-archived)"
          icon={Receipt}
          iconBgColor="#fee2e2"
          iconColor="#b91c1c"
        />
        <OverviewKpiCard
          label="Net Profit"
          value={netProfit}
          change={comparison.netProfit}
          comparisonLabel={comparisonLabel}
          sparklineData={profitSparkline}
          SparklineChart={Sparkline}
          sourceLabel={metricSourceLabel}
          icon={CircleDollarSign}
          iconBgColor="#dcfce7"
          iconColor="#166534"
        />
        <OverviewKpiCard
          label="Gross Profit Margin"
          value={grossProfitMargin}
          valueFormatter={(v) => `${Number(v).toFixed(1)}%`}
          change={comparison.grossProfitMargin}
          comparisonLabel={comparisonLabel}
          sparklineData={marginSparkline}
          SparklineChart={Sparkline}
          sourceLabel={metricSourceLabel}
          icon={Percent}
          iconBgColor="#f3e8ff"
          iconColor="#7e22ce"
        />
        <OverviewKpiCard
          label="Net Profit Margin"
          value={netProfitMargin}
          valueFormatter={(v) => `${Number(v).toFixed(1)}%`}
          change={comparison.netProfitMargin}
          comparisonLabel={comparisonLabel}
          sparklineData={marginSparkline}
          SparklineChart={Sparkline}
          sourceLabel={metricSourceLabel}
          icon={Percent}
          iconBgColor="#dbeafe"
          iconColor="#1d4ed8"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4 mb-4">
        <div className="lg:col-span-6">
          <RevenueExpensesTrendChart data={trendData} />
        </div>
        <div className="lg:col-span-3">
          <RevenueByCategoryChart
            data={categoryData}
            totalRevenue={totalRevenue}
            onViewFullReport={() => navigate('/compliance/statements')}
          />
        </div>
        <div className="lg:col-span-3">
          <AIQuickInsightsCard
            insights={insights}
            onViewAll={() => navigate(askAiUrl)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 md:gap-4 mb-4">
        <OverviewSecondaryKpiCard
          label="New Customers"
          value={current.newCustomers ?? 0}
          valueFormatter={(v) => String(v)}
          change={comparison.newCustomers}
          comparisonLabel={comparisonLabel}
          icon={UserPlus}
          iconBgColor="#dcfce7"
          iconColor="#166534"
        />
        <OverviewSecondaryKpiCard
          label="Active Customers"
          value={current.activeCustomers ?? 0}
          valueFormatter={(v) => String(v)}
          change={comparison.activeCustomers}
          comparisonLabel={comparisonLabel}
          icon={Users}
          iconBgColor="#dbeafe"
          iconColor="#1d4ed8"
        />
        <OverviewSecondaryKpiCard
          label={averageValueLabel}
          value={current.averageInvoiceValue ?? 0}
          change={comparison.averageInvoiceValue}
          comparisonLabel={comparisonLabel}
          icon={FileText}
          iconBgColor="#f3e8ff"
          iconColor="#7e22ce"
        />
        <OverviewSecondaryKpiCard
          label={isRetail ? 'Payment Collection' : 'Collection Rate'}
          value={current.collectionRate ?? 0}
          valueFormatter={(v) => `${Number(v).toFixed(1)}%`}
          change={comparison.collectionRate}
          comparisonLabel={comparisonLabel}
          icon={Gauge}
          iconBgColor="#dcfce7"
          iconColor="#166534"
        />
        <OverviewSecondaryKpiCard
          label={isRetail ? 'Outstanding Balance' : 'Outstanding Invoices'}
          value={current.outstandingAmount ?? outstanding?.totalOutstanding ?? 0}
          change={comparison.outstandingAmount}
          comparisonLabel={comparisonLabel}
          highlightNegative
          icon={AlertCircle}
          iconBgColor="#ffedd5"
          iconColor="#c2410c"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-4">
        <TopCustomersTable
          customers={topCustomers}
          totalRevenue={totalRevenue}
          title={topCustomersTitle}
        />
        <ProfitLossSummaryCard
          profitLoss={plData}
          showCogs={isRetail}
          onViewFullReport={() => navigate('/compliance/statements')}
        />
        <CashFlowSummaryCard
          cashFlow={cashFlow}
          onViewFullReport={() => navigate('/compliance/statements')}
        />
        <OutstandingPaymentsList
          invoices={overdueInvoices}
          onViewAll={() => navigate('/invoices')}
        />
      </div>

      <BusinessHealthFooter
        health={health}
        onViewReport={() => navigate('/reports/smart-report')}
      />
    </div>
  );
}
