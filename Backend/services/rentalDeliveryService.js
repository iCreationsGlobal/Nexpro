const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { parseDeliveryStatusInput } = require('../utils/deliveryStatus');
const { appendWhereOrGroup } = require('../utils/sequelizeWhereUtils');

const RENTAL_DELIVERY_TYPES = Object.freeze({
  PICKUP: 'rental_pickup',
  RETURN: 'rental_return',
});

const RENTAL_DELIVERY_LEGS = Object.freeze(['pickup', 'return']);

const ACTIVE_DELIVERY_STATUSES = [null, 'ready_for_delivery', 'out_for_delivery'];
const TERMINAL_DELIVERY_STATUSES = ['delivered', 'returned'];

/**
 * @param {string} rentalId
 * @returns {string}
 */
const buildRentalReference = (rentalId) => {
  const compact = String(rentalId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return `RNT-${compact}`;
};

/**
 * @param {unknown} rental
 * @returns {Record<string, unknown>}
 */
const getRentalDeliveriesMetadata = (rental) => {
  const metadata = rental?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const deliveries = metadata.deliveries;
  return deliveries && typeof deliveries === 'object' && !Array.isArray(deliveries)
    ? deliveries
    : {};
};

/**
 * @param {unknown} address
 * @returns {Record<string, string>|null}
 */
const normalizeDeliveryAddress = (address) => {
  if (typeof address === 'string') {
    const line1 = address.trim();
    return line1 ? { line1 } : null;
  }
  if (!address || typeof address !== 'object' || Array.isArray(address)) return null;
  const line1 = address.line1 || address.address || null;
  const city = address.city || null;
  const state = address.state || address.region || null;
  const phone = address.phone || null;
  if (!line1 && !city && !state) return null;
  return {
    ...(line1 ? { line1: String(line1) } : {}),
    ...(address.line2 ? { line2: String(address.line2) } : {}),
    ...(city ? { city: String(city) } : {}),
    ...(state ? { state: String(state) } : {}),
    ...(phone ? { phone: String(phone) } : {}),
  };
};

/**
 * Resolve delivery address from customer rental metadata or an explicit override.
 * @param {object|null|undefined} customer
 * @param {object|null|undefined} overrideAddress
 * @returns {Record<string, string>|null}
 */
const resolveRentalDeliveryAddress = (customer, overrideAddress) => {
  const explicit = normalizeDeliveryAddress(overrideAddress);
  if (explicit) return explicit;

  const rentalDelivery = customer?.metadata?.rental?.delivery;
  if (!rentalDelivery || typeof rentalDelivery !== 'object') return null;

  return normalizeDeliveryAddress({
    line1: rentalDelivery.address,
    city: rentalDelivery.city,
    state: rentalDelivery.state,
    phone: customer?.phone || null,
  });
};

/**
 * @param {unknown} value
 * @returns {{ enabled: boolean, scheduledDate: string|null, notes: string|null, address: object|null }}
 */
const parseScheduleDeliveryInput = (value) => {
  if (value === true) {
    return { enabled: true, scheduledDate: null, notes: null, address: null };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.enabled === false || value.schedule === false) {
      return { enabled: false, scheduledDate: null, notes: null, address: null };
    }
    return {
      enabled: true,
      scheduledDate: value.scheduledDate || null,
      notes: value.notes || null,
      address: value.address || null,
    };
  }
  return { enabled: false, scheduledDate: null, notes: null, address: null };
};

/**
 * Build a scheduled delivery leg payload stored under rental.metadata.deliveries.
 * @param {object} params
 * @returns {object}
 */
const buildScheduledDeliveryLeg = ({
  rental,
  leg,
  customer,
  scheduleInput = {},
}) => {
  const type = leg === 'return' ? RENTAL_DELIVERY_TYPES.RETURN : RENTAL_DELIVERY_TYPES.PICKUP;
  const address = resolveRentalDeliveryAddress(customer, scheduleInput.address);

  return {
    type,
    rentalId: rental.id,
    scheduled: true,
    scheduledDate: scheduleInput.scheduledDate || null,
    scheduledAt: new Date().toISOString(),
    deliveryStatus: 'ready_for_delivery',
    deliveryAssignedTo: null,
    deliveryAssignedAt: null,
    deliveredBy: null,
    deliveredAt: null,
    address,
    notes: scheduleInput.notes || null,
  };
};

/**
 * Merge a delivery leg into rental metadata.
 * @param {object} rental
 * @param {'pickup'|'return'} leg
 * @param {object} legPayload
 * @returns {Record<string, unknown>}
 */
const mergeDeliveryLegMetadata = (rental, leg, legPayload) => {
  const existingMetadata = rental?.metadata && typeof rental.metadata === 'object'
    ? rental.metadata
    : {};
  const existingDeliveries = getRentalDeliveriesMetadata(rental);

  return {
    ...existingMetadata,
    deliveries: {
      ...existingDeliveries,
      [leg]: legPayload,
    },
  };
};

/**
 * @param {object|null|undefined} address
 * @param {object|null|undefined} customer
 * @returns {string|null}
 */
const formatRentalDeliveryAddressSummary = (address, customer) => {
  const normalized = normalizeDeliveryAddress(address);
  if (normalized) {
    return [normalized.line1, normalized.line2, normalized.city, normalized.state]
      .filter(Boolean)
      .join(', ') || null;
  }
  if (!customer) return null;
  const parts = [customer.address, customer.city, customer.state].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
};

/**
 * @param {object} rental
 * @param {'pickup'|'return'} leg
 * @returns {object|null}
 */
const formatRentalDeliveryRow = (rental, leg) => {
  const deliveries = getRentalDeliveriesMetadata(rental);
  const delivery = deliveries[leg];
  if (!delivery || delivery.scheduled !== true) return null;

  const customer = rental.customer;
  const plain = rental.toJSON ? rental.toJSON() : rental;

  return {
    entityType: 'rental',
    deliveryLeg: leg,
    deliveryType: delivery.type || (leg === 'return' ? RENTAL_DELIVERY_TYPES.RETURN : RENTAL_DELIVERY_TYPES.PICKUP),
    id: plain.id,
    reference: buildRentalReference(plain.id),
    title: leg === 'pickup' ? 'Rental delivery (handover)' : 'Rental pickup (return)',
    customerName: customer?.name || customer?.company || null,
    customerPhone: delivery.address?.phone || customer?.phone || null,
    addressSummary: formatRentalDeliveryAddressSummary(delivery.address, customer),
    completedAt: delivery.scheduledAt || plain.updatedAt,
    deliveryStatus: delivery.deliveryStatus || null,
    deliveryAssignedTo: delivery.deliveryAssignedTo || null,
    deliveryAssignedAt: delivery.deliveryAssignedAt || null,
    deliveredBy: delivery.deliveredBy || null,
    deliveredAt: delivery.deliveredAt || null,
    total: plain.amount != null ? Number(plain.amount) : null,
    rentalStatus: plain.status || null,
  };
};

/**
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
const isActiveRentalDeliveryStatus = (status) => (
  ACTIVE_DELIVERY_STATUSES.includes(status || null)
);

/**
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
const isTerminalRentalDeliveryStatus = (status) => (
  TERMINAL_DELIVERY_STATUSES.includes(status)
);

/**
 * Expand rentals into delivery queue rows for the given scope.
 * @param {object[]} rentals
 * @param {'active'|'done'} scope
 * @param {object} [options]
 * @returns {object[]}
 */
const expandRentalDeliveryRows = (rentals, scope, options = {}) => {
  const { isDriver = false, driverUserId = null } = options;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = [];

  for (const rental of rentals) {
    for (const leg of RENTAL_DELIVERY_LEGS) {
      const row = formatRentalDeliveryRow(rental, leg);
      if (!row) continue;

      if (isDriver && row.deliveryAssignedTo !== driverUserId) continue;

      if (scope === 'active') {
        if (!isActiveRentalDeliveryStatus(row.deliveryStatus)) continue;
      } else if (!isTerminalRentalDeliveryStatus(row.deliveryStatus)) {
        continue;
      } else {
        const terminalAt = row.deliveredAt || row.completedAt;
        if (terminalAt && new Date(terminalAt) < ninetyDaysAgo) continue;
        if (isDriver && row.deliveredBy !== driverUserId) continue;
      }

      rows.push(row);
    }
  }

  return rows;
};

/**
 * Apply shop/branch read scope for rentals (branchId mirrors shop scope).
 * @param {object} req
 * @param {object} [where]
 * @returns {object}
 */
const applyRentalBranchReadFilter = (req, where = {}) => {
  if (!req.shopScoped) return where;

  if (req.shopFilterId) {
    return appendWhereOrGroup(where, [{ branchId: req.shopFilterId }, { branchId: null }]);
  }

  if (req.allowedShopIds?.length) {
    return appendWhereOrGroup(where, [
      { branchId: { [Op.in]: req.allowedShopIds } },
      { branchId: null },
    ]);
  }

  return where;
};

const rentalHasScheduledDeliveryCondition = () => sequelize.literal(`(
  COALESCE("Rental"."metadata"->'deliveries'->'pickup'->>'scheduled', 'false') = 'true'
  OR COALESCE("Rental"."metadata"->'deliveries'->'return'->>'scheduled', 'false') = 'true'
)`);

/**
 * Update delivery status / driver assignment on a rental delivery leg.
 * @param {object} params
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
const updateRentalDeliveryLeg = ({
  rental,
  leg,
  deliveryStatus,
  deliveryAssignedTo,
  hasAssignedDriverField,
  userId,
  isDriver,
  assertAssignedDriverIsValid,
  enforceDriverStatusTransition,
  normalizeAssignedDriver,
}) => {
  if (!RENTAL_DELIVERY_LEGS.includes(leg)) {
    return { ok: false, message: 'deliveryLeg must be "pickup" or "return"' };
  }

  const parsed = parseDeliveryStatusInput(deliveryStatus);
  if (parsed === undefined && deliveryStatus !== undefined) {
    return { ok: false, message: 'Invalid deliveryStatus' };
  }

  const normalizedAssignedDriver = normalizeAssignedDriver(deliveryAssignedTo);
  if (isDriver && hasAssignedDriverField) {
    return { ok: false, message: 'Drivers cannot assign deliveries' };
  }

  const deliveries = getRentalDeliveriesMetadata(rental);
  const currentLeg = deliveries[leg];
  if (!currentLeg || currentLeg.scheduled !== true) {
    return { ok: false, message: 'Rental delivery leg is not scheduled' };
  }

  if (isDriver && currentLeg.deliveryAssignedTo !== userId) {
    return { ok: false, message: 'This delivery is not assigned to you' };
  }

  if (isDriver) {
    const guard = enforceDriverStatusTransition({
      currentStatus: currentLeg.deliveryStatus || null,
      nextStatus: parsed,
    });
    if (!guard.ok) return guard;
  }

  const nextLeg = { ...currentLeg };

  if (deliveryStatus !== undefined) {
    nextLeg.deliveryStatus = parsed;
    if (parsed === 'delivered' || parsed === 'returned') {
      nextLeg.deliveredBy = userId || null;
      nextLeg.deliveredAt = new Date().toISOString();
    } else {
      nextLeg.deliveredBy = null;
      nextLeg.deliveredAt = null;
    }
  }

  if (hasAssignedDriverField) {
    nextLeg.deliveryAssignedTo = normalizedAssignedDriver;
    nextLeg.deliveryAssignedAt = new Date().toISOString();
  }

  return {
    ok: true,
    metadata: mergeDeliveryLegMetadata(rental, leg, nextLeg),
    unchanged: (
      String(currentLeg.deliveryStatus || '') === String(nextLeg.deliveryStatus || '')
      && (!hasAssignedDriverField
        || String(currentLeg.deliveryAssignedTo || '') === String(nextLeg.deliveryAssignedTo || ''))
    ),
  };
};

module.exports = {
  RENTAL_DELIVERY_TYPES,
  RENTAL_DELIVERY_LEGS,
  buildRentalReference,
  getRentalDeliveriesMetadata,
  resolveRentalDeliveryAddress,
  parseScheduleDeliveryInput,
  buildScheduledDeliveryLeg,
  mergeDeliveryLegMetadata,
  formatRentalDeliveryRow,
  expandRentalDeliveryRows,
  applyRentalBranchReadFilter,
  rentalHasScheduledDeliveryCondition,
  updateRentalDeliveryLeg,
  isActiveRentalDeliveryStatus,
  isTerminalRentalDeliveryStatus,
};
