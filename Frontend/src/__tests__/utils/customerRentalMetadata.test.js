import {
  RENTAL_FORM_DEFAULTS,
  buildRentalMetadataFromForm,
  rentalFormValuesFromCustomer,
} from '../../utils/customerRentalMetadata';

describe('customerRentalMetadata', () => {
  it('does not collect deposit, down payment, or delivery from form values', () => {
    const rental = buildRentalMetadataFromForm({
      rentalRenterType: 'individual',
      rentalStandardDepositAmount: '500',
      rentalDepositPaid: true,
      rentalDownPaymentAmount: '200',
      rentalDownPaymentDate: '2026-08-01',
      rentalDeliveryAddress: '12 Independence Ave',
      rentalDeliveryCity: 'Accra',
      rentalDeliveryState: 'Greater Accra',
      rentalDeliveryDistanceKm: '8',
    });

    expect(rental).toEqual({ renterType: 'individual' });
    expect(rental).not.toHaveProperty('deposit');
    expect(rental).not.toHaveProperty('downPayment');
    expect(rental).not.toHaveProperty('delivery');
  });

  it('does not expose deposit or delivery fields on form defaults or edit mapping', () => {
    expect(RENTAL_FORM_DEFAULTS).not.toHaveProperty('rentalStandardDepositAmount');
    expect(RENTAL_FORM_DEFAULTS).not.toHaveProperty('rentalDepositPaid');
    expect(RENTAL_FORM_DEFAULTS).not.toHaveProperty('rentalDownPaymentAmount');
    expect(RENTAL_FORM_DEFAULTS).not.toHaveProperty('rentalDeliveryAddress');

    const values = rentalFormValuesFromCustomer({
      metadata: {
        rental: {
          deposit: { standardDepositAmount: 750, depositPaid: true },
          downPayment: { amount: 100, date: '2026-01-01' },
          delivery: { address: 'Old warehouse' },
        },
      },
    });

    expect(values).not.toHaveProperty('rentalStandardDepositAmount');
    expect(values).not.toHaveProperty('rentalDepositPaid');
    expect(values).not.toHaveProperty('rentalDownPaymentAmount');
    expect(values).not.toHaveProperty('rentalDeliveryAddress');
  });
});
