import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import productService from '../../services/productService';
import ProductNameSuggest, { duplicateNameConflict, productNameKey } from '../../components/ProductNameSuggest';

vi.mock('../../services/productService', () => ({ default: { searchProducts: vi.fn() } }));
vi.mock('../../utils/fileUtils', () => ({ resolveImageUrl: (value) => value || '' }));

const macbook = { id: 'p1', name: 'MacBook M4', quantityOnHand: 12, sellingPrice: 14500 };
const macMini = { id: 'p2', name: 'Mac Mini', quantityOnHand: 0, sellingPrice: 7200 };

function NameBox({ initial = '', ...props }) {
  const [value, setValue] = useState(initial);
  return (
    <ProductNameSuggest value={value} {...props}>
      <input aria-label="Product name" value={value} onChange={(e) => setValue(e.target.value)} />
    </ProductNameSuggest>
  );
}

describe('productNameKey / duplicateNameConflict', () => {
  it('compares names trimmed, with single spaces, ignoring case', () => {
    expect(productNameKey('  MacBook   M4 ')).toBe('macbook m4');
  });

  it('reads the existing product from a 409 for the name only', () => {
    const error = { response: { status: 409, data: { code: 'DUPLICATE_PRODUCT_NAME', data: macbook } } };
    expect(duplicateNameConflict(error)).toEqual(macbook);
    expect(duplicateNameConflict({ response: { status: 409, data: { code: 'OTHER' } } })).toBeNull();
    expect(duplicateNameConflict(new Error('offline'))).toBeNull();
  });
});

describe('ProductNameSuggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productService.searchProducts.mockResolvedValue({ data: [macbook, macMini] });
  });

  it('lists products already there as a name is typed, and picking one offers to add stock to it', async () => {
    const onAddStock = vi.fn();
    const onOpen = vi.fn();
    render(<NameBox onAddStock={onAddStock} onOpen={onOpen} />);
    const input = screen.getByLabelText('Product name');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'M' } });

    await screen.findByRole('option', { name: /MacBook M4/ });
    expect(productService.searchProducts).toHaveBeenCalledWith('M', { limit: 6, sort: 'relevance' });
    expect(screen.getByRole('option', { name: /Mac Mini/ })).toHaveTextContent('Out of stock');

    fireEvent.click(screen.getByRole('option', { name: /MacBook M4/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('You already have this product');
    expect(input).toHaveValue('M');
    fireEvent.click(screen.getByRole('button', { name: 'Add stock to it' }));
    expect(onAddStock).toHaveBeenCalledWith(macbook);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(onOpen).toHaveBeenCalledWith(macbook);
  });

  it('warns on the exact name, and "different product" lets it through', async () => {
    const onDifferent = vi.fn();
    render(<NameBox onDifferent={onDifferent} />);
    const input = screen.getByLabelText('Product name');
    fireEvent.change(input, { target: { value: 'macbook  m4' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('MacBook M4');
    expect(screen.getByRole('alert')).toHaveTextContent('12 in stock');
    fireEvent.click(screen.getByRole('button', { name: "It's a different product" }));
    expect(onDifferent).toHaveBeenCalledWith('macbook  m4');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the product the server refused the save for, with "Add it anyway"', () => {
    const onDifferent = vi.fn();
    productService.searchProducts.mockResolvedValue({ data: [] });
    render(<NameBox initial="MacBook M4" conflict={macbook} onDifferent={onDifferent} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Already in your products');
    fireEvent.click(screen.getByRole('button', { name: 'Add it anyway' }));
    expect(onDifferent).toHaveBeenCalledWith('MacBook M4');
  });

  it('does nothing when editing a product', async () => {
    render(<NameBox initial="MacBook M4" enabled={false} conflict={macbook} />);
    await waitFor(() => expect(productService.searchProducts).not.toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
