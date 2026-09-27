import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SimpleSalesList from '../../components/simple/SimpleSalesList';

const sales = [
  { id: 's1', total: 50, status: 'completed', paymentMethod: 'cash', createdAt: '2026-09-23T10:00:00Z', items: [{ quantity: 2 }] },
  { id: 's2', total: 30, status: 'pending', paymentMethod: 'credit', createdAt: '2026-09-23T11:00:00Z', items: [{ quantity: 1 }] },
];

const props = () => ({
  sales,
  loading: false,
  totalCount: 2,
  revenue: 50,
  period: 'today',
  onPeriodChange: vi.fn(),
  onSell: vi.fn(),
  onOpenSale: vi.fn(),
  page: 1,
  totalPages: 1,
  onPageChange: vi.fn(),
  getPartyLabel: (sale) => (sale.id === 's1' ? 'Walk-in Customer' : 'Ama'),
  paymentMethodLabels: { cash: 'Cash', credit: 'Credit' },
});

describe('SimpleSalesList', () => {
  it('shows the period total, flags unpaid sales, and opens a sale', () => {
    const p = props();
    render(<SimpleSalesList {...p} />);
    expect(screen.getByText('2 sales today')).toBeInTheDocument();
    expect(screen.getByText('Unpaid')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ama'));
    expect(p.onOpenSale).toHaveBeenCalledWith(sales[1]);
  });

  it('sells and switches period', () => {
    const p = props();
    render(<SimpleSalesList {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
    expect(p.onSell).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('tab', { name: 'This week' }));
    expect(p.onPeriodChange).toHaveBeenCalledWith('week');
  });

  it('has no returns, filters or table controls', () => {
    render(<SimpleSalesList {...props()} />);
    expect(screen.queryByText(/Returns/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Filter/)).not.toBeInTheDocument();
  });
});
