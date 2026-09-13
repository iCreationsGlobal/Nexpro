const {
  LATE_CHARGE_HIGH_THRESHOLD,
  ensureRentalMetadata,
  recalculateRiskRating,
  extractRentalMetrics,
  updateRentalCustomerHistory,
} = require('../../../services/rentalCustomerHistoryService');

jest.mock('../../../models', () => ({
  Customer: {
    findOne: jest.fn(),
  },
  Rental: {
    findOne: jest.fn(),
  },
  LateCharge: {},
  DamageReport: {},
}));

const { Customer, Rental } = require('../../../models');

describe('rentalCustomerHistoryService helpers', () => {
  it('initializes rental metadata with default history and risk profile', () => {
    const metadata = ensureRentalMetadata({});
    expect(metadata.rental.history).toMatchObject({
      totalRentals: 0,
      totalRentalDays: 0,
      totalRentalRevenue: 0,
      totalLateCharges: 0,
      totalDamageIncidents: 0,
      totalDamageCost: 0,
      processedRentalIds: [],
    });
    expect(metadata.rental.riskProfile.riskRating).toBe('low');
  });

  it('preserves existing rental metadata sections when ensuring structure', () => {
    const metadata = ensureRentalMetadata({
      sabito: { linked: true },
      rental: {
        guarantor: { name: 'Jane Doe' },
        history: { totalRentals: 2, processedRentalIds: ['existing-id'] },
        riskProfile: { riskRating: 'medium', riskNotes: 'Manual note' },
      },
    });

    expect(metadata.sabito.linked).toBe(true);
    expect(metadata.rental.guarantor.name).toBe('Jane Doe');
    expect(metadata.rental.history.totalRentals).toBe(2);
    expect(metadata.rental.history.processedRentalIds).toEqual(['existing-id']);
    expect(metadata.rental.riskProfile.riskNotes).toBe('Manual note');
  });

  it('recalculates risk rating from cumulative history', () => {
    expect(recalculateRiskRating({ totalLateCharges: 0, totalDamageIncidents: 0 })).toBe('low');
    expect(recalculateRiskRating({ totalLateCharges: 50, totalDamageIncidents: 0 })).toBe('medium');
    expect(recalculateRiskRating({ totalLateCharges: 0, totalDamageIncidents: 1 })).toBe('high');
    expect(recalculateRiskRating({
      totalLateCharges: LATE_CHARGE_HIGH_THRESHOLD + 1,
      totalDamageIncidents: 0,
    })).toBe('high');
  });

  it('extracts rental metrics including billable late charges and damage', () => {
    const metrics = extractRentalMetrics({
      id: 'rental-1',
      amount: 400,
      rentalDurationDays: 5,
      actualReturnDate: '2026-08-20',
      lateCharges: [
        { totalCharge: 75, status: 'pending' },
        { totalCharge: 25, status: 'waived' },
      ],
      damageReports: [
        { estimatedRepairCost: 100 },
        { actualRepairCost: 50 },
      ],
    });

    expect(metrics).toEqual({
      rentalDuration: 5,
      amount: 400,
      lateChargeTotal: 75,
      damageIncidents: 2,
      damageCost: 150,
      lastRentalDate: '2026-08-20',
    });
  });
});

describe('updateRentalCustomerHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const buildCustomerMock = (overrides = {}) => {
    const customer = {
      id: 'customer-1',
      tenantId: 'tenant-1',
      metadata: {},
      changed: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    return customer;
  };

  it('updates history and risk rating on first processing', async () => {
    const customer = buildCustomerMock();
    Customer.findOne.mockResolvedValue(customer);

    const rental = {
      id: 'rental-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      amount: 300,
      rentalDurationDays: 3,
      actualReturnDate: '2026-08-20',
      lateCharges: [{ totalCharge: 60, status: 'pending' }],
      damageReports: [{ estimatedRepairCost: 120 }],
    };

    const result = await updateRentalCustomerHistory({ rental, tenantId: 'tenant-1' });

    expect(result.updated).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(customer.metadata.rental.history).toMatchObject({
      totalRentals: 1,
      totalRentalDays: 3,
      totalRentalRevenue: 300,
      totalLateCharges: 60,
      totalDamageIncidents: 1,
      totalDamageCost: 120,
      lastRentalDate: '2026-08-20',
      lastRentalId: 'rental-1',
      processedRentalIds: ['rental-1'],
    });
    expect(customer.metadata.rental.riskProfile.riskRating).toBe('high');
    expect(customer.changed).toHaveBeenCalledWith('metadata', true);
    expect(customer.save).toHaveBeenCalled();
  });

  it('is idempotent when the same rental is processed twice', async () => {
    const customer = buildCustomerMock({
      metadata: {
        rental: {
          history: {
            totalRentals: 1,
            totalRentalDays: 3,
            totalRentalRevenue: 300,
            totalLateCharges: 0,
            totalDamageIncidents: 0,
            totalDamageCost: 0,
            lastRentalDate: '2026-08-20',
            lastRentalId: 'rental-1',
            processedRentalIds: ['rental-1'],
          },
          riskProfile: { riskRating: 'low' },
        },
      },
    });
    Customer.findOne.mockResolvedValue(customer);

    const rental = {
      id: 'rental-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      amount: 300,
      rentalDurationDays: 3,
      actualReturnDate: '2026-08-20',
      lateCharges: [],
      damageReports: [],
    };

    const result = await updateRentalCustomerHistory({ rental, tenantId: 'tenant-1' });

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('already_processed');
    expect(customer.save).not.toHaveBeenCalled();
  });

  it('loads rental by id when not provided', async () => {
    const customer = buildCustomerMock();
    Customer.findOne.mockResolvedValue(customer);
    Rental.findOne.mockResolvedValue({
      id: 'rental-2',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      amount: 150,
      rentalDurationDays: 2,
      endDate: '2026-08-15',
      lateCharges: [],
      damageReports: [],
    });

    const result = await updateRentalCustomerHistory({ rentalId: 'rental-2', tenantId: 'tenant-1' });

    expect(Rental.findOne).toHaveBeenCalled();
    expect(result.updated).toBe(true);
    expect(customer.metadata.rental.history.totalRentals).toBe(1);
    expect(customer.metadata.rental.history.lastRentalId).toBe('rental-2');
  });

  it('initializes metadata when customer has no rental profile yet', async () => {
    const customer = buildCustomerMock({ metadata: { other: true } });
    Customer.findOne.mockResolvedValue(customer);

    const rental = {
      id: 'rental-3',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      amount: 100,
      rentalDurationDays: 1,
      endDate: '2026-08-10',
      lateCharges: [],
      damageReports: [],
    };

    const result = await updateRentalCustomerHistory({ rental, tenantId: 'tenant-1' });

    expect(result.updated).toBe(true);
    expect(customer.metadata.other).toBe(true);
    expect(customer.metadata.rental.history.totalRentals).toBe(1);
    expect(customer.metadata.rental.riskProfile.riskRating).toBe('low');
  });
});
