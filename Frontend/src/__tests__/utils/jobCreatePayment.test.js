const {
  buildJobCreatePaymentPayload,
} = require('../../utils/jobCreatePayment');

describe('buildJobCreatePaymentPayload', () => {
  it('sends unpaid only', () => {
    expect(buildJobCreatePaymentPayload({ paymentStatus: 'unpaid' })).toEqual({
      paymentStatus: 'unpaid',
    });
  });

  it('includes deposit amount and method', () => {
    expect(buildJobCreatePaymentPayload({
      paymentStatus: 'deposit',
      paymentAmount: '25.5',
      paymentMethod: 'cash',
      paymentReference: 'R-9',
    })).toEqual({
      paymentStatus: 'deposit',
      amountPaid: 25.5,
      paymentMethod: 'cash',
      paymentReference: 'R-9',
    });
  });

  it('omits amount for paid in full so the server locks to invoice total', () => {
    expect(buildJobCreatePaymentPayload({
      paymentStatus: 'paid',
      paymentAmount: '100',
      paymentMethod: 'mobile_money',
    })).toEqual({
      paymentStatus: 'paid',
      paymentMethod: 'mobile_money',
    });
  });
});
