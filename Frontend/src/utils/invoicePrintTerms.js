const DEFAULT_TERMS_TEXT =
  'Payment is due within the specified payment terms. Late payments may incur additional charges.';

const looksLikeShortPaymentLabel = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  return text.length <= 48 && !/\n/.test(text);
};

/**
 * Printed T&C belong in the footer. Long copy is often stored on paymentTerms
 * and must not render in the header.
 * @param {object} invoice
 * @returns {string}
 */
export const resolvePrintedInvoiceTerms = (invoice) => {
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
};

export { DEFAULT_TERMS_TEXT };
