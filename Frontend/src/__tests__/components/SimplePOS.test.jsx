import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SimplePOS from '../../components/pos/SimplePOS';
vi.mock('../../utils/fileUtils', () => ({ resolveImageUrl: value => value || '' }));
const products = [
  { id: 1, name: 'Water', sellingPrice: 4, quantityOnHand: 10, category: { id: 1, name: 'Drinks' } },
  { id: 2, name: 'Bread', sellingPrice: 8, quantityOnHand: 0, category: { id: 2, name: 'Food' } },
];
const props = () => ({ products, cart: [], totals: { itemCount: 0, total: 0 }, isOnline: true, onAdd: vi.fn(), onQuantity: vi.fn(), onClear: vi.fn(), onCheckout: vi.fn(), onCustomer: vi.fn() });
describe('Simple POS', () => {
  it('shows no category filters, searches by name, and adds available products only', () => {
    const p = props(); render(<SimplePOS {...p} />);
    expect(screen.queryByRole('button', {name: 'Drinks'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'All'})).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Add Bread to cart'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Find a product'), { target: { value: 'wat' } });
    expect(screen.queryByRole('button', {name: 'Add Bread to cart'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Add Water to cart'}));
    expect(p.onAdd).toHaveBeenCalledWith(products[0]);
  });
  it('uses existing quantity and payment callbacks, and confirms clearing', () => {
    const p = props(); p.cart = [{ id: 'line1', productId: 1, name: 'Water', quantity: 2, unitPrice: 4 }]; p.totals = { itemCount: 2, total: 8 };
    render(<SimplePOS {...p} />);
    fireEvent.click(screen.getByRole('button', {name: 'Increase Water'}));
    expect(p.onQuantity).toHaveBeenCalledWith('line1', 3);
    fireEvent.click(screen.getByRole('button', {name: 'Take Payment'}));
    expect(p.onCheckout).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', {name: 'Clear all items'}));
    expect(p.onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'Clear all', exact: true}));
    expect(p.onClear).toHaveBeenCalledOnce();
  });
  it('prevents empty or offline checkout', () => {
    const p = props(); const { rerender } = render(<SimplePOS {...p} />);
    expect(screen.getByRole('button', {name: 'Take Payment'})).toBeDisabled();
    rerender(<SimplePOS {...p} cart={[{id: 'one', name:'Water', quantity:1, unitPrice:4}]} isOnline={false} />);
    expect(screen.getByRole('button', {name: 'Take Payment'})).toBeDisabled();
  });
  it('clears the search after a barcode scan', () => {
    const p = props(); const { rerender } = render(<SimplePOS {...p} />);
    fireEvent.change(screen.getByLabelText('Find a product'), { target: { value: '6034000181142' } });
    expect(screen.getByLabelText('Find a product')).toHaveValue('6034000181142');
    rerender(<SimplePOS {...p} scanSignal={1} />);
    expect(screen.getByLabelText('Find a product')).toHaveValue('');
  });
});
