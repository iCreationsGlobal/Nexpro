jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock('../../../models', () => ({
  Job: { findOne: jest.fn() },
  Customer: {},
  User: {},
  Payment: { findAll: jest.fn(), destroy: jest.fn() },
  Expense: { findAll: jest.fn(), destroy: jest.fn() },
  ExpenseActivity: { destroy: jest.fn() },
  JobItem: { destroy: jest.fn() },
  Invoice: { findAll: jest.fn(), destroy: jest.fn() },
  Quote: {},
  JobStatusHistory: { destroy: jest.fn() },
  MaterialMovement: { findAll: jest.fn(), destroy: jest.fn() },
  MaterialItem: { findOne: jest.fn() },
  Lead: { update: jest.fn() },
  Setting: {},
  StudioLocation: {},
  Sale: { update: jest.fn() },
  PartnerCommission: { destroy: jest.fn() },
  StorefrontReview: { destroy: jest.fn() },
}));

jest.mock('../../../services/customerBalanceService', () => ({
  updateCustomerBalance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateInvoiceListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));

jest.mock('../../../utils/studioLocationUtils', () => ({
  applyStudioLocationFilter: (_req, where) => where,
  attachStudioLocationToPayload: (_req, payload) => payload,
}));

const { sequelize } = require('../../../config/database');
const {
  Job,
  Payment,
  Expense,
  ExpenseActivity,
  JobItem,
  Invoice,
  JobStatusHistory,
  MaterialMovement,
  MaterialItem,
  Lead,
  Sale,
  PartnerCommission,
  StorefrontReview,
} = require('../../../models');
const { updateCustomerBalance } = require('../../../services/customerBalanceService');
const { deleteJob } = require('../../../controllers/jobController');

describe('deleteJob cascade', () => {
  const transaction = {
    LOCK: { UPDATE: 'UPDATE' },
    finished: false,
    commit: jest.fn(async () => { transaction.finished = true; }),
    rollback: jest.fn(async () => { transaction.finished = true; }),
  };

  const res = () => {
    const response = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    return response;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.finished = false;
    sequelize.transaction.mockResolvedValue(transaction);

    Job.findOne.mockResolvedValue({
      id: 'job-1',
      customerId: 'cust-1',
      destroy: jest.fn().mockResolvedValue(undefined),
    });
    Invoice.findAll.mockResolvedValue([{ id: 'inv-1', customerId: 'cust-1' }]);
    Payment.findAll.mockResolvedValue([{ id: 'pay-1' }]);
    Expense.findAll.mockResolvedValue([{ id: 'exp-1' }]);
    PartnerCommission.destroy.mockResolvedValue(1);
    Sale.update.mockResolvedValue([1]);
    ExpenseActivity.destroy.mockResolvedValue(1);
    Expense.destroy.mockResolvedValue(1);
    Payment.destroy.mockResolvedValue(1);
    MaterialMovement.findAll.mockResolvedValue([
      { itemId: 'mat-1', quantityDelta: -2 },
    ]);
    MaterialItem.findOne.mockResolvedValue({
      quantityOnHand: 8,
      save: jest.fn().mockResolvedValue(undefined),
    });
    MaterialMovement.destroy.mockResolvedValue(1);
    StorefrontReview.destroy.mockResolvedValue(0);
    Lead.update.mockResolvedValue([1]);
    Invoice.destroy.mockResolvedValue(1);
    JobStatusHistory.destroy.mockResolvedValue(1);
    JobItem.destroy.mockResolvedValue(1);
  });

  it('cascades linked invoices/payments/expenses/materials instead of blocking', async () => {
    const req = { params: { id: 'job-1' }, tenantId: 'tenant-1' };
    const response = res();
    const next = jest.fn();

    await deleteJob(req, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Invoice.destroy).toHaveBeenCalled();
    expect(Payment.destroy).toHaveBeenCalled();
    expect(Expense.destroy).toHaveBeenCalled();
    expect(MaterialMovement.destroy).toHaveBeenCalled();
    expect(Lead.update).toHaveBeenCalledWith(
      { convertedJobId: null },
      expect.objectContaining({
        where: expect.objectContaining({ convertedJobId: 'job-1' }),
      })
    );
    expect(MaterialItem.findOne).toHaveBeenCalled();
    expect(updateCustomerBalance).toHaveBeenCalledWith('cust-1', null, 'tenant-1');
    expect(response.body.message).toBeUndefined();
  });
});
