jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    fn: jest.fn((name, col) => ({ fn: name, col })),
    col: jest.fn((name) => ({ col: name })),
    where: jest.fn((...args) => ({ where: args })),
    QueryTypes: { SELECT: 'SELECT' },
  },
}));

jest.mock('../../../models', () => ({
  Payment: { count: jest.fn(), sum: jest.fn() },
  Invoice: { sum: jest.fn() },
  Sale: { sum: jest.fn() },
}));

jest.mock('../../../utils/shopUtils', () => ({
  getShopSqlFragment: jest.fn(() => ({ sql: '', replacements: {} })),
  applyShopFilter: jest.fn((_req, where) => where),
}));

jest.mock('../../../utils/studioLocationUtils', () => ({
  getStudioLocationSqlFragment: jest.fn(() => ({ sql: '', replacements: {} })),
}));

jest.mock('../../../utils/reportScopeUtils', () => ({
  scopedReportWhere: jest.fn((_req, extra) => ({ tenantId: _req.tenantId, ...extra })),
}));

const { Op } = require('sequelize');
const { sequelize } = require('../../../config/database');
const { Payment, Invoice, Sale } = require('../../../models');
const collectedRevenueService = require('../../../services/collectedRevenueService');

describe('collectedRevenueService', () => {
  const req = {
    tenantId: 'tenant-1',
    shopScoped: false,
    studioLocationScoped: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sums Payment ledger amounts by paymentDate when income payments exist', async () => {
    Payment.count.mockResolvedValue(2);
    sequelize.query.mockResolvedValue([{ total: '1200.00' }]);

    const jan = {
      [Op.between]: [new Date('2026-01-01'), new Date('2026-01-31T23:59:59.999')],
    };
    const total = await collectedRevenueService.sumCollectedRevenue(req, jan, { mode: 'studio' });

    expect(total).toBe(1200);
    expect(sequelize.query).toHaveBeenCalled();
    const sql = sequelize.query.mock.calls[0][0];
    expect(sql).toContain('paymentDate');
    expect(sql).toContain('payments p');
  });

  it('falls back to Invoice.amountPaid when tenant has no Payment rows', async () => {
    Payment.count.mockResolvedValue(0);
    Invoice.sum.mockResolvedValue(2000);

    const total = await collectedRevenueService.sumCollectedRevenue(req, {}, { mode: 'studio' });
    expect(total).toBe(2000);
    expect(Invoice.sum).toHaveBeenCalledWith('amountPaid', expect.any(Object));
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  it('falls back to Sale.total for retail when no Payment rows', async () => {
    Payment.count.mockResolvedValue(0);
    Sale.sum.mockResolvedValue(3500);

    const total = await collectedRevenueService.sumCollectedRevenue(req, {}, {
      mode: 'retail',
      fallbackField: 'total',
    });
    expect(total).toBe(3500);
    expect(Sale.sum).toHaveBeenCalledWith('total', expect.any(Object));
  });

  it('groups collections by paymentDate for installment attribution', async () => {
    Payment.count.mockResolvedValue(1);
    sequelize.query.mockResolvedValue([
      { month: 1, year: 2026, totalRevenue: '800', count: '1' },
      { month: 9, year: 2026, totalRevenue: '1200', count: '1' },
    ]);

    const rows = await collectedRevenueService.getCollectedRevenueByPeriod(
      req,
      {},
      'month',
      'studio'
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].totalRevenue).toBe('800');
    expect(rows[1].totalRevenue).toBe('1200');
    expect(sequelize.query.mock.calls[0][0]).toContain('paymentDate');
  });
});
