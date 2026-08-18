import { buildCheckoutItems, buildCheckoutPayload } from '@/utils/checkoutPayload';

describe('checkoutPayload', () => {
  it('builds checkout items with clamped quantity', () => {
    expect(buildCheckoutItems([{ listingId: 'abc', quantity: 0 }])).toEqual([
      { listingId: 'abc', quantity: 1 },
    ]);
  });

  it('omits delivery address for pickup', () => {
    expect(
      buildCheckoutPayload({
        storeSlug: 'shop-a',
        items: [{ listingId: 'abc', quantity: 2 }],
        fulfillmentMethod: 'pickup',
        deliveryAddress: { line1: '123 Main' },
      }),
    ).toEqual({
      storeSlug: 'shop-a',
      items: [{ listingId: 'abc', quantity: 2 }],
      fulfillmentMethod: 'pickup',
      deliveryAddress: undefined,
    });
  });
});
