import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  TrendingUp,
  Wallet,
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
import { OVERVIEW_CARD_BORDER, formatOverviewCurrency } from '../overview/overviewUtils';
import DonutBreakdownCard from './DonutBreakdownCard';
import HorizontalBarBreakdownCard from './HorizontalBarBreakdownCard';
import SmartReportKpiRow from './SmartReportKpiRow';
import SmartReportSectionHeader from './SmartReportSectionHeader';

/**
 * Cash Flow tab — matches mockup.
 */
export default function SmartReportCashFlowTab({ snapshot, periodLabel }) {
  const detail = snapshot.cashFlowDetail || {
    kpis: {
      net: snapshot.kpis?.cashFlow,
      inflow: { value: snapshot.cashFlow?.inflow, change: 0, sparkline: [] },
      outflow: { value: snapshot.cashFlow?.outflow, change: 0, sparkline: [], invertTrend: true },
      opening: { value: 0, subLabel: '' },
      closing: { value: 0, subLabel: '' },
    },
    trend: snapshot.cashFlow?.byPeriod || [],
    activityDonut: { slices: [], total: 0 },
    compositionDonut: { slices: [], total: snapshot.cashFlow?.inflow || 0 },
    inflowBreakdown: [],
    outflowBreakdown: [],
  };

  const { kpis, trend, activityDonut, compositionDonut, inflowBreakdown, outflowBreakdown } = detail;
  const comparisonLabel = snapshot.comparisonLabel;

  const kpiItems = [
    { label: 'Net Cash Flow', value: kpis.net?.value, change: kpis.net?.change, sparklineData: kpis.net?.sparkline, icon: TrendingUp, iconBgColor: '#dcfce7', iconColor: '#166534', comparisonLabel, sourceLabel: snapshot.kpis?.cashFlow?.sourceLabel },
    { label: 'Cash Inflow', value: kpis.inflow?.value, change: kpis.inflow?.change, sparklineData: kpis.inflow?.sparkline, icon: ArrowDownLeft, iconBgColor: '#dbeafe', iconColor: '#1d4ed8', comparisonLabel, sourceLabel: 'Cash received during the selected period' },
    { label: 'Cash Outflow', value: kpis.outflow?.value, change: kpis.outflow?.change, sparklineData: kpis.outflow?.sparkline, invertTrend: true, icon: ArrowUpRight, iconBgColor: '#fee2e2', iconColor: '#b91c1c', comparisonLabel, sourceLabel: 'Cash paid during the selected period' },
    // Not real bank balances (we don't track an actual running cash account) — these show the
    // period's net cash change relative to a $0 baseline. See subLabel for the honest framing.
    { label: 'Period Cash Baseline', value: kpis.opening?.value, change: 0, sparklineData: kpis.net?.sparkline, subLabel: kpis.opening?.subLabel, hideTrend: true, icon: Landmark, iconBgColor: '#f3f4f6', iconColor: '#374151' },
    { label: 'Net Cash Position', value: kpis.closing?.value, change: 0, sparklineData: kpis.net?.sparkline, subLabel: kpis.closing?.subLabel, hideTrend: true, icon: Wallet, iconBgColor: '#dcfce7', iconColor: '#166534' },
  ];

  return (
    <div className="space-y-6">
      <SmartReportSectionHeader
        title="Cash Flow Overview"
        description="Track cash inflows, outflows, and liquidity for the period."
        periodLabel={periodLabel}
      />
      <SmartReportKpiRow items={kpiItems} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card xl:col-span-1">
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Cash Flow Trend</CardTitle>
            <Button variant="link" className="h-auto p-0 text-xs text-primary">View Detailed Trend</Button>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip formatter={(v, name) => [formatOverviewCurrency(v), name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="inflow" name="Cash Inflow" stroke="#166534" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="outflow" name="Cash Outflow" stroke="#b91c1c" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="net" name="Net Cash Flow" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">No cash flow trend data</div>
            )}
          </CardContent>
        </Card>

        <DonutBreakdownCard
          title="Cash Flow by Activity"
          slices={activityDonut.slices}
          total={activityDonut.total}
          centerLabel="Net Cash Flow"
          viewLabel="View Activity Analysis"
        />

        <DonutBreakdownCard
          title="Cash Flow Composition"
          slices={compositionDonut.slices}
          total={compositionDonut.total}
          centerLabel="Total Inflow"
          viewLabel="View Composition"
          emptyMessage="No inflow composition data"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBarBreakdownCard
          title="Cash Inflow Breakdown"
          items={inflowBreakdown}
          viewLabel="View Inflow Analysis →"
        />
        <HorizontalBarBreakdownCard
          title="Cash Outflow Breakdown"
          items={outflowBreakdown}
          viewLabel="View Outflow Analysis →"
        />
      </div>
    </div>
  );
}
