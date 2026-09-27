import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { Banknote, Loader2, Plus, ShoppingCart, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import dashboardService from '../../services/dashboardService';
import { queryKeys } from '../../utils/queryKeys';
import { formatAmount } from '../../utils/formatNumber';

dayjs.extend(isoWeek);

const PERIODS = [
  { key: 'today', label: 'Today', filterType: 'today', start: () => dayjs().startOf('day'), end: () => dayjs().endOf('day') },
  { key: 'week', label: 'This week', filterType: 'thisWeek', start: () => dayjs().startOf('isoWeek'), end: () => dayjs().endOf('isoWeek') },
  { key: 'month', label: 'This month', filterType: 'thisMonth', start: () => dayjs().startOf('month'), end: () => dayjs().endOf('month') },
];

const StatCard = ({ label, value, icon: Icon, tone, loading }) => (
  <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-muted-foreground sm:text-base">{label}</p>
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-full', tone.iconBg)}>
        <Icon className={cn('h-5 w-5', tone.icon)} />
      </span>
    </div>
    <p className={cn('mt-3 text-3xl font-bold tracking-tight sm:text-4xl', tone.value)}>
      {loading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : formatAmount(value)}
    </p>
  </div>
);

/**
 * Simple Mode dashboard for shops: Revenue, Expenses and Profit for a chosen period, plus big
 * Sell / Add expense buttons. No charts, insights, alerts or banners.
 */
export default function SimpleDashboard() {
  const navigate = useNavigate();
  const { activeTenantId, activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const [periodKey, setPeriodKey] = useState('today');
  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];

  const params = useMemo(() => ({
    startDate: period.start().format('YYYY-MM-DD'),
    endDate: period.end().format('YYYY-MM-DD'),
    filterType: period.filterType,
  }), [period]);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard.overview(activeTenantId, activeShopId, activeStudioLocationId, params),
    queryFn: () => dashboardService.getOverview(params.startDate, params.endDate, params.filterType),
    enabled: scopeReady,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });

  // The overview returns the requested period's totals under `thisMonth`.
  const summary = (data?.data || data || {}).thisMonth || {};
  const revenue = Number(summary.revenue || 0);
  const expenses = Number(summary.expenses || 0);
  const profit = Number(summary.profit ?? revenue - expenses);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 sm:space-y-6">
      <Button
        type="button"
        onClick={() => navigate('/sales?openPOS=1')}
        className="h-20 w-full rounded-2xl bg-brand text-2xl font-bold text-white hover:bg-brand-dark sm:h-24"
      >
        <ShoppingCart className="mr-3 h-8 w-8" />
        Sell
      </Button>

      <div className="flex gap-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === periodKey}
            onClick={() => setPeriodKey(p.key)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:text-base',
              p.key === periodKey ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Revenue"
          value={revenue}
          icon={Wallet}
          loading={isLoading}
          tone={{ iconBg: 'bg-emerald-100', icon: 'text-emerald-700', value: 'text-foreground' }}
        />
        <StatCard
          label="Expenses"
          value={expenses}
          icon={Banknote}
          loading={isLoading}
          tone={{ iconBg: 'bg-amber-100', icon: 'text-amber-700', value: 'text-foreground' }}
        />
        <StatCard
          label="Profit"
          value={profit}
          icon={profit < 0 ? TrendingDown : TrendingUp}
          loading={isLoading}
          tone={profit < 0
            ? { iconBg: 'bg-red-100', icon: 'text-red-700', value: 'text-red-700' }
            : { iconBg: 'bg-emerald-100', icon: 'text-emerald-700', value: 'text-emerald-700' }}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => navigate('/expenses?new=1')}
        className="h-14 w-full rounded-2xl text-base font-semibold"
      >
        <Plus className="mr-2 h-5 w-5" />
        Add expense
      </Button>
    </div>
  );
}
