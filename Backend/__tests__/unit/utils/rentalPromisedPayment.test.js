const {
  parsePromisedPaymentDate,
  getPromisedPaymentDate,
  hasOutstandingHire,
  isPromisedPaymentDue,
} = require('../../../utils/rentalPromisedPayment');

describe('rentalPromisedPayment', () => {
  it('parses YYYY-MM-DD and rejects junk', () => {
    expect(parsePromisedPaymentDate('2026-09-05')).toBe('2026-09-05');
    expect(parsePromisedPaymentDate('2026-09-05T12:00:00.000Z')).toBe('2026-09-05');
    expect(parsePromisedPaymentDate('')).toBeNull();
    expect(parsePromisedPaymentDate('soon')).toBeNull();
  });

  it('reads the date from rental metadata', () => {
    expect(getPromisedPaymentDate({ metadata: { promisedPaymentDate: '2026-09-01' } }))
      .toBe('2026-09-01');
    expect(getPromisedPaymentDate({ metadata: {} })).toBeNull();
  });

  it('treats hire as outstanding until rental or invoice is paid', () => {
    expect(hasOutstandingHire({ amountPaid: 0, totalDue: 500 })).toBe(true);
    expect(hasOutstandingHire({ amountPaid: 500, totalDue: 500 })).toBe(false);
    expect(hasOutstandingHire({ amountPaid: 0, totalDue: 500 }, { status: 'paid', balance: 0 }))
      .toBe(false);
    expect(hasOutstandingHire({ amountPaid: 0, totalDue: 500 }, { status: 'sent', balance: 200 }))
      .toBe(true);
  });

  it('is due only when the promised date has arrived and hire is unpaid', () => {
    const rental = {
      amountPaid: 0,
      totalDue: 500,
      metadata: { promisedPaymentDate: '2026-08-29' },
    };
    expect(isPromisedPaymentDue(rental, '2026-08-29')).toBe(true);
    expect(isPromisedPaymentDue(rental, '2026-08-28')).toBe(false);
    expect(isPromisedPaymentDue({ ...rental, amountPaid: 500 }, '2026-08-29')).toBe(false);
  });
});
