import { findLoadedBarcodeProduct } from '@/utils/posBarcodeLookup';

describe('local POS barcode lookup', () => {
  const product = { id: 'rexona', barcode: '8886304600137', sellingPrice: 40 };
  it('returns an exact loaded match with its price', () => {
    expect(findLoadedBarcodeProduct([product], product.barcode)).toBe(product);
  });
  it('deduplicates the same product in default and search results', () => {
    expect(findLoadedBarcodeProduct([product, product], product.barcode)).toBe(product);
  });
  it('does not guess missing digits or remove leading zeros', () => {
    expect(findLoadedBarcodeProduct([product], '886304600137')).toBeNull();
    expect(findLoadedBarcodeProduct([{ ...product, barcode: '0123' }], '123')).toBeNull();
  });
  it('leaves missing, inactive, ambiguous and variant products to the API', () => {
    for (const products of [[], [{ ...product, isActive: false }], [product, { ...product, id: 'other' }], [{ ...product, hasVariants: true }], [{ ...product, variants: [{}] }]]) {
      expect(findLoadedBarcodeProduct(products, product.barcode)).toBeNull();
    }
  });
});
