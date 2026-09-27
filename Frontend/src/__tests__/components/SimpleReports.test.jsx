import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SimpleReports from '../../components/simple/SimpleReports';

vi.mock('../../hooks/useWorkspaceScope', () => ({
  useWorkspaceScope: () => ({ activeTenantId: 't1', activeShopId: null, activeStudioLocationId: null, scopeReady: true }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }) => {
    if (queryKey[1] === 'top-sellers') {
      return { data: { data: [{ productName: 'Bel Aqua', quantitySold: 40 }] }, isLoading: false };
    }
    if (queryKey[1] === 'expenses') {
      return { data: { data: { byCategory: [{ category: 'Transport', totalAmount: '60' }] } }, isLoading: false };
    }
    return { data: { data: { thisMonth: { revenue: 500, expenses: 600, profit: -100 } } }, isLoading: false };
  },
}));

describe('SimpleReports', () => {
  it('shows totals, a loss, best sellers and spending', () => {
    render(<SimpleReports />);
    expect(screen.getByText('Loss')).toBeInTheDocument();
    expect(screen.getByText('Bel Aqua')).toBeInTheDocument();
    expect(screen.getByText('40 sold')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Last month' }));
    expect(screen.getByRole('tab', { name: 'Last month' })).toHaveAttribute('aria-selected', 'true');
  });
});
