import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import CustomerEvatFields from '../../components/CustomerEvatFields';

function Harness(props) {
  const form = useForm({
    defaultValues: { taxId: '', ghanaCardPin: '' },
  });
  return (
    <MemoryRouter>
      <Form {...form}>
        <CustomerEvatFields control={form.control} {...props} />
      </Form>
    </MemoryRouter>
  );
}

describe('CustomerEvatFields', () => {
  it('hides TIN and Ghana Card PIN when e-VAT is off', () => {
    render(
      <Harness
        evatEnabled={false}
        isLoading={false}
        isManager
        onTurnOn={() => {}}
        turningOn={false}
      />
    );

    expect(screen.queryByLabelText(/TIN \(optional\)/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Ghana Card PIN \(optional\)/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Turn on e-VAT/i })).toBeInTheDocument();
    expect(screen.getByText(/Data may be sent to GRA when invoices are stamped/i)).toBeInTheDocument();
  });

  it('shows TIN and Ghana Card PIN when e-VAT is on', () => {
    render(
      <Harness
        evatEnabled
        isLoading={false}
        isManager
        onTurnOn={() => {}}
        turningOn={false}
      />
    );

    expect(screen.getByLabelText(/TIN \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ghana Card PIN \(optional\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Turn on e-VAT/i })).not.toBeInTheDocument();
    expect(screen.getByText(/e-VAT is on/i)).toBeInTheDocument();
  });

  it('calls onTurnOn when a manager clicks Turn on e-VAT', async () => {
    const user = userEvent.setup();
    const onTurnOn = vi.fn();
    render(
      <Harness
        evatEnabled={false}
        isLoading={false}
        isManager
        onTurnOn={onTurnOn}
        turningOn={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /Turn on e-VAT/i }));
    expect(onTurnOn).toHaveBeenCalledTimes(1);
  });

  it('does not show the Turn on button for staff', () => {
    render(
      <Harness
        evatEnabled={false}
        isLoading={false}
        isManager={false}
        onTurnOn={() => {}}
        turningOn={false}
      />
    );

    expect(screen.queryByRole('button', { name: /Turn on e-VAT/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Ask a manager to turn on e-VAT/i)).toBeInTheDocument();
  });
});
