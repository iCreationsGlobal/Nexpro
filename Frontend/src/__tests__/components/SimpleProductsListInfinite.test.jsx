import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SimpleProductsList from '../../components/simple/SimpleProductsList';

vi.mock('../../utils/fileUtils', () => ({ resolveImageUrl: (value) => value || '' }));

const products = Array.from({ length: 20 }, (_, i) => ({
  id: `p${i + 1}`, name: `Product ${i + 1}`, sellingPrice: 5, quantityOnHand: 10,
}));

const props = (overrides = {}) => ({
  products,
  loading: false,
  totalCount: 45,
  search: '',
  onSearchChange: vi.fn(),
  onAdd: vi.fn(),
  onOpenProduct: vi.fn(),
  page: 1,
  totalPages: 5,
  onPageChange: vi.fn(),
  ...overrides,
});

describe('SimpleProductsList paging', () => {
  it('desktop: keeps the page buttons', () => {
    const onPageChange = vi.fn();
    render(<SimpleProductsList {...props({ onPageChange })} />);
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('phones/tablets: no page buttons; Show more loads the next rows', () => {
    const loadMore = vi.fn();
    render(<SimpleProductsList {...props({ infinite: { hasMore: true, loadMore, isLoadingMore: false } })} />);
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(loadMore).toHaveBeenCalled();
  });

  it('phones/tablets: says when every product is loaded', () => {
    render(<SimpleProductsList {...props({ infinite: { hasMore: false, loadMore: vi.fn(), isLoadingMore: false } })} />);
    expect(screen.getByText('All 20 products')).toBeInTheDocument();
  });
});
