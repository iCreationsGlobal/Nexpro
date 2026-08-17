jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock('../../../models', () => ({
  Job: { findOne: jest.fn(), create: jest.fn() },
  Customer: {},
  User: {},
  Payment: { findAll: jest.fn(), destroy: jest.fn() },
  Expense: { findAll: jest.fn(), destroy: jest.fn() },
  ExpenseActivity: { destroy: jest.fn() },
  JobItem: { destroy: jest.fn(), bulkCreate: jest.fn() },
  Invoice: { findAll: jest.fn(), findOne: jest.fn(), destroy: jest.fn() },
  Quote: {},
  JobStatusHistory: { destroy: jest.fn(), create: jest.fn() },
  MaterialMovement: { findAll: jest.fn(), destroy: jest.fn() },
  MaterialItem: { findOne: jest.fn() },
  Lead: { update: jest.fn() },
  Setting: { findOne: jest.fn() },
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

jest.mock('../../../controllers/invoiceController', () => ({
  applyInvoicePaymentInternal: jest.fn(),
  sendInvoiceToCustomer: jest.fn(),
}));

const { applyInvoicePaymentInternal } = require('../../../controllers/invoiceController');
const { applyJobCreatePaymentToInvoice } = require('../../../controllers/jobController');

describe('applyJobCreatePaymentToInvoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not record a payment when the job is unpaid', async () => {
    const invoice = { id: 'inv-1', totalAmount: 100, status: 'draft' };
    const result = await applyJobCreatePaymentToInvoice({
      tenantId: 'tenant-1',
      invoice,
      paymentIntent: { ok: true, status: 'unpaid' },
    });
    expect(applyInvoicePaymentInternal).not.toHaveBeenCalled();
    expect(result).toMatchObject({ invoice, skipPaidReceipt: false, payment: null });
  });

  it('records a full payment and skips a second paid receipt', async () => {
    const invoice = { id: 'inv-1', totalAmount: 150, status: 'draft', amountPaid: 0 };
    const paidInvoice = { ...invoice, status: 'paid', amountPaid: 150, balance: 0 };
    const payment = { id: 'pay-1', amount: 150 };
    applyInvoicePaymentInternal.mockResolvedValue({
      invoice: paidInvoice,
      payment,
      duplicate: false,
    });

    const result = await applyJobCreatePaymentToInvoice({
      tenantId: 'tenant-1',
      userId: 'user-1',
      invoice,
      paymentIntent: {
        ok: true,
        status: 'paid',
        amount: 150,
        paymentMethod: 'cash',
        referenceNumber: 'R-1',
        notes: 'Paid at counter',
        paymentDate: null,
      },
    });

    expect(applyInvoicePaymentInternal).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      userId: 'user-1',
      invoice,
      amount: 150,
      paymentMethod: 'cash',
      referenceNumber: 'R-1',
      notes: 'Paid at counter',
    }));
    expect(result.skipPaidReceipt).toBe(true);
    expect(result.invoice.status).toBe('paid');
    expect(result.payment).toEqual(payment);
  });

  it('records a deposit less than the invoice total', async () => {
    const invoice = { id: 'inv-1', totalAmount: 200, status: 'draft', amountPaid: 0 };
    const partialInvoice = { ...invoice, status: 'sent', amountPaid: 50, balance: 150 };
    applyInvoicePaymentInternal.mockResolvedValue({
      invoice: partialInvoice,
      payment: { id: 'pay-2', amount: 50 },
      duplicate: false,
    });

    const result = await applyJobCreatePaymentToInvoice({
      tenantId: 'tenant-1',
      invoice,
      paymentIntent: {
        ok: true,
        status: 'deposit',
        amount: 50,
        paymentMethod: 'mobile_money',
        referenceNumber: '',
        notes: null,
        paymentDate: null,
      },
    });

    expect(applyInvoicePaymentInternal).toHaveBeenCalledWith(expect.objectContaining({
      amount: 50,
      paymentMethod: 'mobile_money',
    }));
    expect(result.skipPaidReceipt).toBe(true);
    expect(result.invoice.balance).toBe(150);
  });
});
