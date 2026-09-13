import {
  parsePaymentAmount,
  toInvoicePaymentMethod,
  validateRecordedPaymentAmount,
} from '@/utils/recordPayment';
import { computeRentalFinancials } from '@/utils/rentalFinancials';

describe('recordPayment', () => {
  it('maps card and momo onto invoice payment methods', () => {
    expect(toInvoicePaymentMethod('card')).toBe('credit_card');
    expect(toInvoicePaymentMethod('momo')).toBe('mobile_money');
    expect(toInvoicePaymentMethod('cash')).toBe('cash');
  });

  it('parses amounts with commas', () => {
    expect(parsePaymentAmount('1,250.50')).toBe(1250.5);
    expect(parsePaymentAmount('')).toBeNaN();
  });

  it('requires part payments to be below the remaining balance', () => {
    expect(validateRecordedPaymentAmount(40, 100, 'partial')).toBeNull();
    expect(validateRecordedPaymentAmount(100, 100, 'partial')).toMatch(/less than the balance/i);
    expect(validateRecordedPaymentAmount(100, 100, 'full')).toBeNull();
    expect(validateRecordedPaymentAmount(120, 100, 'partial')).toMatch(/cannot exceed/i);
    expect(validateRecordedPaymentAmount(0, 100, 'partial')).toMatch(/valid payment amount/i);
  });
});

describe('computeRentalFinancials', () => {
  it('computes hire balance and payment eligibility', () => {
    expect(computeRentalFinancials({
      totalDue: 400,
      amountPaid: 150,
      status: 'active',
      metadata: { invoiceId: 'inv-1' },
    })).toMatchObject({
      totalDue: 400,
      amountPaid: 150,
      balance: 250,
      invoiceId: 'inv-1',
      canRecordPayment: true,
    });
  });

  it('blocks payment on cancelled or fully paid rentals', () => {
    expect(computeRentalFinancials({
      totalDue: 400,
      amountPaid: 150,
      status: 'cancelled',
    }).canRecordPayment).toBe(false);
    expect(computeRentalFinancials({
      totalDue: 400,
      amountPaid: 400,
      status: 'active',
    }).canRecordPayment).toBe(false);
  });
});
