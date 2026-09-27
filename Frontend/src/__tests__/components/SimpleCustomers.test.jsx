import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SimpleCustomersList from '../../components/simple/SimpleCustomersList';
import SimpleCustomerForm from '../../components/simple/SimpleCustomerForm';

const customers = [
  { id: 'c1', name: 'Ama Mensah', phone: '+233+233241234567', balance: '0' },
  { id: 'c2', name: 'Kofi Boateng', phone: '0201234567', balance: '45.5' },
];

const listProps = () => ({
  customers,
  loading: false,
  totalCount: 2,
  search: '',
  onSearchChange: vi.fn(),
  onAdd: vi.fn(),
  onOpenCustomer: vi.fn(),
  page: 1,
  totalPages: 1,
  onPageChange: vi.fn(),
});

describe('SimpleCustomersList', () => {
  it('lists customers, shows who owes, and searches', () => {
    const p = listProps();
    render(<SimpleCustomersList {...p} />);
    expect(screen.getByText('2 customers')).toBeInTheDocument();
    expect(screen.getByText('+233241234567')).toBeInTheDocument();
    expect(screen.getAllByText('Owes')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'kofi' } });
    expect(p.onSearchChange).toHaveBeenCalledWith('kofi');
    fireEvent.click(screen.getByText('Kofi Boateng'));
    expect(p.onOpenCustomer).toHaveBeenCalledWith(customers[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));
    expect(p.onAdd).toHaveBeenCalledOnce();
  });
});

describe('SimpleCustomerForm', () => {
  it('requires a name and saves name, phone and email', () => {
    const onSave = vi.fn();
    render(<SimpleCustomerForm open onOpenChange={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(screen.getByRole('alert')).toHaveTextContent("Enter the customer's name.");
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Esi Owusu' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0241112222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Esi Owusu', phone: '0241112222', email: '' });
  });

  it('shows what an existing customer owes with Call and WhatsApp', () => {
    render(<SimpleCustomerForm open onOpenChange={vi.fn()} onSave={vi.fn()} customer={customers[1]} />);
    expect(screen.getByText('Owes you')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Call/ })).toHaveAttribute('href', expect.stringMatching(/^tel:\+?233201234567$/));
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/233201234567');
  });
});
