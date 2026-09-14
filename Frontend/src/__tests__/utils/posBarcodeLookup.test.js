import { describe, expect, it } from 'vitest';
import { findLoadedBarcodeProduct } from '../../utils/posBarcodeLookup';

describe('findLoadedBarcodeProduct', () => {
  const product = { id: 'rexona', barcode: '8886304600137', sellingPrice: 40 };
  it('returns the loaded product including its price without a request', () => {
    expect(findLoadedBarcodeProduct([product], '8886304600137')).toBe(product);
  });
  it('does not guess missing digits or strip leading zeros', () => {
    expect(findLoadedBarcodeProduct([product], '886304600137')).toBeNull();
    expect(findLoadedBarcodeProduct([{ ...product, barcode: '0123' }], '123')).toBeNull();
  });
  it('leaves unknown, inactive, ambiguous and variant products to the server', () => {
    for (const catalog of [[], [{ ...product, isActive: false }], [product, { ...product, id: 'other' }], [{ ...product, hasVariants: true }], [{ ...product, variants: [{ id: 'variant' }] }]]) {
      expect(findLoadedBarcodeProduct(catalog, product.barcode)).toBeNull();
    }
  });
  it('uses only the supplied shop catalog', () => {
    expect(findLoadedBarcodeProduct([{ id: 'other-shop-product', barcode: '999' }], product.barcode)).toBeNull();
  });
});
