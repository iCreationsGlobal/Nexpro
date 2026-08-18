import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERMS_TEXT,
  resolvePrintedInvoiceTerms,
} from '../../utils/invoicePrintTerms';

describe('resolvePrintedInvoiceTerms', () => {
  it('uses long paymentTerms in the footer when T&C is empty', () => {
    const paymentTerms =
      'The implementation of the ABS Enterprise Starter Package shall commence on 5th September 2026.';
    expect(resolvePrintedInvoiceTerms({ paymentTerms })).toBe(paymentTerms);
  });

  it('ignores short payment labels like Net 30 when T&C is empty', () => {
    expect(resolvePrintedInvoiceTerms({ paymentTerms: 'Net 30' })).toBe(DEFAULT_TERMS_TEXT);
  });

  it('prefers custom T&C over a short payment label', () => {
    expect(
      resolvePrintedInvoiceTerms({
        paymentTerms: 'Net 30',
        termsAndConditions: 'Balance due before delivery.',
      })
    ).toBe('Balance due before delivery.');
  });

  it('does not duplicate custom terms stored on both fields', () => {
    const terms = 'Deposit of GH₵ 3,500.00 is required before work starts.';
    expect(
      resolvePrintedInvoiceTerms({
        paymentTerms: terms,
        termsAndConditions: terms,
      })
    ).toBe(terms);
  });
});
