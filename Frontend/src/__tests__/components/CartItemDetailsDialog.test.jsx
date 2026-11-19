import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CartItemDetailsDialog, { productPhotos } from '../../components/pos/CartItemDetailsDialog';
import productService from '../../services/productService';

vi.mock('../../utils/fileUtils', () => ({ resolveImageUrl: (value) => value || '' }));
vi.mock('../../services/productService', () => ({ default: { getProductById: vi.fn() } }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div role="dialog">{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>, DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>, DialogBody: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

const gown = {
  id: 'gown', name: 'Evening gown', barcode: '111', sku: 'EG', brand: 'Bravo', unit: 'piece', description: 'Long, with puff sleeves.',
  imageUrl: '/a.jpg', metadata: { storeImages: { B: '/b.jpg' } }, category: { name: 'Dresses' },
  variants: [{ id: 'm', name: 'M', barcode: '2012345678903', sku: 'EG-M', attributes: { size: 'M', colour: 'Black' }, quantityOnHand: 20 }],
};

/** A cart of one line, with the till's own quantity rule (0 removes it). */
function Cart({ onRemove }) {
  const [cart, setCart] = useState([{ id: 'line1', productId: 'gown', productVariantId: 'm', name: 'Evening gown - M', unitPrice: 120, quantity: 1, discount: 0, quantityOnHand: 20 }]);
  const item = cart[0] ?? null;
  const update = (id, quantity) => setCart((lines) => (quantity <= 0 ? lines.filter((l) => l.id !== id) : lines.map((l) => (l.id === id ? { ...l, quantity } : l))));
  return item ? <CartItemDetailsDialog item={item} onClose={() => {}} onUpdateQuantity={update} onRemove={(id) => { onRemove(id); update(id, 0); }} /> : <p>Cart is empty</p>;
}

describe('Cart item details', () => {
  beforeEach(() => { vi.mocked(productService.getProductById).mockResolvedValue({ data: gown }); });

  it('shows the product in full: photos, size, codes, stock, description', async () => {
    render(<Cart onRemove={vi.fn()} />);
    expect(await screen.findByText('Dresses')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evening gown' })).toBeInTheDocument();
    expect(screen.getByText('M · Size: M · Colour: Black')).toBeInTheDocument();
    expect(screen.getByText('2012345678903')).toBeInTheDocument();
    expect(screen.getByText('EG-M')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('Long, with puff sleeves.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Photo / })).toHaveLength(2);
    expect(productService.getProductById).toHaveBeenCalledWith('gown');
  });

  it('changes the quantity in the cart, and removes the item only after asking', async () => {
    const onRemove = vi.fn();
    render(<Cart onRemove={onRemove} />);
    await screen.findByText('Dresses');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Evening gown - M' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase Evening gown - M' }));
    expect(screen.getByLabelText('Quantity in the cart')).toHaveTextContent('3');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Evening gown - M' }));
    expect(screen.getByLabelText('Quantity in the cart')).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Evening gown - M' }));
    expect(screen.getByLabelText('Quantity in the cart')).toHaveTextContent('1');
    // − at one asks before taking the item out.
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Evening gown - M' }));
    expect(screen.getByText('Remove Evening gown - M from this sale?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    fireEvent.click(screen.getByRole('button', { name: /Remove from cart/ }));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    fireEvent.click(screen.getByRole('button', { name: /Remove from cart/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith('line1');
    expect(screen.getByText('Cart is empty')).toBeInTheDocument();
  });

  it('shows what the cart line has when the product can\'t be loaded', async () => {
    vi.mocked(productService.getProductById).mockImplementation(() => Promise.reject(new Error('offline')));
    render(<Cart onRemove={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Couldn.t load the rest/)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Evening gown - M' })).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('lists every photo once', () => {
    expect(productPhotos({ imageUrl: '/a.jpg', storeImages: { B: '/b.jpg', C: '/a.jpg' } })).toEqual(['/a.jpg', '/b.jpg']);
  });
});
