type AnyRecord = Record<string, unknown>;

function text(value: unknown): string {
  if (value && typeof value === 'object') return '';
  return String(value ?? '').trim();
}

/**
 * Resolve the unit abbreviation/symbol for a document line item.
 */
export function getLineItemUnitSymbol(item: AnyRecord): string {
  const metadata = (item?.metadata as AnyRecord) || {};
  const specifications = (item?.specifications as AnyRecord) || {};
  const product = (item?.product as AnyRecord) || {};

  const candidates = [
    item?.unitSymbol,
    item?.unit,
    metadata.unitSymbol,
    metadata.unit,
    specifications.unitSymbol,
    specifications.unit,
    specifications.itemUnit,
    item?.itemUnit,
    product.unit,
  ];

  const unit = candidates.map((value) => text(value)).find(Boolean);
  if (unit) return unit;
  if (text(item?.pricingMethod) === 'square_foot') return 'sq ft';
  return '';
}

export function formatDocumentQuantity(quantity: number | string, unitSymbol = ''): string {
  const parsed = parseFloat(String(quantity));
  const value = Number.isFinite(parsed) ? parsed : 1;
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
  const unit = unitSymbol ? String(unitSymbol).trim() : '';
  return unit ? `${formatted} (${unit})` : formatted;
}

export function formatLineItemQuantity(item: AnyRecord, quantityOverride?: number | string): string {
  const quantity = quantityOverride ?? item?.quantity ?? 1;
  return formatDocumentQuantity(quantity as number | string, getLineItemUnitSymbol(item));
}
