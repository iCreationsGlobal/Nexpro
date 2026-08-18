const {
  sumActiveVariantQuantity,
  getEffectiveProductQuantityOnHand,
  applyEffectiveProductQuantity,
  resolveStockMovementType,
  shouldSyncDenormalizedQuantity,
  parseQuantity,
  MOVEMENT_TYPES,
} = require('../../../utils/productStockUtils');

jest.mock('../../../models', () => ({
  Product: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
  },
  ProductVariant: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    sum: jest.fn(),
  },
  ProductStockMovement: {
    create: jest.fn(),
  },
  ProductShopStock: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('../../../config/database', () => ({
  sequelize: {
    literal: jest.fn((sql) => ({ literal: sql })),
  },
}));

const { Product, ProductVariant, ProductStockMovement, ProductShopStock } = require('../../../models');
const { applyStockChange, getShopStockQuantity } = require('../../../utils/productStockUtils');

describe('productStockUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sumActiveVariantQuantity', () => {
    it('sums active variant quantities', () => {
      expect(sumActiveVariantQuantity([
        { quantityOnHand: 1, isActive: true },
        { quantityOnHand: 2, isActive: true },
        { quantityOnHand: 99, isActive: false },
      ])).toBe(3);
    });
  });

  describe('getEffectiveProductQuantityOnHand', () => {
    it('returns parent quantity for simple products', () => {
      expect(getEffectiveProductQuantityOnHand({ hasVariants: false, quantityOnHand: 5 })).toBe(5);
    });

    it('returns variant sum for variant parents', () => {
      expect(getEffectiveProductQuantityOnHand({
        hasVariants: true,
        quantityOnHand: 1,
        variants: [
          { quantityOnHand: 1, isActive: true },
          { quantityOnHand: 1, isActive: true },
        ],
      })).toBe(2);
    });

    it('uses totalVariantStock when variants are not loaded', () => {
      expect(getEffectiveProductQuantityOnHand({
        hasVariants: true,
        quantityOnHand: 1,
        totalVariantStock: 40,
      })).toBe(40);
    });

    it('does not overwrite simple product quantity when totalVariantStock is 0', () => {
      expect(getEffectiveProductQuantityOnHand({
        hasVariants: false,
        quantityOnHand: 50,
        totalVariantStock: 0,
      })).toBe(50);
    });

    it('uses totalVariantStock when loaded variants are all zero', () => {
      expect(getEffectiveProductQuantityOnHand({
        hasVariants: true,
        quantityOnHand: 0,
        totalVariantStock: 313,
        variants: [
          { quantityOnHand: 0, isActive: true },
          { quantityOnHand: 0, isActive: true },
        ],
      })).toBe(313);
    });
  });

  describe('applyEffectiveProductQuantity', () => {
    it('overwrites parent quantity with variant total', () => {
      const product = applyEffectiveProductQuantity({
        hasVariants: true,
        quantityOnHand: 1,
        totalVariantStock: 40,
      });
      expect(product.quantityOnHand).toBe(40);
      expect(product.totalVariantStock).toBe(40);
    });
  });

  describe('resolveStockMovementType', () => {
    it('uses explicit type when valid', () => {
      expect(resolveStockMovementType({ type: 'receive', reason: 'other' })).toBe('receive');
      expect(resolveStockMovementType({ type: 'sale' })).toBe('sale');
      expect(resolveStockMovementType({ type: 'sale_void' })).toBe('sale_void');
      expect(resolveStockMovementType({ type: 'count_adjustment' })).toBe('count_adjustment');
    });

    it('infers receive from reason text', () => {
      expect(resolveStockMovementType({ reason: 'Receive stock', quantityDelta: 5 })).toBe('receive');
    });

    it('infers damage from reason text', () => {
      expect(resolveStockMovementType({ reason: 'Damaged units', quantityDelta: -2 })).toBe('damage');
    });

    it('defaults to adjustment', () => {
      expect(resolveStockMovementType({ reason: 'Manual tweak', quantityDelta: -2 })).toBe('adjustment');
    });
  });

  describe('MOVEMENT_TYPES', () => {
    it('includes sale and transfer types', () => {
      expect(MOVEMENT_TYPES.has('sale')).toBe(true);
      expect(MOVEMENT_TYPES.has('transfer_in')).toBe(true);
      expect(MOVEMENT_TYPES.has('opening')).toBe(true);
    });
  });

  describe('shouldSyncDenormalizedQuantity', () => {
    it('syncs when product has no home shop', () => {
      expect(shouldSyncDenormalizedQuantity({ shopId: null }, 'shop-1')).toBe(true);
    });

    it('syncs when shop matches home shop', () => {
      expect(shouldSyncDenormalizedQuantity({ shopId: 'shop-1' }, 'shop-1')).toBe(true);
    });

    it('skips when shop differs from home shop', () => {
      expect(shouldSyncDenormalizedQuantity({ shopId: 'shop-1' }, 'shop-2')).toBe(false);
    });
  });

  describe('parseQuantity', () => {
    it('parses finite numbers and defaults invalid to 0', () => {
      expect(parseQuantity('12.5')).toBe(12.5);
      expect(parseQuantity('nope')).toBe(0);
    });
  });

  describe('applyStockChange', () => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };

    it('requires a transaction', async () => {
      await expect(applyStockChange({
        tenantId: 't1',
        productId: 'p1',
        shopId: 's1',
        delta: 1,
      })).rejects.toThrow(/transaction/i);
    });

    it('requires shopId', async () => {
      await expect(applyStockChange({
        tenantId: 't1',
        productId: 'p1',
        delta: 1,
        transaction,
      })).rejects.toThrow(/shopId/i);
    });

    it('updates shop stock, denormalized qty, and writes a movement', async () => {
      const product = {
        id: 'p1',
        tenantId: 't1',
        shopId: 's1',
        trackStock: true,
        hasVariants: false,
        quantityOnHand: 10,
        update: jest.fn().mockResolvedValue(undefined),
      };
      const shopStock = {
        id: 'ss1',
        quantityOnHand: 10,
        update: jest.fn().mockResolvedValue(undefined),
      };
      const movement = { id: 'm1' };

      Product.findOne.mockResolvedValue(product);
      ProductShopStock.findOne.mockResolvedValue(shopStock);
      ProductStockMovement.create.mockResolvedValue(movement);

      const result = await applyStockChange({
        tenantId: 't1',
        productId: 'p1',
        shopId: 's1',
        delta: -3,
        type: 'sale',
        reason: 'Sale S-1',
        reference: 'sale:abc',
        userId: 'u1',
        transaction,
      });

      expect(result.skipped).toBe(false);
      expect(result.previousQuantity).toBe(10);
      expect(result.newQuantity).toBe(7);
      expect(result.quantityDelta).toBe(-3);
      expect(shopStock.update).toHaveBeenCalledWith({ quantityOnHand: 7 }, { transaction });
      expect(product.update).toHaveBeenCalledWith({ quantityOnHand: 7 }, { transaction });
      expect(ProductStockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sale',
          quantityDelta: -3,
          previousQuantity: 10,
          newQuantity: 7,
          shopId: 's1',
          reference: 'sale:abc',
        }),
        { transaction }
      );
    });

    it('skips when trackStock is false', async () => {
      Product.findOne.mockResolvedValue({
        id: 'p1',
        tenantId: 't1',
        shopId: 's1',
        trackStock: false,
        hasVariants: false,
        quantityOnHand: 10,
      });

      const result = await applyStockChange({
        tenantId: 't1',
        productId: 'p1',
        shopId: 's1',
        delta: -1,
        type: 'sale',
        transaction,
      });

      expect(result.skipped).toBe(true);
      expect(ProductShopStock.findOne).not.toHaveBeenCalled();
    });

    it('supports setTo mode', async () => {
      const product = {
        id: 'p1',
        tenantId: 't1',
        shopId: 's1',
        trackStock: true,
        hasVariants: false,
        quantityOnHand: 4,
        update: jest.fn().mockResolvedValue(undefined),
      };
      const shopStock = {
        id: 'ss1',
        quantityOnHand: 4,
        update: jest.fn().mockResolvedValue(undefined),
      };

      Product.findOne.mockResolvedValue(product);
      ProductShopStock.findOne.mockResolvedValue(shopStock);
      ProductStockMovement.create.mockResolvedValue({ id: 'm2' });

      const result = await applyStockChange({
        tenantId: 't1',
        productId: 'p1',
        shopId: 's1',
        setTo: 12,
        type: 'receive',
        transaction,
      });

      expect(result.newQuantity).toBe(12);
      expect(result.quantityDelta).toBe(8);
      expect(shopStock.update).toHaveBeenCalledWith({ quantityOnHand: 12 }, { transaction });
    });

    it('does not sync denormalized qty for a non-home shop', async () => {
      const product = {
        id: 'p1',
        tenantId: 't1',
        shopId: 'home-shop',
        trackStock: true,
        hasVariants: false,
        quantityOnHand: 20,
        update: jest.fn().mockResolvedValue(undefined),
      };
      const shopStock = {
        id: 'ss2',
        quantityOnHand: 0,
        update: jest.fn().mockResolvedValue(undefined),
      };

      Product.findOne.mockResolvedValue(product);
      ProductShopStock.findOne.mockResolvedValue(shopStock);
      ProductStockMovement.create.mockResolvedValue({ id: 'm3' });

      await applyStockChange({
        tenantId: 't1',
        productId: 'p1',
        shopId: 'other-shop',
        delta: 5,
        type: 'transfer_in',
        transaction,
      });

      expect(shopStock.update).toHaveBeenCalledWith({ quantityOnHand: 5 }, { transaction });
      expect(product.update).not.toHaveBeenCalled();
    });
  });

  describe('getShopStockQuantity', () => {
    it('prefers shop stock row over denormalized qty', async () => {
      ProductShopStock.findOne.mockResolvedValue({ quantityOnHand: 42 });
      const qty = await getShopStockQuantity({
        tenantId: 't1',
        productId: 'p1',
        shopId: 's1',
        product: { quantityOnHand: 9 },
      });
      expect(qty).toBe(42);
    });

    it('falls back to product quantity when no shop stock row', async () => {
      ProductShopStock.findOne.mockResolvedValue(null);
      const qty = await getShopStockQuantity({
        tenantId: 't1',
        productId: 'p1',
        shopId: 's1',
        product: { quantityOnHand: 9 },
      });
      expect(qty).toBe(9);
    });
  });
});
