import {
  CircleDollarSign,
  Package,
  Percent,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { OVERVIEW_CARD_BORDER, formatOverviewCurrency, formatPercentChange } from '../overview/overviewUtils';
import DonutBreakdownCard from './DonutBreakdownCard';
import SmartReportKpiRow from './SmartReportKpiRow';
import SmartReportSectionHeader from './SmartReportSectionHeader';

const PL_ROWS_RETAIL = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'cogs', label: 'Cost of Goods Sold', negative: true },
  { key: 'grossProfit', label: 'Gross Profit', bold: true },
  { key: 'operatingExpenses', label: 'Operating Expenses', negative: true },
  { key: 'otherIncome', label: 'Other Income' },
  { key: 'otherExpenses', label: 'Other Expenses', negative: true },
  { key: 'netProfit', label: 'Net Profit', bold: true, highlight: true },
];

const PL_ROWS_STUDIO = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'operatingExpenses', label: 'Operating Expenses', negative: true },
  { key: 'otherIncome', label: 'Other Income' },
  { key: 'otherExpenses', label: 'Other Expenses', negative: true },
  { key: 'netProfit', label: 'Net Profit', bold: true, highlight: true },
];

function ratioBadge(status) {
  if (status === 'good') return <Badge className="bg-primary/10 text-primary border-0">Good</Badge>;
  if (status === 'average') return <Badge className="bg-amber-100 text-amber-800 border-0">Average</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-0">Needs attention</Badge>;
}

/**
 * Financial Overview tab — matches mockup.
 */
export default function SmartReportFinancialTab({
  snapshot,
  periodLabel,
  isShop = false,
  isPharmacy = false,
  isRental = false,
}) {
  const { kpis, profitLoss, revenueDonut, expenseDonut, financialPosition, ratios, comparisonLabel } = snapshot;
  const current = profitLoss.current;
  const previous = profitLoss.previous;
  const isRetail = isShop || isPharmacy;
  const plRows = (isRetail ? PL_ROWS_RETAIL : PL_ROWS_STUDIO).map((row) => (
    isRental && row.key === 'revenue' ? { ...row, label: 'Collected' } : row
  ));

  const rental = snapshot.rental || {};
  const salesSplit = rental.salesSplit || {};
  const paymentMethods = rental.paymentMethods || { methods: [], totalAmount: 0, totalTransactions: 0 };
  const hireBooked = rental.hireBooked || 0;
  const rentalExpenseShare = hireBooked > 0 ? (kpis.expenses.value / hireBooked) * 100 : 0;
  const hireProfit = hireBooked - (kpis.expenses.value || 0);
  const hireMargin = hireBooked > 0 ? (hireProfit / hireBooked) * 100 : 0;

  const kpiItems = isRental ? [
    { label: 'Total Revenue', value: salesSplit.totalRevenue || hireBooked, hideTrend: true, subLabel: `${rental.rentalCount || 0} transactions`, icon: CircleDollarSign, iconBgColor: '#dcfce7', iconColor: '#166534' },
    { label: 'Sales Revenue', value: salesSplit.salesRevenue || 0, hideTrend: true, subLabel: `${Number(salesSplit.salesShare || 0).toFixed(1)}% of total`, icon: CircleDollarSign, iconBgColor: '#dbeafe', iconColor: '#1d4ed8' },
    { label: 'Rental Revenue', value: salesSplit.rentalRevenue || hireBooked, hideTrend: true, subLabel: `${Number(salesSplit.rentalShare || 100).toFixed(1)}% of total`, icon: CircleDollarSign, iconBgColor: '#dcfce7', iconColor: '#166534' },
    { label: 'Total Expenses', value: kpis.expenses.value, hideTrend: true, subLabel: `${rentalExpenseShare.toFixed(1)}% of revenue`, icon: Receipt, iconBgColor: '#fee2e2', iconColor: '#b91c1c' },
  ] : [
    { label: 'Total Revenue', value: kpis.revenue.value, change: kpis.revenue.change, sparklineData: kpis.revenue.sparkline, icon: CircleDollarSign, comparisonLabel, sourceLabel: kpis.revenue.sourceLabel },
    { label: 'Gross Profit', value: kpis.grossProfit.value, change: kpis.grossProfit.change, sparklineData: kpis.grossProfit.sparkline, icon: TrendingUp, comparisonLabel, sourceLabel: kpis.grossProfit.sourceLabel },
    { label: 'Net Profit', value: kpis.netProfit.value, change: kpis.netProfit.change, sparklineData: kpis.netProfit.sparkline, icon: TrendingUp, comparisonLabel, sourceLabel: kpis.netProfit.sourceLabel },
    ...(isRetail ? [
      { label: 'Cost of Goods Sold', value: kpis.cogs.value, change: kpis.cogs.change, invertTrend: true, icon: Package, comparisonLabel, sourceLabel: kpis.cogs.sourceLabel },
    ] : []),
    { label: 'Operating Expenses', value: kpis.expenses.value, change: kpis.expenses.change, sparklineData: kpis.expenses.sparkline, invertTrend: true, icon: Receipt, comparisonLabel, sourceLabel: kpis.expenses.sourceLabel },
    { label: 'Profit Margin', value: kpis.profitMargin.value, change: kpis.profitMargin.change, sparklineData: kpis.profitMargin.sparkline, valueFormatter: (v) => `${Number(v).toFixed(1)}%`, icon: Percent, comparisonLabel, sourceLabel: kpis.profitMargin.sourceLabel },
  ];

  return (
    <div className="space-y-6">
      <SmartReportSectionHeader
        title={isRental ? 'Financial Reports' : 'Financial Overview'}
        description={isRental
          ? 'Hire booked versus product sales, expenses, profit, and payment methods.'
          : 'A detailed look at your financial performance and position.'}
        periodLabel={periodLabel}
      />
      <SmartReportKpiRow items={kpiItems} />

      {isRental && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-base font-semibold">Profit Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xs text-muted-foreground">Net Profit · Revenue − Expenses</p>
              <p className="text-2xl font-semibold mt-1">{formatOverviewCurrency(hireProfit)}</p>
              <p className="text-sm text-muted-foreground">{hireMargin.toFixed(2)}% margin</p>
            </CardContent>
          </Card>
          <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-base font-semibold">Revenue Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Sales</span><span>{formatOverviewCurrency(salesSplit.salesRevenue)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Rentals</span><span>{formatOverviewCurrency(salesSplit.rentalRevenue || hireBooked)}</span></div>
            </CardContent>
          </Card>
          <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-base font-semibold">Financial Health</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Profit Margin</span><span>{hireMargin.toFixed(2)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Transactions</span><span>{Number(rental.rentalCount || 0).toLocaleString()}</span></div>
            </CardContent>
          </Card>
        </div>
      )}

      {isRental && (
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Payment Method Statistics</CardTitle>
            <p className="text-xs text-muted-foreground">Breakdown of hire booked by payment method</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {(paymentMethods.methods || []).length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {paymentMethods.methods.map((method) => (
                    <div key={method.method} className="rounded-lg border border-border p-3">
                      <p className="font-medium">{method.label}</p>
                      <p className="text-lg font-semibold">{Number(method.percentage || 0).toFixed(1)}%</p>
                      <p className="text-sm">{formatOverviewCurrency(method.amount)}</p>
                      <p className="text-xs text-muted-foreground">{Number(method.transactionCount || 0).toLocaleString()} transactions</p>
                    </div>
                  ))}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentMethods.methods.map((method) => (
                      <TableRow key={`row-${method.method}`}>
                        <TableCell>{method.label}</TableCell>
                        <TableCell className="text-right">{formatOverviewCurrency(method.amount)}</TableCell>
                        <TableCell className="text-right">{Number(method.transactionCount || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{Number(method.percentage || 0).toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold">{formatOverviewCurrency(paymentMethods.totalAmount)}</TableCell>
                      <TableCell className="text-right font-semibold">{Number(paymentMethods.totalTransactions || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">100%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No payment method data in this period</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Profit &amp; Loss Statement</CardTitle>
            <Button variant="link" className="h-auto p-0 text-xs text-primary">View Full P&amp;L Statement</Button>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line item</TableHead>
                  <TableHead className="text-right">This period</TableHead>
                  <TableHead className="text-right">Last period</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plRows.map((row) => {
                  const cur = current[row.key] ?? 0;
                  const prev = previous[row.key] ?? 0;
                  const change = prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : 0;
                  return (
                    <TableRow key={row.key}>
                      <TableCell className={row.bold ? 'font-semibold' : ''}>{row.label}</TableCell>
                      <TableCell className={`text-right ${row.highlight ? 'font-bold text-primary' : ''} ${row.negative && cur ? 'text-red-700' : ''}`}>
                        {row.key === 'netProfit' || row.key === 'grossProfit' || row.key === 'revenue' || row.key === 'otherIncome'
                          ? formatOverviewCurrency(cur)
                          : formatOverviewCurrency(Math.abs(cur))}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatOverviewCurrency(Math.abs(prev))}</TableCell>
                      <TableCell className="text-right">{formatPercentChange(change)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <DonutBreakdownCard
          title={isRental ? 'Collections Breakdown' : 'Revenue Breakdown'}
          slices={revenueDonut.slices}
          total={revenueDonut.total}
          centerLabel={isRental ? 'Collected' : 'Total Revenue'}
          viewLabel={isRental ? 'View Collections Analysis' : 'View Revenue Analysis'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DonutBreakdownCard
          title="Expense Breakdown"
          slices={expenseDonut.slices}
          total={expenseDonut.total}
          centerLabel="Total Expenses"
          viewLabel="View Expense Analysis"
        />

        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Financial Position</CardTitle>
            <Button variant="link" className="h-auto p-0 text-xs text-primary">View Balance Sheet</Button>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-0">
            {[
              { label: 'Total Assets', value: financialPosition.totalAssets },
              { label: 'Total Liabilities', value: financialPosition.totalLiabilities },
              { label: 'Equity', value: financialPosition.equity },
              { label: 'Current Ratio', value: financialPosition.currentRatio, isRatio: true },
            ].map((row, idx, arr) => (
              <div key={row.label}>
                <div className="flex justify-between py-2.5 text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium">
                    {row.isRatio ? (row.value ? row.value.toFixed(2) : '—') : formatOverviewCurrency(row.value)}
                  </span>
                </div>
                {idx < arr.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Key Financial Ratios</CardTitle>
            <Button variant="link" className="h-auto p-0 text-xs text-primary">View All Ratios</Button>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {ratios.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{r.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{Number(r.value).toFixed(1)}%</span>
                  {ratioBadge(r.status)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
