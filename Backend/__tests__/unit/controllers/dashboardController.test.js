jest.mock('../../../config/database', () => ({
  sequelize: {
    QueryTypes: { SELECT: 'SELECT' },
    query: jest.fn(),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    col: jest.fn((name) => ({ col: name })),
    where: jest.fn((...args) => ({ where: args })),
    literal: jest.fn((value) => ({ literal: value })),
  },
}));

const { sequelize } = require('../../../config/database');
const { Tenant } = require('../../../models');
const dashboardController = require('../../../controllers/dashboardController');

jest.mock('../../../models', () => ({
  Job: { findAll: jest.fn().mockResolvedValue([]) },
  Expense: { findAll: jest.fn().mockResolvedValue([]) },
  Customer: {},
  Vendor: {},
  Invoice: { findAll: jest.fn().mockResolvedValue([]) },
  Tenant: { findByPk: jest.fn() },
  Sale: { findAll: jest.fn().mockResolvedValue([]) },
  SaleItem: {},
  InventoryItem: {},
  Product: {
    count: jest.fn().mockResolvedValue(0),
    findAll: jest.fn().mockResolvedValue([]),
  },
  Payment: { count: jest.fn().mockResolvedValue(0), sum: jest.fn().mockResolvedValue(0) },
}));

describe('dashboardController expense scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Tenant.findByPk.mockResolvedValue({
      id: 'tenant-1',
      businessType: 'shop',
      name: 'Test shop',
    });
    sequelize.query.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM jobs')) {
        return Promise.resolve([{
          totalJobs: 0,
          newJobs: 0,
          inProgressJobs: 0,
          onHoldJobs: 0,
          cancelledJobs: 0,
          completedJobs: 0,
          thisMonthJobs: 0,
        }]);
      }
      if (text.includes('FROM invoices')) {
        return Promise.resolve([{
          totalRevenue: 0,
          thisMonthRevenue: 0,
          outstandingBalance: 0,
        }]);
      }
      if (text.includes('FROM expenses')) {
        return Promise.resolve([{
          totalExpenses: 0,
          thisMonthExpenses: 0,
        }]);
      }
      if (text.includes('FROM sales')) {
        return Promise.resolve([{
          monthSalesRevenue: 0,
          todaySales: 0,
          weekSales: 0,
          todaySalesCount: 0,
          totalSales: 0,
        }]);
      }
      return Promise.resolve([{}]);
    });
  });

  afterEach(() => {
    dashboardController.invalidateTenantCache('tenant-1');
  });

  const createResponse = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  };

  it('filters overview expense totals by the active shop only', async () => {
    const req = {
      tenantId: 'tenant-1',
      query: {},
      shopScoped: true,
      shopFilterId: 'shop-1',
      canAccessAllShops: false,
      studioLocationScoped: false,
    };
    const res = createResponse();

    await dashboardController.getDashboardOverview(req, res, jest.fn());

    const expenseCall = sequelize.query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM expenses')
    );
    expect(expenseCall).toBeTruthy();
    expect(expenseCall[0]).toContain('AND "shopId" = :shopFilterId');
    expect(expenseCall[0]).not.toContain('"shopId" IS NULL');
    expect(expenseCall[1].replacements.shopFilterId).toBe('shop-1');
  });

  it('keeps overview expense totals tenant-wide when no location scope is selected', async () => {
    const req = {
      tenantId: 'tenant-1',
      query: {},
      shopScoped: false,
      studioLocationScoped: false,
    };
    const res = createResponse();

    await dashboardController.getDashboardOverview(req, res, jest.fn());

    const expenseCall = sequelize.query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM expenses')
    );
    expect(expenseCall).toBeTruthy();
    expect(expenseCall[0]).not.toContain('"shopId"');
    expect(expenseCall[0]).not.toContain('"studioLocationId"');
  });
});
