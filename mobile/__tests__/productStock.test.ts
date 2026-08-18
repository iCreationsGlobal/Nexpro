import {
  getActiveVariants,
  getProductStockQuantity,
  isProductOutOfStock,
  isVariantOutOfStock,
  productRequiresVariantSelection,
} from '@/utils/productStock';

describe('productStock variant helpers', () => {
  const product = {
    name: 'T-Shirt',
    trackStock: true,
    hasVariants: true,
    quantityOnHand: 0,
    variants: [
      { id: 'v1', name: 'Small', quantityOnHand: 2, isActive: true },
      { id: 'v2', name: 'Large', quantityOnHand: 0, isActive: true },
      { id: 'v3', name: 'Retired', quantityOnHand: 5, isActive: false },
    ],
  };

  it('filters active variants', () => {
    expect(getActiveVariants(product)).toHaveLength(2);
  });

  it('sums active variant stock for parent quantity', () => {
    expect(getProductStockQuantity(product)).toBe(2);
  });

  it('is not out of stock when any active variant has stock', () => {
    expect(isProductOutOfStock(product)).toBe(false);
  });

  it('detects out-of-stock variants', () => {
    expect(isVariantOutOfStock(product, product.variants[1])).toBe(true);
    expect(isVariantOutOfStock(product, product.variants[0])).toBe(false);
  });

  it('requires variant selection when hasVariants is true', () => {
    expect(productRequiresVariantSelection(product)).toBe(true);
    expect(productRequiresVariantSelection({ name: 'Simple', trackStock: true, quantityOnHand: 3 })).toBe(false);
  });
});
