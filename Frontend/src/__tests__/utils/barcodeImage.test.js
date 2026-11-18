import { describe, it, expect } from 'vitest';
import { barcodeFits, barcodeSvg, generateInStoreBarcode, isValidEan13 } from '../../utils/barcodeImage';

describe('barcode images', () => {
  it('makes 13-digit in-store codes with a correct check digit', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateInStoreBarcode();
      expect(code).toMatch(/^20\d{11}$/);
      expect(isValidEan13(code)).toBe(true);
    }
    expect(isValidEan13('6034000181142')).toBe(true);
    expect(isValidEan13('6034000181143')).toBe(false);
  });

  it('draws a stretchable SVG with quiet zones and checks the bars are thick enough for the sticker', () => {
    const ean = barcodeSvg('6034000181142');
    expect(ean.dataUrl.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(ean.dataUrl)).toContain('preserveAspectRatio="none"');
    expect(ean.units).toBe(95 + 20); // EAN-13 bars plus 10 bar-widths of blank space each side
    // 40 mm sticker less 1.5 mm padding each side: 37 mm across → about 0.32 mm per bar.
    expect(barcodeFits(ean.units, 37)).toBe(true);
    const old = barcodeSvg('201234567890'); // 12-digit codes made before this change print as CODE128
    expect(barcodeFits(old.units, 37)).toBe(true);
    const longSku = barcodeSvg('DRESS-BLACK-LONG-XL-0001');
    expect(barcodeFits(longSku.units, 37)).toBe(false);
    expect(() => barcodeSvg('  ')).toThrow();
  });
});
