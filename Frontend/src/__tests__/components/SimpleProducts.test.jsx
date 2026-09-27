import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SimpleProductsList, { getSimpleStockLabel } from '../../components/simple/SimpleProductsList';
import SimpleProductForm from '../../components/simple/SimpleProductForm';

vi.mock('../../utils/fileUtils', () => ({ resolveImageUrl: (value) => value || '' }));

describe('getSimpleStockLabel', () => {
  it('labels stock levels', () => {
    expect(getSimpleStockLabel({ quantityOnHand: 0 }).text).toBe('Out of stock');
    expect(getSimpleStockLabel({ quantityOnHand: 3, reorderLevel: 5 }).text).toBe('Low · 3 left');
    expect(getSimpleStockLabel({ quantityOnHand: 12, reorderLevel: 5 }).text).toBe('12 in stock');
    expect(getSimpleStockLabel({ quantityOnHand: 0, trackStock: false })).toBeNull();
  });
});

describe('SimpleProductsList', () => {
  it('lists products with price and stock and opens one', () => {
    const onOpenProduct = vi.fn();
    const products = [{ id: 'p1', name: 'Bel Aqua', sellingPrice: 4, quantityOnHand: 0 }];
    render(
      <SimpleProductsList
        products={products} loading={false} totalCount={1} search="" onSearchChange={vi.fn()}
        onAdd={vi.fn()} onOpenProduct={onOpenProduct} page={1} totalPages={1} onPageChange={vi.fn()}
      />
    );
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bel Aqua'));
    expect(onOpenProduct).toHaveBeenCalledWith(products[0]);
  });
});

describe('SimpleProductForm', () => {
  const base = { open: true, onOpenChange: vi.fn(), onPickImage: vi.fn(), onRemoveImage: vi.fn() };

  it('requires a name and price, then saves price, cost and stock', () => {
    const onSave = vi.fn();
    render(<SimpleProductForm {...base} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the product name.');
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Rexona Men' } });
    fireEvent.change(screen.getByLabelText('Selling price'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('Quantity in stock'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: ' 6034000181142 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Rexona Men', sellingPrice: 35, costPrice: '', quantityOnHand: 12, barcode: '6034000181142' });
  });

  it('does not edit products with sizes or colours', () => {
    render(<SimpleProductForm {...base} onSave={vi.fn()} product={{ name: 'Shirt', hasVariants: true }} />);
    expect(screen.getByText(/different sizes or colours/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});

describe('SimpleProductForm barcode', () => {
  it('fills the barcode when editing and ignores the scanner Enter key', () => {
    render(
      <SimpleProductForm
        open onOpenChange={vi.fn()} onPickImage={vi.fn()} onRemoveImage={vi.fn()} onSave={vi.fn()}
        product={{ name: 'Bel Aqua', sellingPrice: 4, quantityOnHand: 10, barcode: '6034000181142' }}
      />
    );
    const field = screen.getByLabelText('Barcode');
    expect(field).toHaveValue('6034000181142');
    const enter = fireEvent.keyDown(field, { key: 'Enter' });
    expect(enter).toBe(false); // default prevented
  });
});
