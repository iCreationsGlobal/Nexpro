const { Op } = require('sequelize');

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    col: jest.fn((name) => ({ col: name })),
    literal: jest.fn((value) => ({ literal: value })),
    where: jest.fn((...args) => ({ where: args })),
    QueryTypes: { SELECT: 'SELECT' },
  },
}));

jest.mock('../../../models', () => ({
  Job: {},
  Expense: { sum: jest.fn() },
  Customer: { count: jest.fn() },
  Vendor: {},
  Invoice: { sum: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  JobItem: {},
  Lead: {},
  Sale: { sum: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  SaleItem: { findAll: jest.fn() },
  Product: { findAll: jest.fn() },
  ProductVariant: {},
  Prescription: {},
  PrescriptionItem: {},
  Drug: {},
  MaterialMovement: {},
  MaterialItem: {},
  Payment: { count: jest.fn(), sum: jest.fn() },
  Tenant: {},
  Shop: {},
  Setting: {},
  UserShop: {},
  StudioLocation: {},
  UserStudioLocation: {},
  AccountBalance: {},
  Account: {},
  JournalEntry: {},
  JournalEntryLine: {},
}));

const { Expense, Customer, Invoice, Sale, SaleItem, Payment } = require('../../../models');
const reportController = require('../../../controllers/reportController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('reportController profit formulas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // No Payment ledger rows → fall back to Invoice/Sale totals (legacy behaviour under test).
    Payment.count.mockResolvedValue(0);
  });

  describe('getKpiSummary', () => {
    it('computes grossProfit = revenue - COGS and netProfit = grossProfit - operating expenses for a studio (non-retail) tenant', async () => {
      const req = {
        tenantId: 'tenant-1',
        tenant: { businessType: 'printing_press' },
        query: {},
        shopScoped: false,
        studioLocationScoped: false,
      };
      const res = mockRes();

      Invoice.sum.mockImplementation((field) => {
        if (field === 'amountPaid') return Promise.resolve(1000);
        if (field === 'balance') return Promise.resolve(200);
        return Promise.resolve(0);
      });
      Expense.sum.mockResolvedValue(300);
      Customer.count.mockResolvedValue(5);

      await reportController.getKpiSummary(req, res, jest.fn());

      const payload = res.json.mock.calls[0][0].data;
      expect(payload.totalRevenue).toBe(1000);
      expect(payload.cogs).toBe(0); // non-retail: no per-item COGS tracked
      // Previously this endpoint returned grossProfit = revenue - expenses (mislabeled net profit).
      expect(payload.grossProfit).toBe(1000); // revenue - cogs(0)
      expect(payload.netProfit).toBe(700); // grossProfit - operatingExpenses(300)
      expect(payload.totalExpenses).toBe(300); // operatingExpenses + cogs
    });

    it('deducts COGS from grossProfit and excludes trackStock=false items for a retail tenant, matching the dashboard COGS rule', async () => {
      const req = {
        tenantId: 'tenant-2',
        tenant: { businessType: 'shop' },
        query: {},
        shopScoped: false,
        studioLocationScoped: false,
      };
      const res = mockRes();

      Sale.sum.mockImplementation((field) => {
        if (field === 'total') return Promise.resolve(2000);
        return Promise.resolve(0);
      });
      Expense.sum.mockResolvedValue(500);
      Customer.count.mockResolvedValue(3);
      Invoice.sum.mockResolvedValue(150);
      SaleItem.findAll.mockResolvedValue([
        { quantity: 10, product: { costPrice: 5, trackStock: true }, variant: null },
        // trackStock=false must be excluded entirely, matching dashboardController's COGS query
        // (COALESCE(p."trackStock", true) != false), even though it has a nonzero cost.
        { quantity: 4, product: { costPrice: 100, trackStock: false }, variant: null },
        { quantity: 2, product: { trackStock: true }, variant: { costPrice: 20 } },
      ]);

      await reportController.getKpiSummary(req, res, jest.fn());

      const payload = res.json.mock.calls[0][0].data;
      expect(payload.totalRevenue).toBe(2000);
      expect(payload.cogs).toBe(90); // (10*5) + (2*20); the trackStock=false row is excluded
      expect(payload.grossProfit).toBe(1910); // 2000 - 90
      expect(payload.netProfit).toBe(1410); // 1910 - 500
      expect(payload.totalExpenses).toBe(590); // 500 opEx + 90 cogs
    });
  });

  describe('getVatReport', () => {
    it('excludes draft/cancelled invoices and cancelled/refunded sales from VAT totals', async () => {
      const req = {
        tenantId: 'tenant-3',
        tenant: { businessType: 'printing_press' },
        query: {},
        shopScoped: false,
        studioLocationScoped: false,
      };
      const res = mockRes();

      Invoice.findOne.mockResolvedValue({ totalVat: 100, totalSubtotal: 1000, invoiceCount: 5 });
      Invoice.findAll.mockResolvedValue([]);
      Sale.findOne.mockResolvedValue({ totalVat: 20, totalSubtotal: 200, saleCount: 2 });
      Sale.findAll.mockResolvedValue([]);

      await reportController.getVatReport(req, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

      const invoiceWhere = Invoice.findOne.mock.calls[0][0].where;
      expect(invoiceWhere.status).toEqual({ [Op.notIn]: ['draft', 'cancelled'] });

      const saleWhere = Sale.findOne.mock.calls[0][0].where;
      expect(saleWhere.status).toEqual({ [Op.notIn]: ['cancelled', 'refunded'] });
      expect(saleWhere.deletedAt).toBeNull();

      // byPeriod queries must reuse the same filtered where clauses.
      const invoiceByPeriodWhere = Invoice.findAll.mock.calls[0][0].where;
      expect(invoiceByPeriodWhere.status).toEqual({ [Op.notIn]: ['draft', 'cancelled'] });
      const saleByPeriodWhere = Sale.findAll.mock.calls[0][0].where;
      expect(saleByPeriodWhere.status).toEqual({ [Op.notIn]: ['cancelled', 'refunded'] });
    });
  });
});
