import { DELIVERY_STATUS_LABELS } from '../constants';

export const RENTAL_DELIVERY_TYPE_LABELS = {
  rental_pickup: 'Delivery to customer',
  rental_return: 'Pickup from customer',
};

export const RENTAL_DELIVERY_LEG_LABELS = {
  pickup: 'Handover delivery',
  return: 'Return pickup',
};

/**
 * @param {object|null|undefined} rental
 * @returns {Array<{ leg: string, type: string, status: string|null, address: object|null, scheduledDate: string|null, scheduledAt: string|null }>}
 */
export function getRentalDeliveryLegs(rental) {
  const deliveries = rental?.metadata?.deliveries;
  if (!deliveries || typeof deliveries !== 'object') return [];

  return ['pickup', 'return']
    .filter((leg) => deliveries[leg]?.scheduled === true)
    .map((leg) => {
      const entry = deliveries[leg];
      return {
        leg,
        type: entry.type || (leg === 'return' ? 'rental_return' : 'rental_pickup'),
        status: entry.deliveryStatus || null,
        address: entry.address || null,
        scheduledDate: entry.scheduledDate || null,
        scheduledAt: entry.scheduledAt || null,
        deliveryAssignedTo: entry.deliveryAssignedTo || null,
        deliveredAt: entry.deliveredAt || null,
      };
    });
}

/**
 * @param {object|null|undefined} customer
 * @returns {string|null}
 */
export function formatCustomerRentalDeliveryAddress(customer) {
  const delivery = customer?.metadata?.rental?.delivery;
  if (!delivery) return null;
  const parts = [delivery.address, delivery.city, delivery.state].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * @param {string|null|undefined} status
 * @returns {string}
 */
export function formatRentalDeliveryStatus(status) {
  if (!status) return 'Not set';
  return DELIVERY_STATUS_LABELS[status] || status;
}

/**
 * @param {object|null|undefined} rental
 * @returns {boolean}
 */
export function rentalHasScheduledDeliveries(rental) {
  return getRentalDeliveryLegs(rental).length > 0;
}
