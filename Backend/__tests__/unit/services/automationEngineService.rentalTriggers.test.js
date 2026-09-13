jest.mock('../../../models', () => ({
  AutomationRule: { findAll: jest.fn() },
  AutomationRun: { findOne: jest.fn(), create: jest.fn() },
  Customer: { findAll: jest.fn() },
  Invoice: { findAll: jest.fn() },
  Job: { findAll: jest.fn() },
  Lead: { findAll: jest.fn() },
  Prescription: { findAll: jest.fn() },
  PrescriptionItem: {},
  Product: {},
  Quote: {},
  Sale: { findAll: jest.fn(), findOne: jest.fn() },
  SaleItem: {},
  Tenant: {},
  User: {},
  UserTask: { create: jest.fn() },
  Rental: { findAll: jest.fn() },
  RentalItem: {},
}));

jest.mock('../../../services/emailService', () => ({ sendPlatformMessage: jest.fn() }));
jest.mock('../../../services/smsService', () => ({ sendMessage: jest.fn() }));
jest.mock('../../../services/whatsappService', () => ({ sendMessage: jest.fn(), formatCurrency: (n) => `GHS ${n}` }));
jest.mock('../../../services/emailTemplates', () => ({ marketingPlainMessageEmail: jest.fn((body) => body) }));
jest.mock('../../../utils/resolveBusinessNameForContext', () => ({
  resolveBusinessNameForContext: jest.fn(),
}));

const { resolveBusinessNameForContext } = require('../../../utils/resolveBusinessNameForContext');
const {
  buildRentalTriggerContext,
  runRentalCreatedAutomations,
  getTriggerContextsForRule,
} = require('../../../services/automationEngineService');
const { AutomationRule, AutomationRun, Rental } = require('../../../models');

const sampleRental = {
  id: 'rental-1',
  tenantId: 't1',
  customerId: 'c1',
  branchId: 'shop-1',
  status: 'confirmed',
  startDate: '2026-09-01',
  endDate: '2026-09-03',
  totalDue: 250,
  amountPaid: 50,
  items: [{ quantity: 1, product: { name: 'Camera Kit' } }],
  customer: {
    id: 'c1',
    name: 'Ama Mensah',
    email: 'ama@example.com',
    phone: '+233201234567',
  },
  metadata: { invoiceId: 'inv-1' },
};

describe('automationEngineService rental triggers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveBusinessNameForContext.mockResolvedValue({ businessName: 'Hire Co', branchName: '' });
    AutomationRun.findOne.mockResolvedValue(null);
    AutomationRun.create.mockResolvedValue({ id: 'run-1' });
    AutomationRule.findAll.mockResolvedValue([]);
  });

  it('builds rental trigger context with dates, items, and invoice fields', () => {
    const context = buildRentalTriggerContext({
      rental: sampleRental,
      customer: sampleRental.customer,
      invoice: { id: 'inv-1', invoiceNumber: 'INV-202609-0001', totalAmount: 250, amountPaid: 50, balance: 200 },
      kind: 'rental_created',
    });

    expect(context.subjectKey).toBe('rental_created:rental-1');
    expect(context.customerName).toBe('Ama Mensah');
    expect(context.invoiceNumber).toBe('INV-202609-0001');
    expect(context.totalAmountFormatted).toContain('250');
    expect(context.balance).toContain('200');
    expect(context.itemList).toMatch(/Camera Kit/i);
    expect(context.shopId).toBe('shop-1');
    expect(context.email).toBe('ama@example.com');
  });

  it('runs rental_created automations', async () => {
    AutomationRule.findAll.mockResolvedValue([{
      id: 'r1',
      enabled: true,
      triggerType: 'rental_created',
      actionConfig: { actions: [] },
      scheduleConfig: {},
      conditionConfig: {},
    }]);

    const summary = await runRentalCreatedAutomations({
      tenantId: 't1',
      rental: sampleRental,
      invoice: { invoiceNumber: 'INV-1' },
    });

    expect(AutomationRule.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ triggerType: 'rental_created' }),
    }));
    expect(summary.rulesChecked).toBe(1);
  });

  it('skips rental_created when rental is missing', async () => {
    const result = await runRentalCreatedAutomations({ tenantId: 't1', rental: null });
    expect(result).toEqual({ skipped: true, reason: 'missing_rental' });
    expect(AutomationRule.findAll).not.toHaveBeenCalled();
  });

  it('returns rental_due_in_days contexts by endDate', async () => {
    Rental.findAll.mockResolvedValue([sampleRental]);

    const contexts = await getTriggerContextsForRule({
      tenantId: 't1',
      triggerType: 'rental_due_in_days',
      triggerConfig: { daysBeforeDue: 1 },
    });

    expect(Rental.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 't1',
        status: expect.anything(),
        endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    }));
    expect(contexts).toHaveLength(1);
    expect(contexts[0].rentalId).toBe('rental-1');
    expect(contexts[0].customerName).toBe('Ama Mensah');
    expect(contexts[0].subjectKey).toMatch(/^rental_due:/);
  });

  it('scopes rental_due_in_days to rule.shopId via branchId', async () => {
    Rental.findAll.mockResolvedValue([]);
    await getTriggerContextsForRule({
      tenantId: 't1',
      shopId: 'shop-9',
      triggerType: 'rental_due_in_days',
      triggerConfig: { daysBeforeDue: 1 },
    });

    expect(Rental.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branchId: 'shop-9' }),
    }));
  });

  it('returns rental_overdue contexts for past-due rentals', async () => {
    Rental.findAll.mockResolvedValue([{
      ...sampleRental,
      status: 'overdue',
      endDate: '2026-08-01',
    }]);

    const contexts = await getTriggerContextsForRule({
      tenantId: 't1',
      triggerType: 'rental_overdue',
      triggerConfig: { daysAfterDue: 0 },
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0].rentalStatus).toBe('overdue');
    expect(Rental.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 't1',
        endDate: expect.anything(),
      }),
    }));
  });
});
