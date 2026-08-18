/**
 * POS tiles must always have a visible label. Empty names happen on some
 * variant-only catalog rows; fall back to SKU rather than a blank card.
 * @param {object} product
 * @returns {string}
 */
export function getPosProductDisplayName(product) {
  const name = String(product?.name || '').trim();
  if (name) return name;
  const sku = String(product?.sku || '').trim();
  if (sku) return sku;
  return 'Unnamed product';
}
