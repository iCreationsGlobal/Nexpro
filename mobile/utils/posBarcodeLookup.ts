type BarcodeProduct = {
  id: string;
  barcode?: string | null;
  isActive?: boolean;
  hasVariants?: boolean;
  variants?: unknown[];
};

/** Match only exact primary barcodes; the API resolves aliases and variants. */
export function findLoadedBarcodeProduct<T extends BarcodeProduct>(products: T[], barcode: string): T | null {
  const code = barcode.trim();
  if (!code) return null;
  const matches = new Map<string, T>();
  for (const product of products) {
    if (product.id && product.isActive !== false && product.barcode?.trim() === code) {
      matches.set(product.id, product);
    }
  }
  if (matches.size !== 1) return null;
  const product = [...matches.values()][0];
  return product.hasVariants || product.variants?.length ? null : product;
}
