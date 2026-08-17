jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn().mockResolvedValue([[], {}]),
    literal: jest.fn((sql) => ({ literal: sql })),
  }
}));

jest.mock('../../../utils/productStockUtils', () => ({
  applyStockChange: jest.fn().mockResolvedValue({ skipped: false, previousQuantity: 10, newQuantity: 9, quantityDelta: -1 }),
  applyStockChanges: jest.fn().mockResolvedValue([]),
  parseQuantity: (value) => {
    const qty = Number.parseFloat(value);
    return Number.isFinite(qty) ? qty : 0;
  },
}));

jest.mock('../../../models', () => ({
  Sale: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  SaleItem: {
    bulkCreate: jest.fn()
  },
  Product: {
    findAll: jest.fn(),
    create: jest.fn()
  },
  ProductVariant: {
    findAll: jest.fn()
  },
  ProductShopStock: {
    findOne: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
  ProductStockMovement: {
    create: jest.fn(),
  },
  Barcode: {},
  Customer: {},
  Dealer: {
    findOne: jest.fn()
  },
  Shop: {},
  Invoice: {},
  User: {},
  SaleActivity: {},
  Tenant: {},
  Payment: {},
  Setting: {
    findOne: jest.fn()
  }
}));

jest.mock('../../../services/dealerBalanceService', () => ({
  checkCreditLimit: jest.fn(() => ({ allowed: true }))
}));
jest.mock('../../../services/dealerLedgerService', () => ({
  recordSaleCharge: jest.fn().mockResolvedValue({ id: 'ledger-1' })
}));
jest.mock('../../../services/invoiceAccountingService', () => ({
  createInvoiceRevenueJournal: jest.fn()
}));
jest.mock('../../../services/saleAccountingService', () => ({
  createSaleCogsJournal: jest.fn(),
  createSaleRevenueJournal: jest.fn()
}));
jest.mock('../../../services/websocketService', () => ({
  emitNewSale: jest.fn(),
  emitSaleStatusChange: jest.fn(),
  emitInventoryAlert: jest.fn()
}));
jest.mock('../../../services/notificationService', () => ({
  notifyOrderStatusChanged: jest.fn(),
  notifyNewOrder: jest.fn()
}));
jest.mock('../../../services/orderCustomerNotificationService', () => ({
  notifyOrderCreatedForCustomer: jest.fn()
}));
jest.mock('../../../utils/taxConfig', () => ({
  getTaxConfigForTenant: jest.fn().mockResolvedValue({
    enabled: true,
    defaultRatePercent: 0,
    pricesAreTaxInclusive: false
  }),
  hasTaxConfigCache: jest.fn(() => false)
}));
jest.mock('../../../utils/taxCalculation', () => ({
  computeDocumentTax: jest.fn(({ lines, cartDiscount = 0 }) => {
    const subtotal = lines.reduce((sum, line) => {
      const quantity = parseFloat(line.quantity || 0);
      const unitPrice = parseFloat(line.unitPrice || 0);
      const discount = parseFloat(line.discount || 0);
      return sum + Math.max(0, quantity * unitPrice - discount);
    }, 0);
    return {
      subtotal,
      discount: cartDiscount,
      taxAmount: 0,
      netTaxable: Math.max(0, subtotal - cartDiscount),
      total: Math.max(0, subtotal - cartDiscount),
      lineResults: lines.map((line) => ({
        exclusive: Math.max(0, (parseFloat(line.quantity || 0) * parseFloat(line.unitPrice || 0)) - (parseFloat(line.discount || 0))),
        tax: 0,
        gross: Math.max(0, (parseFloat(line.quantity || 0) * parseFloat(line.unitPrice || 0)) - (parseFloat(line.discount || 0)))
      }))
    };
  })
}));
jest.mock('../../../utils/tenantLogo', () => ({ getTenantLogoUrl: jest.fn(() => '') }));
jest.mock('../../../utils/shopUtils', () => ({
  applyShopFilter: jest.fn((where) => where),
  attachShopToPayload: jest.fn((req, body) => body),
  assertShopRecordAccess: jest.fn(),
  userCanAccessShopId: jest.fn(() => true)
}));
jest.mock('../../../middleware/cache', () => ({
  invalidateSaleListCache: jest.fn(),
  invalidateAfterMutation: jest.fn()
}));
jest.mock('../../../config/config', () => ({ nodeEnv: 'test' }));

const { sequelize } = require('../../../config/database');
const { Sale, SaleItem, Product, ProductVariant, Setting, Dealer } = require('../../../models');
const { checkCreditLimit } = require('../../../services/dealerBalanceService');
const { recordSaleCharge } = require('../../../services/dealerLedgerService');
const saleController = require('../../../controllers/saleController');

describe('saleController createSaleCore', () => {
  const transaction = { id: 'tx-1', LOCK: { UPDATE: 'UPDATE' } };
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.query.mockResolvedValue([[], {}]);
    Sale.findOne.mockResolvedValue(null);
    Product.findAll.mockResolvedValue([]);
    ProductVariant.findAll.mockResolvedValue([]);
    Product.create.mockResolvedValue({ id: 'product-new', sku: null, barcode: null });
    Setting.findOne.mockResolvedValue(null);
    Sale.create.mockImplementation((payload) => Promise.resolve({ id: 'sale-1', ...payload }));
    SaleItem.bulkCreate.mockImplementation((rows) => Promise.resolve(rows.map((row, index) => ({ id: `item-${index + 1}`, ...row }))));
  });

  it('creates a sale item for an unsaved custom POS item with productId null', async () => {
    const { sale, items } = await saleController.createSaleCore(transaction, tenantId, userId, {
      paymentMethod: 'cash',
      items: [{ name: 'Custom service', quantity: 2, unitPrice: 15 }]
    });

    expect(Product.create).not.toHaveBeenCalled();
    expect(Sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 30,
        amountPaid: 30,
        deliveryRequired: false,
        deliveryFee: 0
      }),
      { transaction }
    );
    expect(items[0]).toEqual(expect.objectContaining({
      productId: null,
      name: 'Custom service',
      total: 30,
      metadata: expect.objectContaining({ customItem: true, saveAsProduct: false })
    }));
  });

  it('saves a custom POS item as a non-stock product in the same transaction', async () => {
    Product.create.mockResolvedValue({ id: 'product-saved', sku: 'CUST-1', barcode: null });

    const { items } = await saleController.createSaleCore(transaction, tenantId, userId, {
      items: [{ name: 'Custom bundle', quantity: 1, unitPrice: 99, saveAsProduct: true, sku: 'CUST-1' }]
    });

    expect(Product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        name: 'Custom bundle',
        sellingPrice: 99,
        trackStock: false,
        costPrice: 0,
        quantityOnHand: 0,
        unit: 'pcs',
        metadata: expect.objectContaining({ source: 'pos_custom_item' })
      }),
      { transaction }
    );
    expect(items[0]).toEqual(expect.objectContaining({
      productId: 'product-saved',
      metadata: expect.objectContaining({ customItem: true, savedProductId: 'product-saved' })
    }));
  });

  it('adds delivery fee after tax to final total and amount paid defaults', async () => {
    Setting.findOne.mockResolvedValue({
      value: {
        enabled: true,
        requireSelectionAtCheckout: true,
        bands: [{ id: 'nearby', label: 'Nearby', minKm: 0, maxKm: 5, fee: 12.5 }]
      }
    });

    const { sale } = await saleController.createSaleCore(transaction, tenantId, userId, {
      items: [{ name: 'Custom delivery order', quantity: 1, unitPrice: 100 }],
      delivery: { required: true, bandId: 'nearby', fee: 12.5 }
    });

    expect(sale).toEqual(expect.objectContaining({
      total: 112.5,
      amountPaid: 112.5,
      deliveryRequired: true,
      deliveryFee: 12.5,
      deliveryBandId: 'nearby',
      metadata: expect.objectContaining({
        delivery: expect.objectContaining({
          required: true,
          fee: 12.5,
          bandId: 'nearby',
          label: 'Nearby'
        })
      })
    }));
  });

  it('allows dealer charge-to-account sales without a customer', async () => {
    Dealer.findOne.mockResolvedValue({
      id: 'dealer-1',
      shopId: 'shop-1',
      balance: 0,
      creditLimit: 1000,
      isActive: true,
    });

    const { sale } = await saleController.createSaleCore(transaction, tenantId, userId, {
      dealerId: 'dealer-1',
      saleChannel: 'dealer',
      paymentMethod: 'cash',
      amountPaid: 0,
      chargeToAccount: 50,
      items: [{ name: 'Dealer stock item', quantity: 1, unitPrice: 50 }],
    });

    expect(Sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        dealerId: 'dealer-1',
        saleChannel: 'dealer',
        amountPaid: 0,
        total: 50,
        metadata: expect.objectContaining({
          dealerChargeToAccount: 50,
        }),
      }),
      { transaction }
    );
    const createPayload = Sale.create.mock.calls[0][0];
    expect(createPayload.customerId).toBeNull();
    expect(recordSaleCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        dealerId: 'dealer-1',
        amount: 50,
        saleId: sale.id,
      })
    );
    expect(checkCreditLimit).toHaveBeenCalled();
  });

  it('allows dealer split-payment sales without a customer', async () => {
    Dealer.findOne.mockResolvedValue({
      id: 'dealer-1',
      shopId: 'shop-1',
      balance: 0,
      creditLimit: 1000,
      isActive: true,
    });

    const { sale } = await saleController.createSaleCore(transaction, tenantId, userId, {
      dealerId: 'dealer-1',
      saleChannel: 'dealer',
      paymentMethod: 'cash',
      amountPaid: 20,
      chargeToAccount: 30,
      items: [{ name: 'Dealer split item', quantity: 1, unitPrice: 50 }],
    });

    expect(Sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        dealerId: 'dealer-1',
        saleChannel: 'dealer',
        amountPaid: 20,
        total: 50,
        metadata: expect.objectContaining({
          dealerChargeToAccount: 30,
        }),
      }),
      { transaction }
    );
    expect(recordSaleCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        dealerId: 'dealer-1',
        amount: 30,
        saleId: sale.id,
      })
    );
  });

  it('requires a customer for credit sales before creating the sale', async () => {
    await expect(saleController.createSaleCore(transaction, tenantId, userId, {
      paymentMethod: 'credit',
      amountPaid: 0,
      items: [{ name: 'Custom credit order', quantity: 1, unitPrice: 50 }]
    })).rejects.toThrow('Customer is required for credit or partially unpaid sales');

    expect(Sale.create).not.toHaveBeenCalled();
    expect(SaleItem.bulkCreate).not.toHaveBeenCalled();
  });

  it('allows credit sales with a customer so an invoice can be linked after commit', async () => {
    const { sale } = await saleController.createSaleCore(transaction, tenantId, userId, {
      customerId: 'customer-1',
      paymentMethod: 'credit',
      amountPaid: 0,
      items: [{ name: 'Custom credit order', quantity: 1, unitPrice: 50 }]
    });

    expect(Sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-1',
        paymentMethod: 'credit',
        amountPaid: 0,
        total: 50
      }),
      { transaction }
    );
    expect(sale).toEqual(expect.objectContaining({
      customerId: 'customer-1',
      paymentMethod: 'credit',
      amountPaid: 0,
      total: 50
    }));
  });

  it('rejects an invalid delivery band', async () => {
    Setting.findOne.mockResolvedValue({
      value: {
        enabled: true,
        bands: [{ id: 'nearby', label: 'Nearby', minKm: 0, maxKm: 5, fee: 12.5 }]
      }
    });

    await expect(saleController.createSaleCore(transaction, tenantId, userId, {
      items: [{ name: 'Custom delivery order', quantity: 1, unitPrice: 100 }],
      delivery: { required: true, bandId: 'missing', fee: 12.5 }
    })).rejects.toThrow('Invalid delivery band');

    expect(Sale.create).not.toHaveBeenCalled();
    expect(SaleItem.bulkCreate).not.toHaveBeenCalled();
  });
});
