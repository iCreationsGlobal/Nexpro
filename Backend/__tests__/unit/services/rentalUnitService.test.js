jest.mock('../../../models', () => ({
  RentalUnit: {
    findAll: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  RentalItem: {
    findAll: jest.fn(),
    count: jest.fn(),
  },
  Rental: {},
  Product: {
    findOne: jest.fn(),
  },
  ProductCategory: {},
}));

const { RentalUnit, RentalItem, Product } = require('../../../models');
const {
  productTracksSerialUnits,
  getAvailableUnitsForDateRange,
  getBookedUnitIdsForRange,
} = require('../../../services/rentalUnitService');

describe('rentalUnitService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('productTracksSerialUnits', () => {
    it('returns true when product metadata tracks serial units', () => {
      expect(productTracksSerialUnits({ metadata: { tracksSerialUnits: true } })).toBe(true);
    });

    it('returns true when category requires unit assignment', () => {
      expect(productTracksSerialUnits({
        metadata: {},
        category: { metadata: { requiresUnitAssignment: true } },
      })).toBe(true);
    });

    it('returns false for quantity-only products', () => {
      expect(productTracksSerialUnits({ metadata: {} })).toBe(false);
    });
  });

  describe('getBookedUnitIdsForRange', () => {
    it('returns unique booked unit ids from overlapping rentals', async () => {
      RentalItem.findAll.mockResolvedValue([
        { rentalUnitId: 'unit-1' },
        { rentalUnitId: 'unit-1' },
        { rentalUnitId: 'unit-2' },
      ]);

      const ids = await getBookedUnitIdsForRange({
        tenantId: 'tenant-1',
        productId: 'product-1',
        branchId: 'branch-1',
        startDate: '2026-02-01',
        endDate: '2026-02-05',
      });

      expect(ids).toEqual(['unit-1', 'unit-2']);
    });
  });

  describe('getAvailableUnitsForDateRange', () => {
    it('excludes booked and non-available units', async () => {
      RentalItem.findAll.mockResolvedValue([{ rentalUnitId: 'unit-booked' }]);
      RentalUnit.findAll.mockResolvedValue([
        { id: 'unit-free', serialNumber: 'VIN-001', status: 'available' },
      ]);

      const units = await getAvailableUnitsForDateRange({
        tenantId: 'tenant-1',
        productId: 'product-1',
        branchId: 'branch-1',
        startDate: '2026-02-01',
        endDate: '2026-02-05',
      });

      expect(RentalUnit.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'available',
            productId: 'product-1',
          }),
        }),
      );
      expect(units).toHaveLength(1);
      expect(units[0].serialNumber).toBe('VIN-001');
    });
  });
});
