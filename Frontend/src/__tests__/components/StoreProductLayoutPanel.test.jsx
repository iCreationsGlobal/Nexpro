import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import StoreProductLayoutPanel from '../../components/store/StoreProductLayoutPanel';

afterEach(cleanup);

const group = (name) => within(screen.getByRole('group', { name }));
const chosen = (name) => group(name).getAllByRole('button').filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.textContent);
const preview = () => within(screen.getByTestId('product-layout-preview'));

describe('product layout settings', () => {
  it('starts with two on phones and the template on computers', () => {
    render(<StoreProductLayoutPanel templateId="minimal" onSave={vi.fn()} />);
    expect(chosen('Phones')).toEqual(['2 per rowCompact cards']);
    expect(chosen('Computers')).toEqual(['Template3 per row']);
    expect(chosen('Cards on computers')).toEqual(['LargeLabels and buttons']);
    expect(preview().getByLabelText('Phone: 2 per row')).toBeInTheDocument();
    expect(preview().getByLabelText('Computer: 3 per row')).toBeInTheDocument();
  });

  it('shows what was saved', () => {
    render(<StoreProductLayoutPanel value={{ phone: 1, computer: 6, computerCards: 'compact' }} onSave={vi.fn()} />);
    expect(chosen('Phones')).toEqual(['1 per rowLarge cards']);
    expect(chosen('Computers')).toEqual(['6per row']);
    expect(chosen('Cards on computers')).toEqual(['CompactImage, name and price']);
  });

  it('previews and saves the choices', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<StoreProductLayoutPanel templateId="classic" onSave={onSave} />);
    await user.click(group('Phones').getByRole('button', { name: /1 per row/ }));
    await user.click(group('Computers').getByRole('button', { name: /^5/ }));
    expect(preview().getByLabelText('Phone: 1 per row')).toBeInTheDocument();
    expect(preview().getByLabelText('Computer: 5 per row')).toBeInTheDocument();
    expect(screen.getByText('Compact cards fit best with 5 or 6 per row.')).toBeInTheDocument();
    await user.click(group('Cards on computers').getByRole('button', { name: /Compact/ }));
    expect(screen.queryByText('Compact cards fit best with 5 or 6 per row.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    expect(onSave).toHaveBeenCalledWith({ phone: 1, computer: 5, computerCards: 'compact' });
  });

  it('can go back to the template', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<StoreProductLayoutPanel value={{ computer: 6 }} templateId="catalog" onSave={onSave} />);
    await user.click(group('Computers').getByRole('button', { name: /Template/ }));
    expect(preview().getByLabelText('Computer: 2 per row')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    expect(onSave).toHaveBeenCalledWith({ phone: 2, computer: null, computerCards: 'large' });
  });

  it('cannot be saved twice', () => {
    render(<StoreProductLayoutPanel saving onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save layout' })).toBeDisabled();
  });
});
