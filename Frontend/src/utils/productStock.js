const parseQuantity = (value) => {
  const qty = Number.parseFloat(value);
  return Number.isFinite(qty) ? qty : 0;
};

const parsePrice = (value) => {
  const price = Number(value);
  return Number.isFinite(price) ? price : 0;
};

/**
 * Active variants only (inactive rows are ignored for stock and price).
 * @param {{ variants?: Array } | null | undefined} product
 * @returns {Array}
 */
export const getActiveVariants = (product) => (
  Array.isArray(product?.variants)
    ? product.variants.filter((variant) => variant?.isActive !== false)
    : []
);

const sumActiveVariantQuantity = (variants) => (
  variants.reduce((total, variant) => total + Math.max(parseQuantity(variant?.quantityOnHand), 0), 0)
);

/**
 * Effective stock for display and availability checks.
 * Variant parents use the sum of active variant quantities, then `totalVariantStock`,
 * then parent `quantityOnHand` (parent is often 0 while variants hold the stock).
 * @param {{ hasVariants?: boolean, quantityOnHand?: number | string | null, totalVariantStock?: number | string | null, variants?: Array }} product
 * @returns {number}
 */
export const getProductStockQuantity = (product) => {
  if (!product) return 0;

  const variants = getActiveVariants(product);
  const variantSum = sumActiveVariantQuantity(variants);
  const hasTotalVariantStock = product.totalVariantStock != null && product.totalVariantStock !== '';
  const totalVariantStock = hasTotalVariantStock
    ? Math.max(parseQuantity(product.totalVariantStock), 0)
    : null;
  const parentQty = parseQuantity(product.quantityOnHand);
  const isVariantProduct = Boolean(product.hasVariants) || variants.length > 0;

  if (!isVariantProduct) return parentQty;
  if (variantSum > 0) return variantSum;
  if (totalVariantStock != null) return totalVariantStock;
  return parentQty;
};

/**
 * @param {{ trackStock?: boolean } | null | undefined} product
 * @param {{ quantityOnHand?: number | string | null, trackStock?: boolean } | null | undefined} variant
 * @returns {boolean}
 */
export const isVariantOutOfStock = (product, variant) => {
  if (!variant || product?.trackStock === false || variant.trackStock === false) return false;
  const qty = Number(variant.quantityOnHand);
  return Number.isFinite(qty) && qty <= 0;
};

/**
 * True when stock is tracked and effective on-hand quantity is zero or less.
 * Variant parents are in stock when any active variant has stock, or when
 * `totalVariantStock` / parent quantity still has units (Products-page total).
 * @param {{ trackStock?: boolean, hasVariants?: boolean, quantityOnHand?: number | string | null, totalVariantStock?: number | string | null, variants?: Array } | null | undefined} product
 * @returns {boolean}
 */
export const isProductOutOfStock = (product) => {
  if (!product || product.trackStock === false) return false;
  const variants = getActiveVariants(product);
  if (variants.length > 0) {
    const allVariantsOutOfStock = variants.every((variant) => isVariantOutOfStock(product, variant));
    if (!allVariantsOutOfStock) return false;
  }
  return getProductStockQuantity(product) <= 0;
};

/**
 * Catalog / tile unit price. When a variant is selected, use that variant's price.
 * When the parent price is 0, fall back to the lowest positive active-variant price.
 * @param {{ sellingPrice?: number | string | null, variants?: Array } | null | undefined} product
 * @param {{ sellingPrice?: number | string | null } | null} [variant]
 * @returns {number}
 */
export const getCatalogUnitPrice = (product, variant = null) => {
  if (variant) {
    const variantPrice = parsePrice(variant.sellingPrice);
    if (variantPrice > 0) return variantPrice;
    return parsePrice(product?.sellingPrice);
  }

  const parentPrice = parsePrice(product?.sellingPrice);
  if (parentPrice > 0) return parentPrice;

  const variantPrices = getActiveVariants(product)
    .map((item) => parsePrice(item?.sellingPrice))
    .filter((price) => price > 0);
  if (variantPrices.length === 0) return parentPrice;
  return Math.min(...variantPrices);
};
