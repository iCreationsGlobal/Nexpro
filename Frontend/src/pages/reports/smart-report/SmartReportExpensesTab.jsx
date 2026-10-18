import {
  Calendar,
  Percent,
  Receipt,
  Store,
  TrendingDown,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OVERVIEW_CARD_BORDER, formatOverviewCurrency, formatPercentChange } from '../overview/overviewUtils';
import DonutBreakdownCard from './DonutBreakdownCard';
import SmartReportKpiRow from './SmartReportKpiRow';
import SmartReportSectionHeader from './SmartReportSectionHeader';

/**
 * Expenses tab — matches mockup.
 */
export default function SmartReportExpensesTab({ snapshot, periodLabel }) {
  const {
    kpis,
    expenseTrend,
    expenseDonut,
    paymentMethods,
    expenseCategories,
    topVendors,
    comparisonLabel,
  } = snapshot;

  const kpiItems = [
    { label: 'Total Expenses', value: kpis.expenses.value, change: kpis.expenses.change, sparklineData: kpis.expenses.sparkline, invertTrend: true, icon: Receipt, iconBgColor: '#fee2e2', iconColor: '#b91c1c', comparisonLabel },
    { label: 'Average Daily Expense', value: kpis.avgDailyExpense.value, change: kpis.avgDailyExpense.change, sparklineData: kpis.avgDailyExpense.sparkline, invertTrend: true, icon: Calendar, iconBgColor: '#f3e8ff', iconColor: '#7c3aed', comparisonLabel },
    {
      label: 'Highest Expense Day',
      value: kpis.highestExpenseDay.value,
      change: 0,
      sparklineData: kpis.expenses.sparkline,
      valueFormatter: () => `${kpis.highestExpenseDay.label} · ${formatOverviewCurrency(kpis.highestExpenseDay.value)}`,
      icon: TrendingDown,
      iconBgColor: '#ffedd5',
      iconColor: '#c2410c',
      comparisonLabel: '',
    },
    { label: 'Total Vendors', value: kpis.vendorCount.value, change: kpis.vendorCount.change, sparklineData: [kpis.vendorCount.value], icon: Store, iconBgColor: '#dbeafe', iconColor: '#1d4ed8', comparisonLabel },
    { label: 'Expenses to Revenue', value: kpis.expenseToRevenue.value, change: kpis.expenseToRevenue.change, sparklineData: kpis.expenseToRevenue.sparkline, valueFormatter: (v) => `${Number(v).toFixed(1)}%`, invertTrend: true, icon: Percent, iconBgColor: '#dcfce7', iconColor: '#166534', comparisonLabel },
  ];

  const trendChartData = expenseTrend.map((d) => ({
    period: d.label,
    expenses: d.amount,
    avgDaily: kpis.avgDailyExpense.value,
  }));

  return (
    <div className="space-y-6">
      <SmartReportSectionHeader
        title="Expenses Overview"
        description="Understand where your money is going and how costs are trending."
        periodLabel={periodLabel}
      />
      <SmartReportKpiRow items={kpiItems} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card xl:col-span-1">
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Expenses Trend</CardTitle>
            <Button variant="link" className="h-auto p-0 text-xs text-primary">View Detailed Expense Trend</Button>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {trendChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip
                    formatter={(v, _name, { dataKey }) => [
                      formatOverviewCurrency(v),
                      dataKey === 'expenses' ? 'Expenses' : 'Avg daily'
                    ]}
                  />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#b91c1c" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="avgDaily" name="Avg daily" stroke="#2563eb" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">No expense trend data</div>
            )}
          </CardContent>
        </Card>

        <DonutBreakdownCard
          title="Expenses by Category"
          slices={expenseDonut.slices}
          total={expenseDonut.total}
          centerLabel="Total Expenses"
          viewLabel="View Category Analysis"
        />

        <DonutBreakdownCard
          title="Expenses by Payment Method"
          slices={paymentMethods.slices}
          total={paymentMethods.total}
          centerLabel="Total"
          viewLabel="View Payment Method Analysis"
          emptyMessage="Payment method breakdown not available for this period"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Top Expense Categories</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseCategories.slice(0, 5).map((c) => (
                  <TableRow key={c.category}>
                    <TableCell>{c.category}</TableCell>
                    <TableCell className="text-right">{formatOverviewCurrency(c.amount)}</TableCell>
                    <TableCell className="text-right">{c.percent.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Top Vendors by Expenses</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {topVendors?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topVendors.slice(0, 5).map((v, idx) => (
                    <TableRow key={v.name || idx}>
                      <TableCell>{v.name}</TableCell>
                      <TableCell className="text-right">{formatOverviewCurrency(v.amount)}</TableCell>
                      <TableCell className="text-right">{Number(v.percent || 0).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">No vendor expense data</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
