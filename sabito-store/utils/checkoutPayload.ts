import { clampQuantity } from '@/utils/format';
import type { CartCheckoutItem } from '@/services/ordersApi';

export const buildCheckoutItems = (
  items: Array<{ listingId: string; quantity: number }>,
): CartCheckoutItem[] =>
  items.map((item) => ({
    listingId: item.listingId,
    quantity: clampQuantity(item.quantity),
  }));

export const buildCheckoutPayload = (input: {
  storeSlug: string;
  items: Array<{ listingId: string; quantity: number }>;
  fulfillmentMethod: 'delivery' | 'pickup';
  deliveryAddress?: Record<string, string | undefined>;
}) => ({
  storeSlug: input.storeSlug,
  items: buildCheckoutItems(input.items),
  fulfillmentMethod: input.fulfillmentMethod,
  deliveryAddress: input.fulfillmentMethod === 'delivery' ? input.deliveryAddress : undefined,
});
