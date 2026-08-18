/**
 * Product stock helpers — aligned with web POS (`Frontend/src/pages/POS.jsx`).
 */

export type ProductVariantStockInput = {
  id?: string;
  name?: string;
  sku?: string;
  barcode?: string;
  sellingPrice?: number | null;
  quantityOnHand?: number | null;
  trackStock?: boolean | null;
  isActive?: boolean;
  attributes?: Record<string, string | undefined> | null;
};

export type ProductStockInput = {
  trackStock?: boolean;
  quantityOnHand?: number | null;
  name?: string;
  hasVariants?: boolean;
  variants?: ProductVariantStockInput[] | null;
};

const parseQuantity = (value: unknown): number => {
  const qty = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(qty) ? qty : 0;
};

/** Active variants only (matches web `getActiveVariants`). */
export function getActiveVariants(
  product: ProductStockInput | null | undefined
): ProductVariantStockInput[] {
  if (!Array.isArray(product?.variants)) return [];
  return product.variants.filter((variant) => variant?.isActive !== false);
}

/** True when the product should force a variant pick before sell/restock. */
export function productRequiresVariantSelection(
  product: ProductStockInput | null | undefined
): boolean {
  if (!product) return false;
  return getActiveVariants(product).length > 0 || Boolean(product.hasVariants);
}

export function isVariantOutOfStock(
  product: ProductStockInput | null | undefined,
  variant: ProductVariantStockInput | null | undefined
): boolean {
  if (!variant || product?.trackStock === false || variant.trackStock === false) return false;
  const qty = Number(variant.quantityOnHand);
  return Number.isFinite(qty) && qty <= 0;
}

export function getVariantLabel(variant: ProductVariantStockInput | null | undefined): string {
  if (!variant) return '';
  const attributeText = Object.values(variant.attributes || {})
    .filter(Boolean)
    .join(' / ');
  return variant.name || attributeText || variant.sku || 'Variant';
}

/**
 * Effective stock for display. Variant parents use the sum of active variant quantities.
 */
export function getProductStockQuantity(product: ProductStockInput | null | undefined): number {
  if (!product) return 0;
  if (!product.hasVariants) return parseQuantity(product.quantityOnHand);

  const variants = getActiveVariants(product);
  if (variants.length > 0) {
    return variants.reduce((total, variant) => total + Math.max(parseQuantity(variant.quantityOnHand), 0), 0);
  }

  return parseQuantity(product.quantityOnHand);
}

/** True when stock is tracked and on-hand quantity is zero or less. */
export function isProductOutOfStock(product: ProductStockInput | null | undefined): boolean {
  if (!product || product.trackStock === false) return false;
  const variants = getActiveVariants(product);
  if (variants.length > 0) {
    return variants.every((variant) => isVariantOutOfStock(product, variant));
  }
  const qty = Number(product.quantityOnHand);
  return Number.isFinite(qty) && qty <= 0;
}

export function getOutOfStockMessage(productName?: string): string {
  return `${productName || 'Product'} is out of stock and cannot be sold.`;
}

/** Max sellable quantity when stock is tracked; null means no cap. */
export function getMaxQuantityForCartItem(item: ProductStockInput | null | undefined): number | null {
  if (!item || item.trackStock === false) return null;
  const qty = Number(item.quantityOnHand);
  if (!Number.isFinite(qty)) return null;
  return Math.max(0, Math.floor(qty));
}

export type CartQuantityValidation =
  | { valid: true; quantity: number; removes?: boolean }
  | { valid: false; error: string };

export function validateCartQuantityInput(
  rawValue: string,
  item: ProductStockInput | null | undefined
): CartQuantityValidation {
  const trimmed = String(rawValue ?? '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Enter a quantity' };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: 'Whole numbers only' };
  }

  const quantity = parseInt(trimmed, 10);
  if (!Number.isFinite(quantity)) {
    return { valid: false, error: 'Enter a valid quantity' };
  }
  if (quantity <= 0) {
    return { valid: true, quantity: 0, removes: true };
  }

  const max = getMaxQuantityForCartItem(item);
  if (max !== null && quantity > max) {
    const label = max === 0 ? 'Out of stock' : `Only ${max} in stock`;
    return { valid: false, error: label };
  }

  return { valid: true, quantity };
}
