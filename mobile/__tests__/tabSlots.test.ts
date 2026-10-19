import { isSlotRouteActive, routePath } from '@/utils/tabSlots';

describe('tab slots', () => {
  it('reads the path a route opens', () => {
    expect(routePath('/(tabs)/products')).toBe('/products');
    expect(routePath('/(tabs)/store?section=orders')).toBe('/store');
    expect(routePath('/(tabs)')).toBe('/');
  });

  it('a focus-area slot is active on its screen and the pages inside it', () => {
    expect(isSlotRouteActive('/products', '/(tabs)/products')).toBe(true);
    expect(isSlotRouteActive('/sales', '/(tabs)/sales')).toBe(true);
    expect(isSlotRouteActive('/rentals/42', '/(tabs)/rentals')).toBe(true);
    expect(isSlotRouteActive('/', '/(tabs)/products')).toBe(false);
    expect(isSlotRouteActive('/store-products', '/(tabs)/store')).toBe(false);
  });

  it('the Orders slot is active only on the Online Store orders section', () => {
    const orders = '/(tabs)/store?section=orders';
    expect(isSlotRouteActive('/store', orders, 'orders')).toBe(true);
    expect(isSlotRouteActive('/store', orders, 'overview')).toBe(false);
    expect(isSlotRouteActive('/store', orders, undefined)).toBe(false);
    expect(isSlotRouteActive('/products', orders, 'orders')).toBe(false);
  });
});
