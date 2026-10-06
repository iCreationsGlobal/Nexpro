import { describe, it, expect } from 'vitest';
import { imageFileCode, matchImagesToProducts, planProductImageSaves } from '../../utils/productImageMatching';

const file = (name) => ({ name });
const pick = (result) => result.map((r) => [r.status, r.product?.id ?? null, r.slot]);

describe('productImageMatching', () => {
  it('strips the extension and normalizes case and spaces', () => {
    expect(imageFileCode(' BA500.JPG')).toBe('ba500');
    expect(imageFileCode('item.v2.heic')).toBe('item.v2');
  });

  it('reads no letter as photo A and letters as slots, with any separator', () => {
    const products = [{ id: 1, productCode: '00001' }];
    const names = ['00001.jpg', '00001-B.jpg', '00001_c.png', '00001 D.webp', '00001E.heic'];
    expect(pick(matchImagesToProducts(names.map(file), products))).toEqual([
      ['matched', 1, 'A'], ['matched', 1, 'B'], ['matched', 1, 'C'], ['matched', 1, 'D'], ['matched', 1, 'E'],
    ]);
  });

  it('prefers a real code that ends in a letter over reading the letter as a slot', () => {
    const products = [{ id: 1, productCode: '00001' }, { id: 2, productCode: '00001B' }];
    expect(pick(matchImagesToProducts([file('00001B.jpg')], products))).toEqual([['matched', 2, 'A']]);
  });

  it('reads the letter O as zero when nothing else matches', () => {
    const products = [{ id: 1, productCode: '00001' }];
    expect(pick(matchImagesToProducts([file('OOO01A.jpg'), file('ooo01-b.jpg')], products))).toEqual([
      ['matched', 1, 'A'], ['matched', 1, 'B'],
    ]);
  });

  it('falls back to SKU then barcode, product code first', () => {
    const products = [{ id: 1, sku: 'X1' }, { id: 2, productCode: 'X1' }, { id: 3, barcode: '6034000123' }];
    expect(pick(matchImagesToProducts([file('X1.jpg'), file('6034000123.jpg')], products))).toEqual([
      ['matched', 2, 'A'], ['matched', 3, 'A'],
    ]);
  });

  it('reports unknown names, shared codes, repeated slots and a sixth photo', () => {
    const products = [{ id: 1, productCode: 'P1' }, { id: 2, productCode: 'P2' }, { id: 3, productCode: 'P2' }];
    const result = matchImagesToProducts(
      ['P1.jpg', 'P1-A.png', 'P2.jpg', 'ZZZ.jpg', 'P1-F.jpg'].map(file),
      products,
    );
    expect(result.map((r) => r.status)).toEqual(['matched', 'duplicate', 'ambiguous', 'no_match', 'too_many']);
    expect(result[2].candidates).toHaveLength(2);
  });

  it('keeps existing photos unless replacing, grouped by product in slot order', () => {
    const product = { id: 1, productCode: 'P1', imageUrl: '/a.jpg', storeImages: { C: '/c.jpg' } };
    const matches = matchImagesToProducts(['P1-C.jpg', 'P1-B.jpg', 'P1.jpg'].map(file), [product]);

    const [keep] = planProductImageSaves(matches);
    expect(keep.photos.map((p) => p.slot)).toEqual(['B']);
    expect(keep.skipped.map((p) => p.slot).sort()).toEqual(['A', 'C']);

    const [replace] = planProductImageSaves(matches, { replaceExisting: true });
    expect(replace.photos.map((p) => [p.slot, p.replaces])).toEqual([['A', true], ['B', false], ['C', true]]);
  });
});
