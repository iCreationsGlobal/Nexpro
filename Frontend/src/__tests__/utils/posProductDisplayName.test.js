import { describe, expect, it } from 'vitest';
import { getPosProductDisplayName } from '../../utils/posProductDisplayName';

describe('getPosProductDisplayName', () => {
  it('uses the product name when present', () => {
    expect(getPosProductDisplayName({ name: '230GSM Black', sku: '230GSM-BLACK' })).toBe(
      '230GSM Black'
    );
  });

  it('falls back to SKU when name is blank', () => {
    expect(getPosProductDisplayName({ name: '  ', sku: '230GSM-BLACK' })).toBe('230GSM-BLACK');
  });

  it('uses a placeholder when name and SKU are missing', () => {
    expect(getPosProductDisplayName({})).toBe('Unnamed product');
  });
});
