import { describe, expect, it } from 'vitest';
import {
  getSabitoPartnerCategoryOptions,
  resolveSabitoPartnerCategoryId,
  resolveSabitoPartnerCoreType,
} from '../../constants/businessTypes';

describe('sabito partner category helpers', () => {
  it('maps studio workspace types to printing_press coreType', () => {
    expect(resolveSabitoPartnerCoreType('studio')).toBe('printing_press');
    expect(resolveSabitoPartnerCoreType('rental')).toBe('rental');
  });

  it('lists rental subtypes for a rental workspace', () => {
    expect(getSabitoPartnerCategoryOptions('rental').map((o) => o.id)).toEqual([
      'equipment_rental',
      'event_rental',
      'vehicle_rental',
      'general_rental',
    ]);
  });

  it('defaults the select to tenant subtype when saved category is a legacy string', () => {
    expect(
      resolveSabitoPartnerCategoryId({
        savedCategory: 'Studio/Services',
        subtype: 'vehicle_rental',
        options: getSabitoPartnerCategoryOptions('rental'),
      })
    ).toBe('vehicle_rental');
  });
});
