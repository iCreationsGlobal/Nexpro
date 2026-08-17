import {
  buildJobCreatePaymentPayload,
  validateJobCreatePayment,
} from '@/utils/jobCreatePayment';

describe('jobCreatePayment', () => {
  it('validates deposit against job total', () => {
    expect(validateJobCreatePayment({ paymentStatus: 'unpaid' }, 100)).toBeNull();
    expect(validateJobCreatePayment({ paymentStatus: 'paid', paymentMethod: 'cash' }, 100)).toBeNull();
    expect(validateJobCreatePayment({ paymentStatus: 'deposit', paymentMethod: 'cash', paymentAmount: '40' }, 100)).toBeNull();
    expect(validateJobCreatePayment({ paymentStatus: 'deposit', paymentMethod: 'cash', paymentAmount: '100' }, 100)).toMatch(/less than the job total/i);
  });

  it('maps card to credit_card on the API payload', () => {
    expect(buildJobCreatePaymentPayload({
      paymentStatus: 'paid',
      paymentMethod: 'card',
    })).toEqual({
      paymentStatus: 'paid',
      paymentMethod: 'credit_card',
    });
  });
});
