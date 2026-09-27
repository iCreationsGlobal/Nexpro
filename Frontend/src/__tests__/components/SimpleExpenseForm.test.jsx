import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SimpleExpenseForm from '../../components/simple/SimpleExpenseForm';

const setup = (props = {}) => {
  const onSave = vi.fn();
  render(<SimpleExpenseForm open onOpenChange={vi.fn()} onSave={onSave} {...props} />);
  return { onSave };
};

describe('SimpleExpenseForm', () => {
  it('saves the picked tile, amount and date', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('radio', { name: /Transport/ }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '45.50' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Expense/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ category: 'Transport', amount: 45.5 }));
    expect(onSave.mock.calls[0][0].expenseDate).toBeInstanceOf(Date);
  });

  it('asks for a picture and an amount before saving', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Save Expense/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Tap what you spent money on.');
    fireEvent.click(screen.getByRole('radio', { name: /Rent/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save Expense/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the amount you spent.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('uses the typed name for Other', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('radio', { name: /Other/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Phone credit'), { target: { value: 'Phone credit' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Expense/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ category: 'Phone credit', amount: 10 }));
  });

  it('opens an existing expense on its tile and offers Remove', () => {
    const onRemove = vi.fn();
    setup({ expense: { category: 'Electricity', amount: '120', expenseDate: '2026-09-20' }, onRemove });
    expect(screen.getByRole('radio', { name: /Electricity/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Amount')).toHaveValue('120');
    fireEvent.click(screen.getByRole('button', { name: 'Remove this expense' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
