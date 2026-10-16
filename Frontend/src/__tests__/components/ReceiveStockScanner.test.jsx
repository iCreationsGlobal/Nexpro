import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, it, expect, beforeEach } from 'vitest';
import ReceiveStockModal from '../../components/ReceiveStockModal';
import productService from '../../services/productService';
import { showSuccess } from '../../utils/toast';

vi.mock('../../hooks/usePOSConfig', () => ({ useScanningEnabled: () => ({ scanningEnabled: false }) }));
vi.mock('../../utils/toast', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  getErrorMessage: (err, fallback) => err?.response?.data?.message || err?.message || fallback,
}));
vi.mock('../../services/productService', () => ({
  default: {
    getProducts: vi.fn(),
    getCategories: vi.fn(),
    getProductByBarcode: vi.fn(),
    getProductById: vi.fn(),
    getProductVariants: vi.fn(),
    resolveProductFromQRPayload: vi.fn(),
    receiveStock: vi.fn(),
  },
}));

const soap = { id: 'p1', name: 'Bar soap', barcode: '123456789012', quantityOnHand: 4, variants: [] };
const shirt = {
  id: 'p2',
  name: 'Polo shirt',
  hasVariants: true,
  quantityOnHand: 9,
  variants: [
    { id: 'v-m', productId: 'p2', name: 'M', quantityOnHand: 5, isActive: true },
    { id: 'v-l', productId: 'p2', name: 'L', quantityOnHand: 4, isActive: true },
  ],
};
const DRAFT_KEY = 'receiveStockDraft:t1:s1';

const renderModal = (props = {}) => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  render(<ReceiveStockModal open onClose={onClose} onSuccess={onSuccess} {...props} />);
  return { onClose, onSuccess };
};

/** Simulate a keyboard-wedge scanner: a fast burst of keys (optionally landing in an input), then Enter. */
const pressKeysFast = (target, text, { start = 10000, typedValue } = {}) => {
  let tick = start;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => (tick += 10));
  try {
    for (const key of text) fireEvent.keyDown(target, { key });
    if (typedValue !== undefined) fireEvent.change(target, { target: { value: typedValue } });
    const suffix = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    fireEvent(target, suffix);
    return suffix;
  } finally {
    clock.mockRestore();
  }
};

// The shared test setup stubs localStorage; back it with a real store so drafts can be checked.
const storage = new Map();

beforeEach(() => {
  vi.clearAllMocks();
  storage.clear();
  localStorage.getItem.mockImplementation((key) => (storage.has(key) ? storage.get(key) : null));
  localStorage.setItem.mockImplementation((key, value) => storage.set(key, String(value)));
  localStorage.removeItem.mockImplementation((key) => storage.delete(key));
  localStorage.setItem('activeTenantId', 't1');
  localStorage.setItem('activeShopId', 's1');
  productService.getProducts.mockResolvedValue({ data: [soap, shirt], pagination: { totalPages: 1 } });
  productService.getCategories.mockResolvedValue({ data: [{ id: 'c1', name: 'Drinks' }] });
  productService.getProductVariants.mockResolvedValue({ data: shirt.variants });
  productService.receiveStock.mockResolvedValue({ success: true });
});

it('lists products straight away and receives the whole delivery in one request', async () => {
  const { onClose, onSuccess } = renderModal();

  await screen.findByText('Bar soap');
  expect(productService.getProducts).toHaveBeenCalledWith(expect.objectContaining({ includeVariants: true, isActive: true, page: 1 }));
  expect(screen.getByText('In stock 4')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'One more Bar soap' }));
  fireEvent.click(screen.getByRole('button', { name: 'One more Bar soap' }));
  fireEvent.change(screen.getByLabelText('Quantity received for Bar soap'), { target: { value: '24' } });

  fireEvent.click(screen.getByRole('button', { name: '2 options' }));
  fireEvent.change(screen.getByLabelText('Quantity received for Polo shirt — M'), { target: { value: '6' } });
  fireEvent.click(screen.getByRole('button', { name: 'One more Polo shirt — L' }));

  expect(screen.getByText('3 items · 31 units')).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(DRAFT_KEY))).toHaveLength(3);

  fireEvent.click(screen.getByRole('button', { name: 'Receive stock' }));

  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(productService.receiveStock).toHaveBeenCalledExactlyOnceWith([
    { productId: 'p1', quantity: 24 },
    { productId: 'p2', variantId: 'v-m', quantity: 6 },
    { productId: 'p2', variantId: 'v-l', quantity: 1 },
  ]);
  expect(onSuccess).toHaveBeenCalled();
  expect(showSuccess).toHaveBeenCalledWith('Received 31 units across 3 items.');
  expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
});

it('keeps everything and saves nothing when the delivery fails', async () => {
  productService.receiveStock.mockRejectedValue({ response: { data: { message: 'Polo shirt: choose which variant arrived.' } } });
  const { onClose } = renderModal();
  await screen.findByText('Bar soap');

  fireEvent.click(screen.getByRole('button', { name: 'One more Bar soap' }));
  fireEvent.click(screen.getByRole('button', { name: 'Receive stock' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Nothing was saved. Polo shirt: choose which variant arrived.');
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Quantity received for Bar soap').value).toBe('1');
  expect(JSON.parse(localStorage.getItem(DRAFT_KEY))).toEqual([expect.objectContaining({ productId: 'p1', quantity: 1 })]);
});

it('restores an unsaved delivery, and Start over clears it', async () => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify([{ key: 'p1:', productId: 'p1', variantId: null, name: 'Bar soap', quantity: 12 }]));
  renderModal();

  expect((await screen.findByText(/We kept 1 item you had not received yet/))).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Review (1)' }));
  expect(screen.getByLabelText('Quantity received for Bar soap').value).toBe('12');

  fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
  expect(screen.getByText('0 items · 0 units')).toBeTruthy();
  expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
});

it('reviews and removes lines before receiving', async () => {
  renderModal();
  await screen.findByText('Bar soap');
  fireEvent.click(screen.getByRole('button', { name: 'One more Bar soap' }));

  fireEvent.click(screen.getByRole('button', { name: 'Review (1)' }));
  const review = screen.getByText('This delivery').parentElement;
  expect(within(review).getByLabelText('Quantity received for Bar soap').value).toBe('1');

  fireEvent.click(screen.getByRole('button', { name: 'Remove Bar soap' }));
  expect(screen.getByText('Nothing added yet. Tap + beside a product.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Receive stock' }).disabled).toBe(true);
});

it('filters by low stock, out of stock and category', async () => {
  renderModal();
  await screen.findByText('Bar soap');

  fireEvent.click(screen.getByRole('button', { name: 'Low stock' }));
  await waitFor(() => expect(productService.getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ lowStock: true, page: 1 })));
  fireEvent.click(screen.getByRole('button', { name: 'Out of stock' }));
  await waitFor(() => expect(productService.getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ outOfStock: true })));
  fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));
  await waitFor(() => expect(productService.getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 'c1' })));
});

it('adds a hardware-scanned product without it changing a focused quantity', async () => {
  productService.getProductByBarcode.mockResolvedValue({ data: soap });
  renderModal();
  await screen.findByText('Bar soap');

  const picker = screen.getByLabelText('Scan or search products');
  picker.focus();
  const suffix = pressKeysFast(picker, soap.barcode);
  expect(suffix.defaultPrevented).toBe(true);
  await waitFor(() => expect(screen.getByLabelText('Quantity received for Bar soap').value).toBe('1'));
  expect(productService.getProductByBarcode).toHaveBeenCalledExactlyOnceWith(soap.barcode);

  // Scanning again while the quantity box is focused adds one instead of typing the barcode into it.
  const quantity = screen.getByLabelText('Quantity received for Bar soap');
  quantity.focus();
  pressKeysFast(quantity, soap.barcode, { start: 50000, typedValue: `1${soap.barcode}` });
  await waitFor(() => expect(screen.getByLabelText('Quantity received for Bar soap').value).toBe('2'));
  expect(productService.getProductByBarcode).toHaveBeenCalledTimes(1);
});

it('shows every option when a scanned code belongs to a product with several variants', async () => {
  productService.getProducts.mockResolvedValue({ data: [soap], pagination: { totalPages: 1 } });
  productService.getProductByBarcode.mockResolvedValue({ data: { ...shirt, variants: undefined } });
  renderModal();
  await screen.findByText('Bar soap');

  const picker = screen.getByLabelText('Scan or search products');
  fireEvent.change(picker, { target: { value: '999' } });
  fireEvent.keyDown(picker, { key: 'Enter' });

  expect(await screen.findByText('Set how many of each Polo shirt option arrived.')).toBeTruthy();
  expect(productService.getProductVariants).toHaveBeenCalledWith('p2');
  expect(screen.getByLabelText('Quantity received for Polo shirt — M')).toBeTruthy();
  expect(screen.getByLabelText('Quantity received for Polo shirt — L')).toBeTruthy();
});

it('does not complain when Enter is pressed after typing a name that has matches', async () => {
  productService.getProductByBarcode.mockRejectedValue({ response: { status: 404 } });
  renderModal();
  await screen.findByText('Bar soap');

  const picker = screen.getByLabelText('Scan or search products');
  fireEvent.change(picker, { target: { value: 'soap' } });
  fireEvent.keyDown(picker, { key: 'Enter' });

  await waitFor(() => expect(productService.getProductByBarcode).toHaveBeenCalledWith('soap'));
  await waitFor(() => expect(screen.queryByText('Finding product…')).toBeNull());
  expect(screen.queryByRole('alert')).toBeNull();
});

it('brings the product it was opened from to the top with its options open', async () => {
  productService.getProducts.mockResolvedValue({ data: [soap], pagination: { totalPages: 1 } });
  renderModal({ initialProduct: { id: 'p2', name: 'Polo shirt', hasVariants: true } });

  expect(await screen.findByLabelText('Quantity received for Polo shirt — M')).toBeTruthy();
  const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
  expect(rows[0]).toContain('Polo shirt');
  expect(productService.receiveStock).not.toHaveBeenCalled();
});
