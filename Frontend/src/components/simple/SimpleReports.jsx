import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { Banknote, Loader2, TrendingDown, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import dashboardService from '../../services/dashboardService';
import reportService from '../../services/reportService';
import { queryKeys } from '../../utils/queryKeys';
import { formatAmount } from '../../utils/formatNumber';

// Weeks start on Monday, matching the other Simple Mode pages.
dayjs.extend(isoWeek);

export const SIMPLE_REPORT_PERIODS = [
  { key: 'today', label: 'Today', filterType: 'today', start: () => dayjs().startOf('day'), end: () => dayjs().endOf('day') },
  { key: 'week', label: 'This week', filterType: 'thisWeek', start: () => dayjs().startOf('isoWeek'), end: () => dayjs().endOf('isoWeek') },
  { key: 'month', label: 'This month', filterType: 'thisMonth', start: () => dayjs().startOf('month'), end: () => dayjs().endOf('month') },
  {
    key: 'lastMonth',
    label: 'Last month',
    filterType: 'lastMonth',
    start: () => dayjs().subtract(1, 'month').startOf('month'),
    end: () => dayjs().subtract(1, 'month').endOf('month'),
  },
];

const unwrap = (response) => response?.data ?? response;

const Total = ({ label, value, icon: Icon, tone, loading }) => (
  <div className="rounded-2xl border border-border bg-card p-5">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-muted-foreground sm:text-base">{label}</p>
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-full', tone.iconBg)}>
        <Icon className={cn('h-5 w-5', tone.icon)} />
      </span>
    </div>
    <p className={cn('mt-3 text-3xl font-bold tracking-tight', tone.value)}>
      {loading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : formatAmount(value)}
    </p>
  </div>
);

const Section = ({ title, icon: Icon, children }) => (
  <section className="rounded-2xl border border-border bg-card p-5">
    <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
      <Icon className="h-5 w-5 text-muted-foreground" />
      {title}
    </h2>
    {children}
  </section>
);

/**
 * Simple Mode reports: money in, money out and profit for a period, the best sellers, and
 * what the money was spent on. The totals are the same figures as the Simple Mode dashboard.
 */
export default function SimpleReports() {
  const { activeTenantId, activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const [periodKey, setPeriodKey] = useState('month');
  const period = SIMPLE_REPORT_PERIODS.find((p) => p.key === periodKey) || SIMPLE_REPORT_PERIODS[0];
  const range = useMemo(() => ({
    startDate: period.start().format('YYYY-MM-DD'),
    endDate: period.end().format('YYYY-MM-DD'),
    filterType: period.filterType,
  }), [period]);
  const scopeKey = [activeTenantId, activeShopId, activeStudioLocationId];

  const overviewQuery = useQuery({
    queryKey: queryKeys.dashboard.overview(activeTenantId, activeShopId, activeStudioLocationId, range),
    queryFn: () => dashboardService.getOverview(range.startDate, range.endDate, range.filterType),
    enabled: scopeReady,
  });
  const topQuery = useQuery({
    queryKey: ['simple-reports', 'top-sellers', ...scopeKey, range.startDate, range.endDate],
    queryFn: () => reportService.getFastestMovingItems(range.startDate, range.endDate, 5),
    enabled: scopeReady,
  });
  const expensesQuery = useQuery({
    queryKey: ['simple-reports', 'expenses', ...scopeKey, range.startDate, range.endDate],
    queryFn: () => reportService.getExpenseReport(range.startDate, range.endDate),
    enabled: scopeReady,
  });

  // The overview returns the requested period's totals under `thisMonth`.
  const summary = (unwrap(overviewQuery.data) || {}).thisMonth || {};
  const revenue = Number(summary.revenue || 0);
  const expenses = Number(summary.expenses || 0);
  const profit = Number(summary.profit ?? revenue - expenses);
  const topSellers = Array.isArray(unwrap(topQuery.data)) ? unwrap(topQuery.data) : [];
  const byCategory = (unwrap(expensesQuery.data)?.byCategory || [])
    .map((row) => ({ category: row.category || 'Other', amount: Number(row.totalAmount || 0) }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const biggestCategory = byCategory[0]?.amount || 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Reports</h1>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1 sm:grid-cols-4" role="tablist" aria-label="Period">
        {SIMPLE_REPORT_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === periodKey}
            onClick={() => setPeriodKey(p.key)}
            className={cn(
              'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:text-base',
              p.key === periodKey ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Total label="Money in (sales)" value={revenue} icon={Wallet} loading={overviewQuery.isLoading}
          tone={{ iconBg: 'bg-emerald-100', icon: 'text-emerald-700', value: 'text-foreground' }} />
        <Total label="Money out (expenses)" value={expenses} icon={Banknote} loading={overviewQuery.isLoading}
          tone={{ iconBg: 'bg-amber-100', icon: 'text-amber-700', value: 'text-foreground' }} />
        <Total
          label={profit < 0 ? 'Loss' : 'Profit'}
          value={profit}
          icon={profit < 0 ? TrendingDown : TrendingUp}
          loading={overviewQuery.isLoading}
          tone={profit < 0
            ? { iconBg: 'bg-red-100', icon: 'text-red-700', value: 'text-red-700' }
            : { iconBg: 'bg-emerald-100', icon: 'text-emerald-700', value: 'text-emerald-700' }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Best sellers" icon={Trophy}>
          {topQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : topSellers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales in this period.</p>
          ) : (
            <ol className="space-y-3">
              {topSellers.map((item, index) => (
                <li key={item.productId || item.productName || index} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.productName || 'Product'}</span>
                  <span className="text-sm font-semibold text-muted-foreground">{Number(item.quantitySold || 0)} sold</span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="What you spent on" icon={Banknote}>
          {expensesQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this period.</p>
          ) : (
            <ul className="space-y-3">
              {byCategory.slice(0, 6).map((row) => (
                <li key={row.category}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{row.category}</span>
                    <span className="font-semibold">{formatAmount(row.amount)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${biggestCategory ? Math.max(4, (row.amount / biggestCategory) * 100) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
