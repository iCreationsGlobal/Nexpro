import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  it('finds a product from any of its words, in any order', () => {
    const p = props(); p.products = [...products, { id: 3, name: 'Luminous Body Splash 250ml', sellingPrice: 30, quantityOnHand: 4 }];
    render(<SimplePOS {...p} />);
    fireEvent.change(screen.getByLabelText('Find a product'), { target: { value: '  body   splash luminous ' } });
    expect(screen.getByRole('button', {name: 'Add Luminous Body Splash 250ml to cart'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Add Water to cart'})).not.toBeInTheDocument();
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

  it('finds a product by any of its barcodes, and adds it when the scanner presses Enter', () => {
    const p = props(); p.products = [...products, { id: 4, name: 'Gown', sellingPrice: 120, quantityOnHand: 3, barcode: '111', barcodes: [{ barcode: '2012345678903' }] }];
    render(<SimplePOS {...p} onCode={vi.fn()} />);
    const box = screen.getByLabelText('Find a product');
    fireEvent.change(box, { target: { value: '2012345678903' } });
    expect(screen.getByRole('button', { name: 'Add Gown to cart' })).toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(p.onAdd).toHaveBeenCalledWith(p.products[2]);
    expect(box).toHaveValue('');
  });
  it('looks a code no loaded product has up the way the full till does', async () => {
    const p = props(); const onCode = vi.fn(); const onSearch = vi.fn().mockResolvedValue([{ id: 9, name: 'Dress', sellingPrice: 80, quantityOnHand: 5 }]);
    render(<SimplePOS {...p} onCode={onCode} onSearch={onSearch} />);
    const box = screen.getByLabelText('Find a product');
    // A size's barcode: nothing loaded has it, so the server is asked and its product shown.
    fireEvent.change(box, { target: { value: '6034000181142' } });
    expect(screen.getByText('Looking it up…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add Dress to cart' })).toBeInTheDocument();
    expect(onSearch).toHaveBeenCalledWith('6034000181142');
    // Enter (the scanner's) looks the code up exactly, sizes included.
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onCode).toHaveBeenCalledWith('6034000181142');
    expect(p.onAdd).not.toHaveBeenCalled();
  });
  it('adds the one product a typed name finds on Enter, and never looks names up as barcodes', () => {
    const p = props(); const onCode = vi.fn();
    render(<SimplePOS {...p} onCode={onCode} />);
    const box = screen.getByLabelText('Find a product');
    fireEvent.change(box, { target: { value: 'water' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(p.onAdd).toHaveBeenCalledWith(products[0]);
    expect(onCode).not.toHaveBeenCalled();
  });
});
