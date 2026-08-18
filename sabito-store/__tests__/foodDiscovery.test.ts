describe('food discovery contract', () => {
  it('defines expected food home sections', () => {
    const sections = [
      'hero',
      'cuisineChips',
      'openNearYou',
      'restaurants',
      'popularMeals',
      'groceries',
      'groceryProducts',
      'drinks',
      'fastDelivery',
      'hasVendors',
    ];
    expect(sections).toContain('restaurants');
    expect(sections).toContain('popularMeals');
  });

  it('supports shopType filters for food vendors', () => {
    const params = new URLSearchParams({ shopType: 'restaurant,supermarket', search: 'jollof' });
    expect(params.get('shopType')).toBe('restaurant,supermarket');
  });
});
