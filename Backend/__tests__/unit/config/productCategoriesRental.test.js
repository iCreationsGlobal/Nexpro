const { getDefaultCategories } = require('../../../config/productCategories');

describe('productCategories rental defaults', () => {
  it('returns equipment categories for equipment_rental sub-type', () => {
    const categories = getDefaultCategories('rental', null, null, 'equipment_rental');
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.some((c) => c.name === 'Power Tools')).toBe(true);
  });

  it('returns event categories for event_rental sub-type', () => {
    const categories = getDefaultCategories('rental', null, null, 'event_rental');
    expect(categories.some((c) => c.name === 'Tents & Canopies')).toBe(true);
  });

  it('returns vehicle categories for vehicle_rental sub-type', () => {
    const categories = getDefaultCategories('rental', null, null, 'vehicle_rental');
    expect(categories.some((c) => c.name === 'Cars & Sedans')).toBe(true);
  });

  it('falls back to generic rental categories for unknown sub-type', () => {
    const categories = getDefaultCategories('rental', null, null, 'custom_rental');
    expect(categories.some((c) => c.name === 'Equipment')).toBe(true);
  });
});
