/**
 * Keep-scanning selling: what a scanned code becomes (a product, a size to choose, or a short
 * message on the camera screen) and the strip shown over the camera. No React here, so the
 * Sell tab and Simple Mode share it and it can be tested on its own.
 */
import type { AddCartProductInput } from '@/context/CartContext';
import { deriveBarcodeSearchCandidates } from '@/utils/barcodeSearchCandidates';
import { formatCurrency, formatInteger } from '@/utils/formatCurrency';
import { parseApiEntity } from '@/utils/parseApiListResponse';
import { findLoadedBarcodeProduct } from '@/utils/posBarcodeLookup';
import { isProductQRCode, parseProductQRPayload } from '@/utils/productQR';
import {
  getVariantLabel,
  isProductOutOfStock,
  isVariantOutOfStock,
  productRequiresVariantSelection,
  type ProductVariantStockInput,
} from '@/utils/productStock';

export type SellScanProduct = {
  id: string;
  name: string;
  sellingPrice?: number;
  costPrice?: number;
  price?: number;
  barcode?: string;
  sku?: string;
  imageUrl?: string;
  quantityOnHand?: number | null;
  trackStock?: boolean;
  isActive?: boolean;
  hasVariants?: boolean;
  variants?: ProductVariantStockInput[];
  selectedVariant?: ProductVariantStockInput | null;
};

export const SCAN_MESSAGES = {
  notFound: 'No product for this barcode',
  lookupFailed: 'Could not look up this barcode. Check the internet and scan again.',
  somethingWrong: 'Something went wrong with that scan. Scan it again.',
  outOfStock: (label: string) => `${label} is out of stock`,
} as const;

export type ScanLookupResult =
  | { status: 'found'; product: SellScanProduct }
  | { status: 'not-found' | 'error'; message: string };

/** Server barcode lookup: the response body for the first candidate it finds, or throws. */
export type BarcodeLookup = (candidates: string[]) => Promise<unknown>;

const isNotFound = (error: unknown) => {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if (status === 404) return true;
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return !status && message.includes('not found');
};

async function lookUpBarcode(
  code: string,
  loadedProducts: SellScanProduct[],
  lookup: BarcodeLookup
): Promise<ScanLookupResult> {
  const loaded = findLoadedBarcodeProduct(loadedProducts, code);
  if (loaded) return { status: 'found', product: loaded };
  const candidates = deriveBarcodeSearchCandidates(code);
  if (candidates.length === 0) return { status: 'not-found', message: SCAN_MESSAGES.notFound };
  try {
    const product = parseApiEntity<SellScanProduct>(await lookup(candidates));
    if (product?.id) return { status: 'found', product };
    return { status: 'not-found', message: SCAN_MESSAGES.notFound };
  } catch (error) {
    return isNotFound(error)
      ? { status: 'not-found', message: SCAN_MESSAGES.notFound }
      : { status: 'error', message: SCAN_MESSAGES.lookupFailed };
  }
}

/**
 * Find the product for a scanned code: the loaded catalogue first, then the server's barcode
 * lookup (main barcode, extra barcodes, or a size's/colour's own barcode, which comes back with
 * `selectedVariant`). One of our QR labels is matched by its product id, then its barcode, and
 * falls back to the label's own details as before.
 */
export async function lookUpScannedCode(
  rawCode: string,
  { loadedProducts, lookup }: { loadedProducts: SellScanProduct[]; lookup: BarcodeLookup }
): Promise<ScanLookupResult> {
  const code = (rawCode || '').trim();
  if (!code) return { status: 'not-found', message: SCAN_MESSAGES.notFound };

  if (isProductQRCode(code)) {
    const parsed = parseProductQRPayload(code);
    if (parsed.success && parsed.data) {
      const label = parsed.data as SellScanProduct;
      const byId = label.id ? loadedProducts.find((p) => p.id === label.id && p.isActive !== false) : null;
      if (byId) return { status: 'found', product: byId };
      if (label.barcode) {
        const byBarcode = await lookUpBarcode(label.barcode, loadedProducts, lookup);
        if (byBarcode.status === 'found') return byBarcode;
      }
      if (label.id) return { status: 'found', product: label };
      return { status: 'not-found', message: SCAN_MESSAGES.notFound };
    }
  }

  return lookUpBarcode(code, loadedProducts, lookup);
}

/** "Gown – M", or just "Gown". */
export function scanItemLabel(product: { name?: string }, variant?: ProductVariantStockInput | null): string {
  const name = product.name || 'Product';
  const variantLabel = variant ? getVariantLabel(variant) : '';
  return variantLabel ? `${name} – ${variantLabel}` : name;
}

/** Cart line input for a scanned product (and the size or colour, when there is one). */
export function buildScanCartInput(
  product: SellScanProduct,
  variant?: ProductVariantStockInput | null
): AddCartProductInput {
  if (variant?.id) {
    return {
      id: product.id,
      name: product.name,
      sellingPrice: variant.sellingPrice ?? product.sellingPrice ?? product.price ?? product.costPrice,
      price: product.price,
      costPrice: product.costPrice,
      imageUrl: product.imageUrl,
      sku: variant.sku || product.sku,
      barcode: variant.barcode || product.barcode,
      trackStock: variant.trackStock ?? product.trackStock,
      quantityOnHand: variant.quantityOnHand ?? product.quantityOnHand,
      selectedVariant: variant,
      hasVariants: true,
      variants: product.variants,
    };
  }
  return {
    id: product.id,
    name: product.name,
    sellingPrice: product.sellingPrice,
    price: product.price,
    costPrice: product.costPrice,
    imageUrl: product.imageUrl,
    sku: product.sku,
    barcode: product.barcode,
    trackStock: product.trackStock,
    quantityOnHand: product.quantityOnHand,
    hasVariants: product.hasVariants,
    variants: product.variants,
  };
}

/** Same price rule the cart uses for a new line. */
export function scanUnitPrice(product: SellScanProduct, variant?: ProductVariantStockInput | null): number {
  return Number(
    (variant?.id ? variant.sellingPrice : undefined)
      ?? product.sellingPrice
      ?? product.price
      ?? product.costPrice
      ?? 0
  ) || 0;
}

export type ScanAddStep =
  | { kind: 'add'; input: AddCartProductInput; label: string; unitPrice: number }
  | { kind: 'choose-variant'; product: SellScanProduct }
  | { kind: 'problem'; message: string };

/** What to do with a product (and size or colour) that a scan or the size picker gave us. */
export function planScanAdd(
  product: SellScanProduct,
  chosenVariant?: ProductVariantStockInput | null
): ScanAddStep {
  const variant = chosenVariant?.id ? chosenVariant : product.selectedVariant?.id ? product.selectedVariant : null;
  if (variant) {
    const label = scanItemLabel(product, variant);
    if (isVariantOutOfStock(product, variant)) return { kind: 'problem', message: SCAN_MESSAGES.outOfStock(label) };
    return { kind: 'add', input: buildScanCartInput(product, variant), label, unitPrice: scanUnitPrice(product, variant) };
  }
  if (productRequiresVariantSelection(product)) return { kind: 'choose-variant', product };
  const label = scanItemLabel(product);
  if (isProductOutOfStock(product)) return { kind: 'problem', message: SCAN_MESSAGES.outOfStock(label) };
  return { kind: 'add', input: buildScanCartInput(product), label, unitPrice: scanUnitPrice(product) };
}

/** "Added: Gown – M · ₵ 120.00" */
export function formatAddedLine(label: string, unitPrice: number): string {
  return `Added: ${label} · ${formatCurrency(unitPrice)}`;
}

type CartLineAmounts = { quantity: number; unitPrice: number; discount?: number };

/** Item count and total of the cart, the same way the cart works them out. */
export function summarizeCart(items: CartLineAmounts[]): { count: number; total: number } {
  let count = 0;
  let subtotal = 0;
  let discount = 0;
  for (const item of items) {
    const quantity = Number(item.quantity) || 0;
    count += quantity;
    subtotal += (Number(item.unitPrice) || 0) * quantity;
    discount += item.discount || 0;
  }
  return { count, total: subtotal - discount };
}

/** "5 items · ₵ 600.00" */
export function formatCartSummary({ count, total }: { count: number; total: number }): string {
  return `${formatInteger(count)} ${count === 1 ? 'item' : 'items'} · ${formatCurrency(total)}`;
}

/**
 * What a one-scan search camera puts in the search box: the code itself, or for one of our QR
 * labels its barcode (else its SKU, else its name).
 */
export function searchTextFromScan(rawCode: string): string {
  const code = (rawCode || '').trim();
  if (!isProductQRCode(code)) return code;
  const parsed = parseProductQRPayload(code);
  if (!parsed.success || !parsed.data) return code;
  return parsed.data.barcode || parsed.data.sku || parsed.data.name || code;
}
