import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { ChevronRight, Loader2, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatAmount } from '../../utils/formatNumber';

// Weeks start on Monday, matching the Simple Mode dashboard.
dayjs.extend(isoWeek);

export const SIMPLE_SALES_PERIODS = [
  { key: 'today', label: 'Today', start: () => dayjs().startOf('day'), end: () => dayjs().endOf('day') },
  { key: 'week', label: 'This week', start: () => dayjs().startOf('isoWeek'), end: () => dayjs().endOf('isoWeek') },
  { key: 'month', label: 'This month', start: () => dayjs().startOf('month'), end: () => dayjs().endOf('month') },
];

const UNPAID_STATUSES = new Set(['pending', 'partially_paid']);

const periodSummaryLabel = (key) => (
  key === 'today' ? 'today' : key === 'week' ? 'this week' : 'this month'
);

/**
 * Simple Mode sales page: a big Sell button, a period switch, the period's total, and a plain
 * list of sales. Tapping a sale opens its receipt with a big Print button.
 */
export default function SimpleSalesList({
  sales,
  loading,
  totalCount,
  revenue,
  period,
  onPeriodChange,
  onSell,
  onOpenSale,
  openingSaleId = null,
  page,
  totalPages,
  onPageChange,
  getPartyLabel,
  paymentMethodLabels = {},
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Sales</h1>
      </div>

      <Button
        type="button"
        onClick={onSell}
        className="h-16 w-full rounded-2xl bg-brand text-xl font-bold text-white hover:bg-brand-dark sm:h-20 sm:text-2xl"
      >
        <ShoppingCart className="mr-3 h-7 w-7" />
        Sell
      </Button>

      <div className="flex gap-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Period">
        {SIMPLE_SALES_PERIODS.map((p) => (
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
          {loading ? 'Loading…' : `${totalCount} ${totalCount === 1 ? 'sale' : 'sales'} ${periodSummaryLabel(period)}`}
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{formatAmount(revenue)}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground" role="status">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : sales.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          No sales {periodSummaryLabel(period)} yet. Tap Sell to make one.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {sales.map((sale) => {
            const itemCount = (sale.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            const unpaid = UNPAID_STATUSES.has(sale.status);
            return (
              <li key={sale.id}>
                <button
                  type="button"
                  onClick={() => onOpenSale(sale)}
                  disabled={Boolean(openingSaleId)}
                  aria-label={`Open receipt for ${getPartyLabel(sale)}`}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/60 disabled:cursor-wait"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{getPartyLabel(sale)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {dayjs(sale.createdAt).format(period === 'today' ? 'h:mm A' : 'MMM D, h:mm A')}
                      {itemCount > 0 ? ` · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : ''}
                      {sale.paymentMethod ? ` · ${paymentMethodLabels[sale.paymentMethod] || sale.paymentMethod}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">{formatAmount(sale.total)}</p>
                    {unpaid ? <p className="text-xs font-semibold text-amber-700">Unpaid</p> : null}
                  </div>
                  {openingSaleId === sale.id
                    ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
                    : <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
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
