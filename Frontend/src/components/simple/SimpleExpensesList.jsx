import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { ChevronRight, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import dashboardService from '../../services/dashboardService';
import { queryKeys } from '../../utils/queryKeys';
import { formatAmount } from '../../utils/formatNumber';

// Weeks start on Monday, matching the Simple Mode dashboard and sales page.
dayjs.extend(isoWeek);

export const SIMPLE_EXPENSE_PERIODS = [
  { key: 'today', label: 'Today', filterType: 'today', start: () => dayjs().startOf('day'), end: () => dayjs().endOf('day') },
  { key: 'week', label: 'This week', filterType: 'thisWeek', start: () => dayjs().startOf('isoWeek'), end: () => dayjs().endOf('isoWeek') },
  { key: 'month', label: 'This month', filterType: 'thisMonth', start: () => dayjs().startOf('month'), end: () => dayjs().endOf('month') },
];

const periodLabel = (key) => (key === 'today' ? 'today' : key === 'week' ? 'this week' : 'this month');

/**
 * Simple Mode expenses page: a big Add expense button, a period switch, the period's total
 * (the same figure as the dashboard's Expenses card) and a plain list. Tapping an expense
 * opens it for editing.
 */
export default function SimpleExpensesList({
  expenses,
  loading,
  totalCount,
  period,
  onPeriodChange,
  onAdd,
  onOpenExpense,
  page,
  totalPages,
  onPageChange,
}) {
  const { activeTenantId, activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const current = SIMPLE_EXPENSE_PERIODS.find((p) => p.key === period) || SIMPLE_EXPENSE_PERIODS[0];
  const overviewParams = useMemo(() => ({
    startDate: current.start().format('YYYY-MM-DD'),
    endDate: current.end().format('YYYY-MM-DD'),
    filterType: current.filterType,
  }), [current]);

  const { data: overview, isLoading: totalLoading } = useQuery({
    queryKey: queryKeys.dashboard.overview(activeTenantId, activeShopId, activeStudioLocationId, overviewParams),
    queryFn: () => dashboardService.getOverview(overviewParams.startDate, overviewParams.endDate, overviewParams.filterType),
    enabled: scopeReady,
  });
  // The overview returns the requested period's totals under `thisMonth`.
  const periodTotal = Number(((overview?.data || overview || {}).thisMonth || {}).expenses || 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Expenses</h1>

      <Button
        type="button"
        onClick={onAdd}
        className="h-16 w-full rounded-2xl bg-brand text-xl font-bold text-white hover:bg-brand-dark sm:h-20 sm:text-2xl"
      >
        <Plus className="mr-3 h-7 w-7" />
        Add expense
      </Button>

      <div className="flex gap-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Period">
        {SIMPLE_EXPENSE_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === period}
            onClick={() => onPeriodChange(p.key)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:text-base',
              p.key === period ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${totalCount} ${totalCount === 1 ? 'expense' : 'expenses'} ${periodLabel(period)}`}
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          {totalLoading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : formatAmount(periodTotal)}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground" role="status">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          No expenses {periodLabel(period)} yet. Tap Add expense to record one.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {expenses.map((expense) => {
            const date = expense.expenseDate || expense.createdAt;
            const pendingApproval = expense.approvalStatus === 'pending_approval';
            return (
              <li key={expense.id}>
                <button
                  type="button"
                  onClick={() => onOpenExpense(expense)}
                  aria-label={`Edit ${expense.category || 'expense'} ${formatAmount(expense.amount)}`}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{expense.category || 'Expense'}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {date ? dayjs(date).format(period === 'today' ? 'h:mm A' : 'MMM D') : ''}
                      {expense.description ? ` · ${expense.description}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">{formatAmount(expense.amount)}</p>
                    {pendingApproval ? <p className="text-xs font-semibold text-amber-700">Awaiting approval</p> : null}
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
            <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
