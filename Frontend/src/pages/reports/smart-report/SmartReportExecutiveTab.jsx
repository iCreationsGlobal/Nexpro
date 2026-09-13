import {
  CircleDollarSign,
  Percent,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { formatOverviewCurrency } from '../overview/overviewUtils';
import RevenueExpensesTrendChart from '../overview/RevenueExpensesTrendChart';
import DonutBreakdownCard from './DonutBreakdownCard';
import TopCustomersTable from '../overview/TopCustomersTable';
import CashFlowSummaryCard from '../overview/CashFlowSummaryCard';
import AIQuickInsightsCard from '../overview/AIQuickInsightsCard';
import SmartReportKpiRow from './SmartReportKpiRow';
import SmartReportSectionHeader from './SmartReportSectionHeader';

/**
 * Executive Summary tab — matches first Smart Report mockup.
 */
export default function SmartReportExecutiveTab({ snapshot, periodLabel, isRental = false }) {
  const { kpis, trend, expenseDonut, topCustomers, cashFlow, executiveAiInsight, comparisonLabel } = snapshot;
  const revenue = kpis.revenue.value;

  const kpiItems = [
    { label: isRental ? 'Collected' : 'Total Revenue', value: kpis.revenue.value, change: kpis.revenue.change, sparklineData: kpis.revenue.sparkline, icon: CircleDollarSign, iconBgColor: '#dcfce7', iconColor: '#166534', comparisonLabel, sourceLabel: kpis.revenue.sourceLabel },
    { label: 'Net Profit', value: kpis.netProfit.value, change: kpis.netProfit.change, sparklineData: kpis.netProfit.sparkline, icon: TrendingUp, iconBgColor: '#dcfce7', iconColor: '#166534', comparisonLabel, sourceLabel: kpis.netProfit.sourceLabel },
    { label: 'Profit Margin', value: kpis.profitMargin.value, change: kpis.profitMargin.change, sparklineData: kpis.profitMargin.sparkline, valueFormatter: (v) => `${Number(v).toFixed(1)}%`, icon: Percent, iconBgColor: '#dcfce7', iconColor: '#166534', comparisonLabel, sourceLabel: kpis.profitMargin.sourceLabel },
    { label: 'Operating Expenses', value: kpis.expenses.value, change: kpis.expenses.change, sparklineData: kpis.expenses.sparkline, invertTrend: true, icon: Receipt, iconBgColor: '#fee2e2', iconColor: '#b91c1c', comparisonLabel, sourceLabel: kpis.expenses.sourceLabel },
    { label: 'Cash Flow', value: kpis.cashFlow.value, change: kpis.cashFlow.change, sparklineData: kpis.cashFlow.sparkline, icon: Wallet, iconBgColor: '#dcfce7', iconColor: '#166534', comparisonLabel, sourceLabel: kpis.cashFlow.sourceLabel },
  ];

  return (
    <div className="space-y-6">
      <SmartReportSectionHeader
        title="Executive Summary"
        description="High-level performance snapshot for the period."
        periodLabel={periodLabel}
      />
      <SmartReportKpiRow items={kpiItems} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueExpensesTrendChart data={trend} />
        <DonutBreakdownCard
          title="Expenses by Category"
          slices={expenseDonut.slices}
          total={expenseDonut.total}
          centerLabel="Total Expenses"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopCustomersTable
          customers={topCustomers.map((c) => ({
            customerId: c.id,
            totalRevenue: c.revenue,
            customer: { name: c.name },
          }))}
          totalRevenue={revenue}
          title={isRental ? 'Top Customers by Collections' : 'Top Customers by Revenue'}
          amountColumnLabel={isRental ? 'Collected' : 'Revenue'}
        />
        <CashFlowSummaryCard cashFlow={{
          operating: {
            cashReceivedFromCustomers: cashFlow.inflow,
            cashPaidToSuppliersAndExpenses: cashFlow.outflow,
            netCashFromOperatingActivities: cashFlow.net,
          },
          netChangeInCash: cashFlow.net,
        }} />
        <AIQuickInsightsCard insights={[executiveAiInsight]} />
      </div>
    </div>
  );
}
