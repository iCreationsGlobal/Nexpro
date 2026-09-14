/**
 * Resolve an unambiguous primary barcode from the current shop's loaded catalog.
 * Leave variants, aliases and missing products to the server's full resolver.
 */
export const findLoadedBarcodeProduct = (products, barcode) => {
  const code = String(barcode ?? '').trim();
  if (!code) return null;
  const matches = products.filter(product =>
    product?.id && product.isActive !== false && String(product.barcode ?? '').trim() === code
  );
  if (matches.length !== 1) return null;
  const product = matches[0];
  if (product.hasVariants || product.variants?.length) return null;
  return product;
};
