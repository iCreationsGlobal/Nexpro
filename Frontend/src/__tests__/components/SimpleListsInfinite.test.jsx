import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SimpleSalesList from '../../components/simple/SimpleSalesList';
import SimpleExpensesList from '../../components/simple/SimpleExpensesList';

vi.mock('../../hooks/useWorkspaceScope', () => ({
  useWorkspaceScope: () => ({ activeTenantId: 't1', activeShopId: null, activeStudioLocationId: null, scopeReady: true }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { data: { thisMonth: { expenses: 0 } } }, isLoading: false }),
}));

const sales = Array.from({ length: 20 }, (_, i) => ({
  id: `s${i + 1}`, total: 10, status: 'completed', paymentMethod: 'cash', createdAt: '2026-09-23T10:00:00Z', items: [],
}));
const expenses = Array.from({ length: 20 }, (_, i) => ({
  id: `e${i + 1}`, category: `Category ${i + 1}`, amount: 5, expenseDate: '2026-09-23T09:00:00Z', approvalStatus: 'approved',
}));

const salesProps = (overrides = {}) => ({
  sales,
  loading: false,
  totalCount: 45,
  revenue: 450,
  period: 'today',
  onPeriodChange: vi.fn(),
  onSell: vi.fn(),
  onOpenSale: vi.fn(),
  page: 1,
  totalPages: 5,
  onPageChange: vi.fn(),
  getPartyLabel: (sale) => `Party ${sale.id}`,
  ...overrides,
});

const expensesProps = (overrides = {}) => ({
  expenses,
  loading: false,
  totalCount: 45,
  period: 'today',
  onPeriodChange: vi.fn(),
  onAdd: vi.fn(),
  onOpenExpense: vi.fn(),
  page: 1,
  totalPages: 5,
  onPageChange: vi.fn(),
  ...overrides,
});

describe.each([
  ['SimpleSalesList', SimpleSalesList, salesProps, 'sales'],
  ['SimpleExpensesList', SimpleExpensesList, expensesProps, 'expenses'],
])('%s', (_name, List, makeProps, noun) => {
  it('desktop: keeps the page buttons', () => {
    const p = makeProps();
    render(<List {...p} />);
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(p.onPageChange).toHaveBeenCalledWith(2);
  });

  it('phones/tablets: loads more instead of paging', () => {
    const loadMore = vi.fn();
    render(<List {...makeProps({ infinite: { hasMore: true, loadMore, isLoadingMore: false } })} />);
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(loadMore).toHaveBeenCalled();
  });

  it('phones/tablets: says when every row is loaded', () => {
    render(<List {...makeProps({ infinite: { hasMore: false, loadMore: vi.fn(), isLoadingMore: false } })} />);
    expect(screen.getByText(`All 20 ${noun}`)).toBeInTheDocument();
  });
});
