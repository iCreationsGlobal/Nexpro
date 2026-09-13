/**
 * @jest-environment node
 */

const {
  resolveSabitoPartnerCoreType,
  getSabitoPartnerCategoryOptions,
  getSabitoPartnerCategoryLabel,
  defaultSabitoPartnerCategoryId,
  isAllowedSabitoPartnerCategory,
  resolvePublicCategoryFilterValues,
} = require('../../../config/sabitoPartnerCategories');

describe('sabitoPartnerCategories', () => {
  it('maps workspace studio types to printing_press coreType', () => {
    expect(resolveSabitoPartnerCoreType('studio')).toBe('printing_press');
    expect(resolveSabitoPartnerCoreType('printing_press')).toBe('printing_press');
    expect(resolveSabitoPartnerCoreType('mechanic')).toBe('printing_press');
    expect(resolveSabitoPartnerCoreType('rental')).toBe('rental');
    expect(resolveSabitoPartnerCoreType('shop')).toBe('shop');
    expect(resolveSabitoPartnerCoreType('pharmacy')).toBe('pharmacy');
  });

  it('returns rental subtypes for a rental workspace', () => {
    const ids = getSabitoPartnerCategoryOptions('rental').map((o) => o.id);
    expect(ids).toEqual(['equipment_rental', 'event_rental', 'vehicle_rental', 'general_rental']);
  });

  it('excludes shop other unless that is the tenant subtype', () => {
    expect(getSabitoPartnerCategoryOptions('shop').some((o) => o.id === 'other')).toBe(false);
    expect(getSabitoPartnerCategoryOptions('shop', { subtype: 'other' }).some((o) => o.id === 'other')).toBe(
      true
    );
  });

  it('maps stored ids and labels to display labels, keeping legacy strings', () => {
    expect(getSabitoPartnerCategoryLabel('vehicle_rental')).toBe('Vehicle rental');
    expect(getSabitoPartnerCategoryLabel('Vehicle rental')).toBe('Vehicle rental');
    expect(getSabitoPartnerCategoryLabel('Studio/Services')).toBe('Studio/Services');
    expect(getSabitoPartnerCategoryLabel('')).toBe('Services');
  });

  it('defaults category from a matching tenant subtype', () => {
    expect(defaultSabitoPartnerCategoryId('rental', 'vehicle_rental')).toBe('vehicle_rental');
    expect(defaultSabitoPartnerCategoryId('rental', 'supermarket')).toBeNull();
  });

  it('allows current legacy category but rejects a type mismatch', () => {
    expect(
      isAllowedSabitoPartnerCategory('rental', 'Studio/Services', { currentCategory: 'Studio/Services' })
    ).toBe(true);
    expect(isAllowedSabitoPartnerCategory('rental', 'vehicle_rental')).toBe(true);
    expect(isAllowedSabitoPartnerCategory('rental', 'printing_press')).toBe(false);
  });

  it('expands public filters by id, label, or group', () => {
    expect(resolvePublicCategoryFilterValues('All categories')).toBeNull();
    expect(resolvePublicCategoryFilterValues('vehicle_rental')).toEqual([
      'vehicle_rental',
      'Vehicle rental',
    ]);
    expect(resolvePublicCategoryFilterValues('Rental')).toEqual(
      expect.arrayContaining(['vehicle_rental', 'Vehicle rental', 'equipment_rental'])
    );
    expect(resolvePublicCategoryFilterValues('Studio/Services')).toEqual(['Studio/Services']);
  });
});
