const {
  resolveJobCreatePaymentIntent,
  amountForInvoice,
  extractJobCreatePaymentBody,
  isInvoiceFullyPaid,
  normalizeJobPaymentMethod,
} = require('../../../utils/jobCreatePayment');

describe('jobCreatePayment', () => {
  describe('resolveJobCreatePaymentIntent', () => {
    it('defaults to unpaid', () => {
      expect(resolveJobCreatePaymentIntent({})).toEqual({ ok: true, status: 'unpaid' });
    });

    it('requires a payment method for deposit and paid', () => {
      expect(resolveJobCreatePaymentIntent({ paymentStatus: 'deposit', amountPaid: 10 }).ok).toBe(false);
      expect(resolveJobCreatePaymentIntent({ paymentStatus: 'paid' }).ok).toBe(false);
    });

    it('maps momo and card aliases', () => {
      const deposit = resolveJobCreatePaymentIntent({
        paymentStatus: 'deposit',
        amountPaid: 40,
        paymentMethod: 'momo',
      }, { jobTotal: 100 });
      expect(deposit).toMatchObject({ ok: true, status: 'deposit', amount: 40, paymentMethod: 'mobile_money' });

      const paid = resolveJobCreatePaymentIntent({
        paymentStatus: 'paid',
        paymentMethod: 'card',
      }, { jobTotal: 100 });
      expect(paid).toMatchObject({ ok: true, status: 'paid', amount: 100, paymentMethod: 'credit_card' });
    });

    it('rejects a deposit that is not less than the job total', () => {
      const result = resolveJobCreatePaymentIntent({
        paymentStatus: 'deposit',
        amountPaid: 100,
        paymentMethod: 'cash',
      }, { jobTotal: 100 });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/less than the job total/i);
    });

    it('rejects a zero deposit', () => {
      const result = resolveJobCreatePaymentIntent({
        paymentStatus: 'deposit',
        amountPaid: 0,
        paymentMethod: 'cash',
      }, { jobTotal: 100 });
      expect(result.ok).toBe(false);
    });
  });

  describe('amountForInvoice', () => {
    it('locks paid amount to the invoice total', () => {
      expect(amountForInvoice({ ok: true, status: 'paid', amount: 80 }, 120)).toEqual({
        amount: 120,
        fullyPaid: true,
      });
    });

    it('caps deposit at the invoice total and treats a full cover as paid', () => {
      expect(amountForInvoice({ ok: true, status: 'deposit', amount: 40 }, 100)).toEqual({
        amount: 40,
        fullyPaid: false,
      });
      expect(amountForInvoice({ ok: true, status: 'deposit', amount: 100 }, 100)).toEqual({
        amount: 100,
        fullyPaid: true,
      });
    });

    it('returns null for unpaid', () => {
      expect(amountForInvoice({ ok: true, status: 'unpaid' }, 100)).toBeNull();
    });
  });

  describe('extractJobCreatePaymentBody', () => {
    it('strips payment fields so they are not stored on Job', () => {
      const { paymentBody, rest } = extractJobCreatePaymentBody({
        title: 'Banner',
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        amountPaid: 50,
      });
      expect(paymentBody).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'cash', amountPaid: 50 });
      expect(rest).toEqual({ title: 'Banner' });
    });
  });

  describe('isInvoiceFullyPaid', () => {
    it('treats paid status or zero remaining balance as fully paid', () => {
      expect(isInvoiceFullyPaid({ status: 'paid', amountPaid: 10, totalAmount: 10, balance: 0 })).toBe(true);
      expect(isInvoiceFullyPaid({ status: 'sent', amountPaid: 100, totalAmount: 100, balance: 0 })).toBe(true);
      expect(isInvoiceFullyPaid({ status: 'sent', amountPaid: 40, totalAmount: 100, balance: 60 })).toBe(false);
      expect(isInvoiceFullyPaid({ status: 'sent', amountPaid: 0, totalAmount: 100, balance: 100 })).toBe(false);
    });
  });

  describe('normalizeJobPaymentMethod', () => {
    it('normalizes cheque and bank aliases', () => {
      expect(normalizeJobPaymentMethod('cheque')).toBe('check');
      expect(normalizeJobPaymentMethod('bank')).toBe('bank_transfer');
    });
  });
});
