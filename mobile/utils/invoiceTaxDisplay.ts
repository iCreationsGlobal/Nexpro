type AnyRecord = Record<string, unknown>;

const roundCurrency = (value: unknown): number =>
  Math.round((parseFloat(String(value ?? 0)) || 0) * 100) / 100;

function getOrganizationTax(invoice: AnyRecord, organization: AnyRecord) {
  const orgTax = organization?.tax;
  const invoiceOrgTax = (invoice?.organization as AnyRecord | undefined)?.tax;
  if (orgTax && typeof orgTax === 'object') return orgTax as AnyRecord;
  if (invoiceOrgTax && typeof invoiceOrgTax === 'object') return invoiceOrgTax as AnyRecord;
  return {};
}

/**
 * Normalize invoice totals for tax display, including legacy inclusive-tax invoices.
 */
export function getInvoiceTaxDisplay(invoice: AnyRecord, organization: AnyRecord = {}) {
  const tax = getOrganizationTax(invoice, organization);
  const taxRate = parseFloat(String(invoice?.taxRate ?? 0)) || 0;
  const storedTaxAmount = roundCurrency(invoice?.taxAmount);
  const totalAmount = roundCurrency(invoice?.totalAmount ?? invoice?.total);
  const storedSubtotal = roundCurrency(invoice?.subtotal);
  const storedDiscountAmount = roundCurrency(invoice?.discountAmount);
  const isTaxInclusive = tax?.pricesAreTaxInclusive === true;
  const displayLabel = String(tax?.displayLabel || 'Tax');

  if (!isTaxInclusive || taxRate <= 0 || storedTaxAmount > 0 || totalAmount <= 0) {
    return {
      subtotal: storedSubtotal,
      discountAmount: storedDiscountAmount,
      taxAmount: storedTaxAmount,
      taxLabel: isTaxInclusive ? `${displayLabel} included` : displayLabel,
      isTaxInclusive,
      hasTax: storedTaxAmount > 0,
    };
  }

  const netTaxable = roundCurrency(totalAmount / (1 + taxRate / 100));
  const includedTaxAmount = roundCurrency(totalAmount - netTaxable);
  const discountAmount = roundCurrency(storedDiscountAmount / (1 + taxRate / 100));
  const subtotal =
    storedSubtotal > 0
      ? roundCurrency(storedSubtotal / (1 + taxRate / 100))
      : roundCurrency(netTaxable + discountAmount);

  return {
    subtotal,
    discountAmount,
    taxAmount: includedTaxAmount,
    taxLabel: `${displayLabel} included`,
    isTaxInclusive,
    hasTax: includedTaxAmount > 0,
  };
}
