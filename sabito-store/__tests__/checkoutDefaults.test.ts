import { STORAGE_KEYS } from '@/constants';

const FOOD_SHOP_TYPES = new Set(['restaurant', 'supermarket', 'convenience']);

describe('food checkout defaults', () => {
  it('prefers delivery for food stores with delivery enabled', () => {
    const store = { shopType: 'restaurant', deliveryEnabled: true, pickupEnabled: true };
    const fulfillment = FOOD_SHOP_TYPES.has(store.shopType) && store.deliveryEnabled ? 'delivery' : 'pickup';
    expect(fulfillment).toBe('delivery');
  });

  it('stores checkout intent key for auth restore', () => {
    expect(STORAGE_KEYS.checkoutIntent).toBe('sabito_buyer_checkout_intent');
  });
});
