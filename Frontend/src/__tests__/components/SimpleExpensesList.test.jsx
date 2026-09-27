import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SimpleExpensesList from '../../components/simple/SimpleExpensesList';

vi.mock('../../hooks/useWorkspaceScope', () => ({
  useWorkspaceScope: () => ({ activeTenantId: 't1', activeShopId: null, activeStudioLocationId: null, scopeReady: true }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { data: { thisMonth: { expenses: 75 } } }, isLoading: false }),
}));

const expenses = [
  { id: 'e1', category: 'Transport', description: 'Delivery to Osu', amount: 50, expenseDate: '2026-09-23T09:00:00Z', approvalStatus: 'approved' },
  { id: 'e2', category: 'Utilities', amount: 25, expenseDate: '2026-09-23T10:00:00Z', approvalStatus: 'pending_approval' },
];

const props = () => ({
  expenses,
  loading: false,
  totalCount: 2,
  period: 'today',
  onPeriodChange: vi.fn(),
  onAdd: vi.fn(),
  onOpenExpense: vi.fn(),
  page: 1,
  totalPages: 1,
  onPageChange: vi.fn(),
});

describe('SimpleExpensesList', () => {
  it('shows the period total and count, and flags requests awaiting approval', () => {
    render(<SimpleExpensesList {...props()} />);
    expect(screen.getByText('2 expenses today')).toBeInTheDocument();
    expect(screen.getByText(/75\.00/)).toBeInTheDocument();
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
  });

  it('adds, opens an expense for editing, and switches period', () => {
    const p = props();
    render(<SimpleExpensesList {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(p.onAdd).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Transport'));
    expect(p.onOpenExpense).toHaveBeenCalledWith(expenses[0]);
    fireEvent.click(screen.getByRole('tab', { name: 'This month' }));
    expect(p.onPeriodChange).toHaveBeenCalledWith('month');
  });
});
