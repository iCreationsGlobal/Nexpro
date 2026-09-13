const DEFAULT_TERMS_TEXT =
  'Payment is due within the specified payment terms. Late payments may incur additional charges.';

function looksLikeShortPaymentLabel(value: unknown): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  return text.length <= 48 && !/\n/.test(text);
}

/** Printed T&C for invoice PDF footer (matches web PrintableInvoice). */
export function resolvePrintedInvoiceTerms(invoice: {
  paymentTerms?: unknown;
  termsAndConditions?: unknown;
}): string {
  const paymentTerms = String(invoice?.paymentTerms || '').trim();
  const termsAndConditions = String(invoice?.termsAndConditions || '').trim();
  const shortPaymentLabel = looksLikeShortPaymentLabel(paymentTerms);

  if (paymentTerms && !shortPaymentLabel) {
    if (
      !termsAndConditions ||
      termsAndConditions === DEFAULT_TERMS_TEXT ||
      termsAndConditions === paymentTerms
    ) {
      return paymentTerms;
    }
    if (termsAndConditions.includes(paymentTerms)) return termsAndConditions;
    if (paymentTerms.includes(termsAndConditions)) return paymentTerms;
    return `${paymentTerms}\n\n${termsAndConditions}`;
  }

  return termsAndConditions || DEFAULT_TERMS_TEXT;
}

export { DEFAULT_TERMS_TEXT };
