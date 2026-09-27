import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PrintableReceipt from '../../components/PrintableReceipt';
import { formatDisplayPhone } from '../../utils/phoneUtils';

vi.mock('../../utils/fileUtils', () => ({ resolveImageUrl: (value) => value || '' }));

const sale = {
  id: 'sale-1',
  saleNumber: 'SALE-1',
  createdAt: '2026-09-23T22:25:00Z',
  subtotal: 20,
  total: 20,
  paymentMethod: 'cash',
  items: [{ id: 'i1', name: 'Bel Aqua Bottle water', quantity: 5, unitPrice: 4, total: 20, metadata: { productCode: '6034000181142' } }],
};

describe('PrintableReceipt on 80mm', () => {
  it('puts the product name, code and amount on separate rows', () => {
    const { container } = render(
      <PrintableReceipt sale={sale} organization={{ name: 'El Roi Imports', phone: '+233+233555155972' }} printConfig={{ format: 'thermal_80' }} />
    );
    const row = container.querySelector('.thermal-item-list');
    expect(row.querySelector('.thermal-item-name').textContent).toBe('Bel Aqua Bottle water');
    expect(row.querySelector('.thermal-item-detail').textContent).toBe('Product Code: 6034000181142');
    expect(row.querySelector('.thermal-item-amount').textContent).toContain('= ₵ 20.00');
  });

  it('prints the phone once even when the country code was saved twice', () => {
    const { container } = render(
      <PrintableReceipt sale={sale} organization={{ name: 'El Roi Imports', phone: '+233+233555155972' }} printConfig={{ format: 'thermal_80' }} />
    );
    expect(container.textContent).toContain('+233555155972');
    expect(container.textContent).not.toContain('+233+233');
  });
});

describe('formatDisplayPhone', () => {
  it('collapses a repeated country code and leaves normal numbers alone', () => {
    expect(formatDisplayPhone('+233+233555155972')).toBe('+233555155972');
    expect(formatDisplayPhone('+233 +233555155972')).toBe('+233555155972');
    expect(formatDisplayPhone('+233555155972')).toBe('+233555155972');
    expect(formatDisplayPhone('0555155972')).toBe('0555155972');
    expect(formatDisplayPhone('')).toBe('');
  });
});

describe('PrintableReceipt on A4', () => {
  it('shows the business name and logo in the header', () => {
    const { container, getByAltText } = render(
      <PrintableReceipt sale={sale} organization={{ name: 'El Roi Imports', logoUrl: 'https://cdn.example.com/logo.png' }} printConfig={{ format: 'a4' }} />
    );
    expect(container.querySelector('.company-name').textContent).toBe('El Roi Imports');
    expect(getByAltText('El Roi Imports')).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
  });

  it('shows just the name (no ABS logo) when the business has no logo', () => {
    const { container, queryByRole } = render(
      <PrintableReceipt sale={sale} organization={{ name: 'El Roi Imports' }} printConfig={{ format: 'a4' }} />
    );
    expect(container.querySelector('.company-name').textContent).toBe('El Roi Imports');
    expect(queryByRole('img')).toBeNull();
  });

  it('prints the shop phone without a doubled country code', () => {
    const { container } = render(
      <PrintableReceipt
        sale={{ ...sale, shop: { name: 'El Roi Imports', phone: '+233+233555155972' } }}
        organization={{ name: 'El Roi Imports' }}
        printConfig={{ format: 'a4' }}
      />
    );
    expect(container.textContent).not.toContain('+233+233');
  });
});
