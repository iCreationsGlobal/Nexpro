import { describe, expect, it } from 'vitest';
import {
  getCatalogUnitPrice,
  getProductStockQuantity,
  isProductOutOfStock,
  isVariantOutOfStock,
} from '../../utils/productStock';

describe('getProductStockQuantity', () => {
  it('returns parent quantity for simple products with an empty variants array', () => {
    expect(getProductStockQuantity({
      hasVariants: false,
      quantityOnHand: 87,
      variants: [],
    })).toBe(87);
  });

  it('sums active variant stock even when parent quantityOnHand is 0', () => {
    expect(getProductStockQuantity({
      hasVariants: true,
      quantityOnHand: 0,
      variants: [
        { quantityOnHand: 200, isActive: true },
        { quantityOnHand: 113, isActive: true },
        { quantityOnHand: 99, isActive: false },
      ],
    })).toBe(313);
  });

  it('sums variants even if hasVariants is missing', () => {
    expect(getProductStockQuantity({
      quantityOnHand: 0,
      variants: [
        { quantityOnHand: 10, isActive: true },
        { quantityOnHand: 5, isActive: true },
      ],
    })).toBe(15);
  });

  it('uses totalVariantStock when variants are not loaded', () => {
    expect(getProductStockQuantity({
      hasVariants: true,
      quantityOnHand: 0,
      totalVariantStock: 313,
    })).toBe(313);
  });

  it('does not treat a simple product as a variant parent when totalVariantStock is 0', () => {
    expect(getProductStockQuantity({
      hasVariants: false,
      quantityOnHand: 50,
      totalVariantStock: 0,
    })).toBe(50);
  });

  it('uses totalVariantStock when loaded variants are all zero', () => {
    expect(getProductStockQuantity({
      hasVariants: true,
      quantityOnHand: 0,
      totalVariantStock: 313,
      variants: [
        { quantityOnHand: 0, isActive: true },
        { quantityOnHand: 0, isActive: true },
      ],
    })).toBe(313);
  });
});

describe('isProductOutOfStock', () => {
  const variantProduct = {
    name: '230GSM Black',
    trackStock: true,
    hasVariants: true,
    quantityOnHand: 0,
    variants: [
      { id: 'v1', quantityOnHand: 313, isActive: true },
      { id: 'v2', quantityOnHand: 0, isActive: true },
    ],
  };

  it('is not out of stock when any active variant has stock', () => {
    expect(isProductOutOfStock(variantProduct)).toBe(false);
  });

  it('is not out of stock when parent is 0 but totalVariantStock has units', () => {
    expect(isProductOutOfStock({
      trackStock: true,
      hasVariants: true,
      quantityOnHand: 0,
      totalVariantStock: 313,
      variants: [{ quantityOnHand: 0, isActive: true }],
    })).toBe(false);
  });

  it('is out of stock when every variant and parent total is zero', () => {
    expect(isProductOutOfStock({
      trackStock: true,
      hasVariants: true,
      quantityOnHand: 0,
      totalVariantStock: 0,
      variants: [
        { quantityOnHand: 0, isActive: true },
        { quantityOnHand: 0, isActive: true },
      ],
    })).toBe(true);
  });

  it('never treats untracked products as out of stock', () => {
    expect(isProductOutOfStock({
      trackStock: false,
      quantityOnHand: 0,
    })).toBe(false);
  });

  it('detects out-of-stock variants', () => {
    expect(isVariantOutOfStock(variantProduct, variantProduct.variants[1])).toBe(true);
    expect(isVariantOutOfStock(variantProduct, variantProduct.variants[0])).toBe(false);
  });
});

describe('getCatalogUnitPrice', () => {
  it('uses parent selling price when it is set', () => {
    expect(getCatalogUnitPrice({ sellingPrice: 25, variants: [] })).toBe(25);
  });

  it('falls back to variant prices when parent selling price is 0', () => {
    expect(getCatalogUnitPrice({
      sellingPrice: 0,
      variants: [
        { sellingPrice: 12, isActive: true },
        { sellingPrice: 18, isActive: true },
      ],
    })).toBe(12);
  });

  it('uses the selected variant price', () => {
    expect(getCatalogUnitPrice(
      { sellingPrice: 0, variants: [{ sellingPrice: 12 }] },
      { sellingPrice: 18 },
    )).toBe(18);
  });
});
