const {
  buildRentalReference,
  parseScheduleDeliveryInput,
  buildScheduledDeliveryLeg,
  mergeDeliveryLegMetadata,
  formatRentalDeliveryRow,
  expandRentalDeliveryRows,
  resolveRentalDeliveryAddress,
  updateRentalDeliveryLeg,
} = require('../../../services/rentalDeliveryService');
const { parseDeliveryStatusInput } = require('../../../utils/deliveryStatus');

describe('rentalDeliveryService', () => {
  const rentalId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const customer = {
    id: 'customer-1',
    name: 'Jane Renter',
    phone: '+233201234567',
    address: '12 Main St',
    city: 'Accra',
    metadata: {
      rental: {
        delivery: {
          address: '45 Rental Ave',
          city: 'Kumasi',
          state: 'Ashanti',
        },
      },
    },
  };

  it('buildRentalReference formats a compact rental code', () => {
    expect(buildRentalReference(rentalId)).toBe('RNT-AAAAAAAA');
  });

  it('parseScheduleDeliveryInput accepts boolean and object forms', () => {
    expect(parseScheduleDeliveryInput(true).enabled).toBe(true);
    expect(parseScheduleDeliveryInput({ scheduledDate: '2026-09-01' }).scheduledDate).toBe('2026-09-01');
    expect(parseScheduleDeliveryInput(false).enabled).toBe(false);
  });

  it('resolveRentalDeliveryAddress accepts a free-text override', () => {
    expect(resolveRentalDeliveryAddress(customer, { line1: 'Labadi shoot, Saturday' })).toEqual({
      line1: 'Labadi shoot, Saturday',
    });
    expect(resolveRentalDeliveryAddress(customer, 'East Legon gate 2')).toEqual({
      line1: 'East Legon gate 2',
    });
  });

  it('resolveRentalDeliveryAddress prefers customer rental metadata', () => {
    expect(resolveRentalDeliveryAddress(customer)).toEqual({
      line1: '45 Rental Ave',
      city: 'Kumasi',
      state: 'Ashanti',
      phone: '+233201234567',
    });
  });

  it('buildScheduledDeliveryLeg stores rental_pickup metadata', () => {
    const leg = buildScheduledDeliveryLeg({
      rental: { id: rentalId },
      leg: 'pickup',
      customer,
      scheduleInput: { scheduledDate: '2026-09-02', notes: 'Call first' },
    });

    expect(leg).toMatchObject({
      type: 'rental_pickup',
      rentalId,
      scheduled: true,
      deliveryStatus: 'ready_for_delivery',
      scheduledDate: '2026-09-02',
      notes: 'Call first',
    });
  });

  it('formatRentalDeliveryRow and expandRentalDeliveryRows surface active legs', () => {
    const rental = {
      id: rentalId,
      status: 'confirmed',
      amount: 500,
      updatedAt: '2026-08-29T10:00:00.000Z',
      customer,
      metadata: {
        deliveries: {
          pickup: buildScheduledDeliveryLeg({
            rental: { id: rentalId },
            leg: 'pickup',
            customer,
          }),
        },
      },
    };

    const row = formatRentalDeliveryRow(rental, 'pickup');
    expect(row.entityType).toBe('rental');
    expect(row.deliveryLeg).toBe('pickup');
    expect(row.reference).toBe('RNT-AAAAAAAA');

    const activeRows = expandRentalDeliveryRows([rental], 'active');
    expect(activeRows).toHaveLength(1);

    rental.metadata.deliveries.pickup.deliveryStatus = 'delivered';
    rental.metadata.deliveries.pickup.deliveredAt = new Date().toISOString();
    expect(expandRentalDeliveryRows([rental], 'active')).toHaveLength(0);
    expect(expandRentalDeliveryRows([rental], 'done')).toHaveLength(1);
  });

  it('updateRentalDeliveryLeg updates metadata for a scheduled leg', () => {
    const rental = {
      id: rentalId,
      metadata: mergeDeliveryLegMetadata(
        { metadata: {} },
        'pickup',
        buildScheduledDeliveryLeg({ rental: { id: rentalId }, leg: 'pickup', customer }),
      ),
    };

    const result = updateRentalDeliveryLeg({
      rental,
      leg: 'pickup',
      deliveryStatus: 'out_for_delivery',
      hasAssignedDriverField: false,
      userId: 'user-1',
      isDriver: false,
      normalizeAssignedDriver: (v) => v,
      enforceDriverStatusTransition: () => ({ ok: true }),
    });

    expect(result.ok).toBe(true);
    expect(result.metadata.deliveries.pickup.deliveryStatus).toBe('out_for_delivery');
    expect(parseDeliveryStatusInput(result.metadata.deliveries.pickup.deliveryStatus)).toBe('out_for_delivery');
  });
});
