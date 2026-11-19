/**
 * What the cart line pop-up shows: the line itself, filled in with the product (and the size or
 * colour) when it has been fetched. Anything empty is left out.
 */
import type { CartItem } from '@/context/CartContext';
import { formatCurrency, formatInteger } from '@/utils/formatCurrency';
import { getMaxQuantityForCartItem, getVariantLabel, type ProductVariantStockInput } from '@/utils/productStock';

export type CartLineProduct = {
  id?: string;
  name?: string;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  unit?: string | null;
  brand?: string | null;
  category?: { name?: string | null } | null;
  categoryName?: string | null;
  trackStock?: boolean | null;
  quantityOnHand?: number | string | null;
  hasVariants?: boolean;
  variants?: ProductVariantStockInput[] | null;
  metadata?: { storeImages?: Record<string, unknown> | null } | null;
};

export type CartLineDetails = {
  name: string;
  variantName: string | null;
  attributes: Array<{ label: string; value: string }>;
  photos: string[];
  unitPrice: number;
  quantity: number;
  discount: number;
  lineTotal: number;
  facts: Array<{ label: string; value: string }>;
  description: string | null;
  /** Most that can be sold (stock on hand); null when there is no limit. */
  maxQuantity: number | null;
};

const STORE_IMAGE_SLOTS = ['B', 'C', 'D', 'E'];

const ATTRIBUTE_LABELS: Record<string, string> = {
  size: 'Size',
  color: 'Colour',
  colour: 'Colour',
  model: 'Model',
};

const text = (value: unknown): string => (value == null ? '' : String(value).trim());

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** The size or colour this line is for, from the fetched product. */
export function findLineVariant(
  line: Pick<CartItem, 'productVariantId'>,
  product?: CartLineProduct | null,
  variants?: ProductVariantStockInput[] | null
): ProductVariantStockInput | null {
  const id = line.productVariantId;
  if (!id) return null;
  const pool = [...(product?.variants || []), ...(variants || [])];
  return pool.find((variant) => variant?.id === id) ?? null;
}

/** Main photo, then any extra photos, without repeats. */
export function productPhotos(product?: CartLineProduct | null, fallback?: string | null): string[] {
  const photos: string[] = [];
  const add = (value: unknown) => {
    const url = text(value);
    if (url && !photos.includes(url)) photos.push(url);
  };
  if (product) {
    add(product.imageUrl);
    const extra = product.metadata?.storeImages;
    if (extra && typeof extra === 'object') STORE_IMAGE_SLOTS.forEach((slot) => add(extra[slot]));
  }
  if (photos.length === 0) add(fallback);
  return photos;
}

export function buildCartLineDetails(
  line: CartItem,
  product?: CartLineProduct | null,
  variant?: ProductVariantStockInput | null
): CartLineDetails {
  const isVariantLine = Boolean(line.productVariantId);
  const unitPrice = Number(line.unitPrice) || 0;
  const quantity = Number(line.quantity) || 0;
  const discount = Math.max(0, Number(line.discount) || 0);

  const name = text(product?.name) || text(line.name) || 'Product';
  const variantName = variant ? getVariantLabel(variant) : null;
  const attributes = Object.entries(variant?.attributes || {})
    .map(([key, value]) => ({
      label: ATTRIBUTE_LABELS[key.toLowerCase()] || key.charAt(0).toUpperCase() + key.slice(1),
      value: text(value),
    }))
    .filter((row) => row.value && row.value !== variantName);

  // A size's own barcode and SKU; until the size is loaded, the line's (saved from it when added).
  const barcode = isVariantLine
    ? (variant ? text(variant.barcode) : text(line.barcode))
    : text(line.barcode) || text(product?.barcode);
  const sku = isVariantLine
    ? (variant ? text(variant.sku) : text(line.sku))
    : text(line.sku) || text(product?.sku);

  const trackStock =
    product?.trackStock === false || variant?.trackStock === false
      ? false
      : line.trackStock ?? product?.trackStock ?? undefined;
  const stock = isVariantLine
    ? numberOrNull(variant?.quantityOnHand) ?? numberOrNull(line.quantityOnHand)
    : numberOrNull(product?.quantityOnHand) ?? numberOrNull(line.quantityOnHand);

  const facts: Array<{ label: string; value: string }> = [];
  const addFact = (label: string, value: string) => {
    if (value) facts.push({ label, value });
  };
  addFact('Barcode', barcode);
  addFact('SKU', sku);
  addFact('Category', text(product?.category?.name) || text(product?.categoryName));
  addFact('Brand', text(product?.brand));
  addFact('Unit', text(product?.unit));
  if (trackStock === false) {
    addFact('In stock', 'Made to order');
  } else if (stock !== null) {
    addFact('In stock', stock > 0 ? formatInteger(stock) : 'Out of stock');
  }
  if (discount > 0) addFact('Discount', `−${formatCurrency(discount)}`);

  return {
    name,
    variantName,
    attributes,
    photos: productPhotos(product, line.imageUrl),
    unitPrice,
    quantity,
    discount,
    lineTotal: unitPrice * quantity - discount,
    facts,
    description: text(product?.description) || null,
    maxQuantity:
      stock === null ? null : getMaxQuantityForCartItem({ trackStock: trackStock ?? undefined, quantityOnHand: stock }),
  };
}
