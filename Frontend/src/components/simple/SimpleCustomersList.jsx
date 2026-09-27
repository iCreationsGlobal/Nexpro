import { ChevronRight, Loader2, Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatAmount } from '../../utils/formatNumber';
import { formatDisplayPhone } from '../../utils/phoneUtils';

/**
 * Simple Mode customers page: a big Add customer button, a search box and a plain list.
 * Customers who owe money (unpaid invoices) show the amount. Tapping one opens it.
 */
export default function SimpleCustomersList({
  customers,
  loading,
  totalCount,
  search,
  onSearchChange,
  onAdd,
  onOpenCustomer,
  page,
  totalPages,
  onPageChange,
}) {
  const searching = Boolean(String(search || '').trim());
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Customers</h1>

      <Button
        type="button"
        onClick={onAdd}
        className="h-16 w-full rounded-2xl bg-brand text-xl font-bold text-white hover:bg-brand-dark sm:h-20 sm:text-2xl"
      >
        <UserPlus className="mr-3 h-7 w-7" />
        Add customer
      </Button>

      <label className="flex h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 focus-within:ring-2 focus-within:ring-brand">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or phone"
          aria-label="Search customers"
          className="h-full w-full min-w-0 bg-transparent text-base outline-none"
        />
      </label>

      <p className="text-sm text-muted-foreground">
        {loading ? 'Loading…' : `${totalCount} ${totalCount === 1 ? 'customer' : 'customers'}${searching ? ' found' : ''}`}
      </p>

      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground" role="status">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : customers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          {searching ? 'No customer matches that search.' : 'No customers yet. Tap Add customer to add one.'}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {customers.map((customer) => {
            const owes = parseFloat(customer.balance || 0);
            return (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => onOpenCustomer(customer)}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/60"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-base font-bold text-foreground" aria-hidden>
                    {String(customer.name || '?').trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{customer.name || customer.company || 'Customer'}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {customer.phone ? formatDisplayPhone(customer.phone) : customer.email || 'No phone'}
                    </p>
                  </div>
                  {owes > 0 ? (
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase text-amber-700">Owes</p>
                      <p className="font-bold text-amber-800">{formatAmount(owes)}</p>
                    </div>
                  ) : null}
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
