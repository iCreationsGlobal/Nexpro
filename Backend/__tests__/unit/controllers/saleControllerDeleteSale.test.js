jest.mock('../../../config/database', () => ({
  sequelize: {
    col: jest.fn((name) => ({ col: name })),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    json: jest.fn((path) => ({ json: path })),
    literal: jest.fn((value) => ({ literal: value })),
    query: jest.fn(),
    transaction: jest.fn(),
    where: jest.fn((left, right) => ({ where: [left, right] })),
  },
}));

jest.mock('../../../models', () => ({
  Sale: { findOne: jest.fn() },
  SaleItem: { destroy: jest.fn() },
  Product: { findByPk: jest.fn() },
  ProductVariant: { findByPk: jest.fn() },
  Barcode: {},
  Customer: {},
  Dealer: {},
  Shop: {},
  Invoice: { findAll: jest.fn() },
  User: {},
  SaleActivity: { create: jest.fn(), destroy: jest.fn() },
  Tenant: {},
  Payment: { destroy: jest.fn() },
  Setting: {},
  SaleReturn: { count: jest.fn() },
}));

jest.mock('../../../services/invoiceAccountingService', () => ({
  createInvoiceRevenueJournal: jest.fn(),
}));
jest.mock('../../../services/saleAccountingService', () => ({
  createSaleCogsJournal: jest.fn(),
  createSaleRevenueJournal: jest.fn(),
}));
jest.mock('../../../services/accountingService', () => ({
  reverseAndDestroyJournalEntries: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../../services/dealerLedgerService', () => ({
  recordSaleCharge: jest.fn(),
  reverseAndDestroyLedgerEntriesForSale: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../../services/saleHardDeleteService', () => ({
  hardDeleteSaleInTransaction: jest.fn(),
}));
jest.mock('../../../services/customerBalanceService', () => ({
  updateCustomerBalance: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../services/dealerBalanceService', () => ({
  checkCreditLimit: jest.fn(),
}));
jest.mock('../../../services/invoiceSaleService', () => ({
  syncSaleInvoiceAndRefreshCustomerBalance: jest.fn(),
}));
jest.mock('../../../services/websocketService', () => ({
  emitNewSale: jest.fn(),
  emitSaleStatusChange: jest.fn(),
  emitInventoryAlert: jest.fn(),
}));
jest.mock('../../../services/notificationService', () => ({
  notifyOrderStatusChanged: jest.fn(),
  notifyNewOrder: jest.fn(),
}));
jest.mock('../../../services/orderCustomerNotificationService', () => ({
  notifyOrderCreatedForCustomer: jest.fn(),
}));
jest.mock('../../../services/deliverySettingsService', () => ({
  resolveDeliveryForSale: jest.fn(),
}));
jest.mock('../../../utils/taxConfig', () => ({
  getTaxConfigForTenant: jest.fn(),
  hasTaxConfigCache: jest.fn(() => false),
}));
jest.mock('../../../utils/taxCalculation', () => ({
  computeDocumentTax: jest.fn(),
}));
jest.mock('../../../utils/tenantLogo', () => ({ getTenantLogoUrl: jest.fn(() => '') }));
jest.mock('../../../utils/shopUtils', () => ({
  applyShopFilter: jest.fn((req, where) => where),
  attachShopToPayload: jest.fn((req, body) => body),
  assertShopRecordAccess: jest.fn(),
  userCanAccessShopId: jest.fn(() => true),
}));
jest.mock('../../../middleware/cache', () => ({
  invalidateSaleListCache: jest.fn(),
  invalidateInvoiceListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));
jest.mock('../../../config/config', () => ({
  nodeEnv: 'test',
  pagination: {
    defaultPageSize: 10,
    maxPageSize: 100,
  },
}));

const { sequelize } = require('../../../config/database');
const { Sale, SaleActivity } = require('../../../models');
const { assertShopRecordAccess } = require('../../../utils/shopUtils');
const { hardDeleteSaleInTransaction } = require('../../../services/saleHardDeleteService');
const { invalidateInvoiceListCache } = require('../../../middleware/cache');
const saleController = require('../../../controllers/saleController');

describe('saleController deleteSale (soft vs hard delete)', () => {
  let transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    assertShopRecordAccess.mockImplementation(() => undefined);
    transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };
    sequelize.transaction.mockResolvedValue(transaction);
    hardDeleteSaleInTransaction.mockResolvedValue({ invoiceIds: [] });
  });

  const buildSale = (overrides = {}) => ({
    id: 'sale-1',
    tenantId: 'tenant-1',
    amountPaid: 100,
    status: 'completed',
    deletedAt: null,
    customerId: null,
    invoiceId: null,
    invoice: null,
    items: [],
    update: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  it('hard-deletes the sale row for admins via shared helper', async () => {
    const sale = buildSale();
    Sale.findOne.mockResolvedValue(sale);

    const req = {
      params: { id: 'sale-1' },
      tenantId: 'tenant-1',
      tenantRole: 'admin',
      user: { id: 'admin-1', role: 'admin' },
      body: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await saleController.deleteSale(req, res, next);

    expect(hardDeleteSaleInTransaction).toHaveBeenCalledWith(expect.objectContaining({
      sale,
      tenantId: 'tenant-1',
      transaction,
    }));
    expect(transaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('hard-deletes paid credit / invoice sales for admins', async () => {
    const sale = buildSale({
      invoiceId: 'inv-1',
      customerId: 'cust-1',
      amountPaid: 500,
      paymentMethod: 'credit',
      status: 'completed',
    });
    Sale.findOne.mockResolvedValue(sale);
    hardDeleteSaleInTransaction.mockResolvedValue({ invoiceIds: ['inv-1'] });

    const req = {
      params: { id: 'sale-1' },
      tenantId: 'tenant-1',
      tenantRole: 'owner',
      user: { id: 'owner-1', role: 'admin' },
      body: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await saleController.deleteSale(req, res, next);

    expect(hardDeleteSaleInTransaction).toHaveBeenCalled();
    expect(invalidateInvoiceListCache).toHaveBeenCalledWith('tenant-1');
    expect(transaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('hard-deletes dealer sales for admins (ledger handled in shared helper)', async () => {
    const sale = buildSale({
      dealerId: 'dealer-1',
      saleChannel: 'dealer',
      amountPaid: 50,
      paymentMethod: 'cash',
    });
    Sale.findOne.mockResolvedValue(sale);

    const req = {
      params: { id: 'sale-1' },
      tenantId: 'tenant-1',
      tenantRole: 'admin',
      user: { id: 'admin-1', role: 'admin' },
      body: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await saleController.deleteSale(req, res, next);

    expect(hardDeleteSaleInTransaction).toHaveBeenCalledWith(expect.objectContaining({
      sale: expect.objectContaining({ dealerId: 'dealer-1' }),
    }));
    expect(transaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('blocks permanent delete when the shared helper reports returns', async () => {
    const sale = buildSale();
    Sale.findOne.mockResolvedValue(sale);
    const err = new Error('Cannot permanently delete a sale that has returns or exchanges. Remove those first, or keep the sale for audit.');
    err.statusCode = 400;
    err.errorCode = 'SALE_HAS_RETURNS';
    hardDeleteSaleInTransaction.mockRejectedValue(err);

    const req = {
      params: { id: 'sale-1' },
      tenantId: 'tenant-1',
      tenantRole: 'admin',
      user: { id: 'admin-1', role: 'admin' },
      body: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await saleController.deleteSale(req, res, next);

    expect(transaction.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('returns'),
    }));
  });

  it('soft-deletes a paid sale for managers, recording the reason and an audit activity', async () => {
    const sale = buildSale({ amountPaid: 250 });
    Sale.findOne.mockResolvedValue(sale);

    const req = {
      params: { id: 'sale-1' },
      tenantId: 'tenant-1',
      tenantRole: 'manager',
      user: { id: 'manager-1', role: 'manager' },
      body: { reason: 'Customer requested cancellation after refund' },
    };
    const res = buildRes();
    const next = jest.fn();

    await saleController.deleteSale(req, res, next);

    expect(hardDeleteSaleInTransaction).not.toHaveBeenCalled();
    expect(sale.destroy).not.toHaveBeenCalled();
    expect(sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        deletedBy: 'manager-1',
        deletionReason: 'Customer requested cancellation after refund',
      }),
      { transaction }
    );
    expect(SaleActivity.create).toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
