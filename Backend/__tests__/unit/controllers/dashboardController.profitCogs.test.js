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

describe('dashboardController profit deducts cost of goods sold', () => {
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
          totalJobs: 0, newJobs: 0, inProgressJobs: 0, onHoldJobs: 0,
          cancelledJobs: 0, completedJobs: 0, thisMonthJobs: 0,
        }]);
      }
      if (text.includes('FROM invoices')) {
        return Promise.resolve([{ totalRevenue: 0, thisMonthRevenue: 0, outstandingBalance: 0 }]);
      }
      if (text.includes('FROM expenses')) {
        return Promise.resolve([{ totalExpenses: 100, thisMonthExpenses: 40 }]);
      }
      // Cost-of-goods-sold query joins sale_items, not "FROM sales" directly.
      if (text.includes('FROM sale_items')) {
        return Promise.resolve([{ monthCogs: 120, todayCogs: 20, totalCogs: 300 }]);
      }
      if (text.includes('FROM sales')) {
        return Promise.resolve([{
          monthSalesRevenue: 500, todaySales: 50, weekSales: 200,
          todaySalesCount: 2, totalSales: 10,
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

  it('subtracts COGS from both revenue and expenses when computing this month profit', async () => {
    const req = {
      tenantId: 'tenant-1',
      query: {},
      shopScoped: false,
      studioLocationScoped: false,
    };
    const res = createResponse();

    await dashboardController.getDashboardOverview(req, res, jest.fn());

    const payload = res.json.mock.calls[0][0].data;
    // revenue 500 - expenses 40 - cogs 120 = 340 (not 460, which would ignore product cost)
    expect(payload.currentMonth.profit).toBe(340);
    expect(payload.currentMonth.revenue).toBe(500);
    expect(payload.currentMonth.expenses).toBe(40);
  });

  it('subtracts COGS from all-time profit as well', async () => {
    const req = {
      tenantId: 'tenant-1',
      query: {},
      shopScoped: false,
      studioLocationScoped: false,
    };
    const res = createResponse();

    await dashboardController.getDashboardOverview(req, res, jest.fn());

    const payload = res.json.mock.calls[0][0].data;
    // all-time revenue comes from invoices (0 for shop) OR sales; totalRevenue here is invoice-based (0)
    // but totalExpenses (100) and totalCogs (300) should both be deducted, never ignored.
    expect(payload.allTime.profit).toBe(payload.allTime.revenue - 100 - 300);
  });
});
