jest.mock('../../../config/database', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    col: jest.fn((name) => ({ col: name })),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    literal: jest.fn((value) => ({ literal: value })),
  },
}));

jest.mock('../../../models', () => ({
  Product: {
    findAndCountAll: jest.fn(),
    sequelize: {
      literal: jest.fn((value) => ({ literal: value })),
      cast: jest.fn((value, type) => ({ cast: value, type })),
      where: jest.fn((attr, condition) => ({ where: attr, condition })),
    },
  },
  ProductVariant: {},
  Shop: {},
  ProductCategory: {},
  Barcode: { findAll: jest.fn().mockResolvedValue([]) },
  SaleItem: {},
  Sale: {},
  Customer: {},
  User: {},
}));

jest.mock('../../../utils/tenantUtils', () => ({
  applyTenantFilter: jest.fn((_tenantId, where) => where),
  sanitizePayload: jest.fn((body) => ({ ...body })),
}));

jest.mock('../../../utils/shopUtils', () => ({
  applyShopReadFilter: jest.fn((_req, where) => where),
  attachShopToPayload: jest.fn((_req, payload) => payload),
  assertShopRecordAccess: jest.fn(),
  userCanAccessShopId: jest.fn(),
}));

jest.mock('../../../utils/productStockUtils', () => ({
  applyEffectiveProductQuantity: jest.fn((product) => product),
  attachShopStockToProducts: jest.fn(async (products) => products),
  shopCatalogVisibilityLiteral: jest.fn(),
}));

jest.mock('../../../utils/paginationUtils', () => ({
  getPagination: jest.fn(() => ({ page: 1, limit: 10, offset: 0 })),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateProductListCache: jest.fn(),
}));

const { Product } = require('../../../models');
const productController = require('../../../controllers/productController');

describe('productController rental fields', () => {
  const rentalReq = {
    tenantId: 'tenant-rental',
    tenant: { businessType: 'rental' },
  };

  describe('_applyRentalTenantProductDefaults', () => {
    it('defaults isRentable true and isSalable false for rental tenants on create', () => {
      const payload = { name: 'Mini Bus' };
      productController._applyRentalTenantProductDefaults(payload, rentalReq, { isCreate: true });
      expect(payload.isRentable).toBe(true);
      expect(payload.isSalable).toBe(false);
    });

    it('does not override explicit rental flags', () => {
      const payload = { isRentable: false, isSalable: true };
      productController._applyRentalTenantProductDefaults(payload, rentalReq, { isCreate: true });
      expect(payload.isRentable).toBe(false);
      expect(payload.isSalable).toBe(true);
    });

    it('skips defaults for non-rental tenants', () => {
      const payload = { name: 'T-Shirt' };
      productController._applyRentalTenantProductDefaults(payload, {
        tenant: { businessType: 'shop' },
      }, { isCreate: true });
      expect(payload.isRentable).toBeUndefined();
      expect(payload.isSalable).toBeUndefined();
    });
  });

  describe('_validateProductRentalFields', () => {
    it('requires rentalRatePerDay > 0 for rentable rental-tenant products', () => {
      expect(() => {
        productController._validateProductRentalFields(
          { name: 'Bus', isRentable: true },
          rentalReq,
          { isCreate: true },
        );
      }).toThrow('rentalRatePerDay must be greater than 0 for rentable products');
    });

    it('accepts rental-only product without sellingPrice on create', () => {
      const payload = {
        name: 'Bus',
        isRentable: true,
        isSalable: false,
        rentalRatePerDay: 250,
      };
      productController._validateProductRentalFields(payload, rentalReq, { isCreate: true });
      expect(payload.sellingPrice).toBe(0);
    });

    it('allows non-rentable product without rental rate for rental tenants', () => {
      const payload = {
        name: 'Consumable',
        isRentable: false,
        isSalable: true,
        sellingPrice: 10,
      };
      expect(() => {
        productController._validateProductRentalFields(payload, rentalReq, { isCreate: true });
      }).not.toThrow();
    });

    it('merges existing product state on update', () => {
      const payload = { name: 'Updated name' };
      expect(() => {
        productController._validateProductRentalFields(payload, rentalReq, {
          existingProduct: {
            isRentable: true,
            isSalable: false,
            rentalRatePerDay: 100,
          },
          isCreate: false,
        });
      }).not.toThrow();
    });

    it('rejects update that clears rental rate on rentable product', () => {
      expect(() => {
        productController._validateProductRentalFields(
          { rentalRatePerDay: 0 },
          rentalReq,
          {
            existingProduct: {
              isRentable: true,
              isSalable: false,
              rentalRatePerDay: 100,
            },
            isCreate: false,
          },
        );
      }).toThrow('rentalRatePerDay must be greater than 0 for rentable products');
    });
  });

  describe('getProducts isRentable / isSalable filters', () => {
    const mockRes = () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };

    beforeEach(() => {
      Product.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    });

    it('applies isRentable=true filter', async () => {
      const req = {
        ...rentalReq,
        query: { isRentable: 'true' },
        shopScoped: false,
      };
      const res = mockRes();
      const next = jest.fn();

      await productController.getProducts(req, res, next);

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isRentable: true }),
        }),
      );
    });

    it('applies isSalable=false filter', async () => {
      const req = {
        ...rentalReq,
        query: { isSalable: 'false' },
        shopScoped: false,
      };
      const res = mockRes();
      const next = jest.fn();

      await productController.getProducts(req, res, next);

      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isSalable: false }),
        }),
      );
    });
  });
});
