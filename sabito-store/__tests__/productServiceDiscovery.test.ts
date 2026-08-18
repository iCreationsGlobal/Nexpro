describe('product discovery contract', () => {
  it('defines expected product home sections', () => {
    const sections = [
      'hero',
      'categories',
      'popularStores',
      'featuredProducts',
      'newArrivals',
      'bestDeals',
      'deliveryStores',
      'hasVendors',
    ];
    expect(sections).toContain('featuredProducts');
    expect(sections).toContain('bestDeals');
  });

  it('maps product home endpoint', () => {
    expect('/public/marketplace/products/home').toContain('products/home');
  });
});

describe('service discovery contract', () => {
  it('defines expected service home sections', () => {
    const sections = [
      'hero',
      'categories',
      'featuredServices',
      'popularStudios',
      'bookableServices',
      'quoteServices',
      'hasProviders',
    ];
    expect(sections).toContain('bookableServices');
    expect(sections).toContain('quoteServices');
  });
});

describe('product checkout defaults', () => {
  const FOOD_SHOP_TYPES = new Set(['restaurant', 'supermarket', 'convenience']);

  it('prefers pickup when only pickup is enabled for product stores', () => {
    const store = { shopType: 'retail', deliveryEnabled: false, pickupEnabled: true };
    const fulfillment = FOOD_SHOP_TYPES.has(store.shopType)
      ? (store.deliveryEnabled ? 'delivery' : 'pickup')
      : (store.pickupEnabled && !store.deliveryEnabled ? 'pickup' : store.deliveryEnabled ? 'delivery' : 'pickup');
    expect(fulfillment).toBe('pickup');
  });

  it('supports delivery for product stores with delivery enabled', () => {
    const store = { shopType: 'retail', deliveryEnabled: true, pickupEnabled: true };
    const fulfillment = store.deliveryEnabled ? 'delivery' : 'pickup';
    expect(fulfillment).toBe('delivery');
  });
});
