import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PrintableInvoice from '../../components/PrintableInvoice';

vi.mock('../../utils/fileUtils', () => ({
  resolveImageUrl: (value) => {
    if (!value) return '';
    const decoded = value.replace(/&#x2F;/g, '/');
    return decoded.startsWith('http') ? decoded : `https://api.example.com${decoded}`;
  },
}));

const invoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-001',
  invoiceDate: '2026-09-01',
  items: [],
  subtotal: 0,
  total: 0,
  balance: 0,
  amountPaid: 0,
};

const baseOrg = {
  name: 'ShopCyndy',
  address: { line1: 'Osu, Oxford Street, Accra', city: 'Accra', country: 'Ghana' },
  invoiceFooter: 'MoMo: 0244 000 000',
};

describe('PrintableInvoice (A4)', () => {
  it('prints the city once when the street line already includes it', () => {
    const { container } = render(<PrintableInvoice invoice={invoice} organization={baseOrg} />);
    const address = container.querySelector('.company-details-line--desktop').textContent;
    expect(address.match(/Accra/g)).toHaveLength(1);
    expect(address).toContain('Ghana');
  });

  it('keeps the city when the street line does not include it', () => {
    const org = { ...baseOrg, address: { line1: '12 Ring Road', city: 'Accra' } };
    const { container } = render(<PrintableInvoice invoice={invoice} organization={org} />);
    expect(container.querySelector('.company-details-line--desktop').textContent).toContain('Accra');
  });

  it('shows the logo from an HTML-escaped path and falls back to the name if it fails', () => {
    const org = { ...baseOrg, logoUrl: '&#x2F;uploads&#x2F;logo.png' };
    render(<PrintableInvoice invoice={invoice} organization={org} />);
    const logo = screen.getByAltText('ShopCyndy');
    expect(logo).toHaveAttribute('src', 'https://api.example.com/uploads/logo.png');
    fireEvent.error(logo);
    expect(screen.queryByAltText('ShopCyndy')).not.toBeInTheDocument();
    expect(screen.getByText('ShopCyndy')).toBeInTheDocument();
  });

  it('prints the footer (payment details)', () => {
    render(<PrintableInvoice invoice={invoice} organization={baseOrg} />);
    expect(screen.getByText('MoMo: 0244 000 000')).toBeInTheDocument();
  });
});
