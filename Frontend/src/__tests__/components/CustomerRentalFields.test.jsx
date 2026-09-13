import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import CustomerRentalFields from '../../components/CustomerRentalFields';
import { RENTAL_FORM_DEFAULTS } from '../../utils/customerRentalMetadata';

function Harness() {
  const form = useForm({
    defaultValues: RENTAL_FORM_DEFAULTS,
  });
  return (
    <Form {...form}>
      <CustomerRentalFields control={form.control} />
    </Form>
  );
}

describe('CustomerRentalFields', () => {
  it('does not show deposit, down payment, or delivery address fields', () => {
    render(<Harness />);

    expect(screen.queryByText('Deposit & down payment')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Standard deposit amount/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Deposit paid/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Down payment amount/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Down payment date/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Delivery')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Delivery address/i)).not.toBeInTheDocument();

    expect(screen.getByText('Rental information')).toBeInTheDocument();
    expect(screen.getByLabelText('Renter type')).toBeInTheDocument();
  });
});
