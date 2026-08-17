jest.mock('../../../models', () => ({
  AutomationRule: { findAll: jest.fn() },
  AutomationRun: { findOne: jest.fn(), create: jest.fn() },
  Customer: {},
  Invoice: {},
  Product: {},
  Quote: {},
  Sale: {},
  Tenant: {},
  UserTask: { create: jest.fn() },
}));

jest.mock('../../../services/emailService', () => ({ sendPlatformMessage: jest.fn() }));
jest.mock('../../../services/smsService', () => ({ sendMessage: jest.fn() }));
jest.mock('../../../services/whatsappService', () => ({ sendMessage: jest.fn() }));
jest.mock('../../../services/emailTemplates', () => ({ marketingPlainMessageEmail: jest.fn((body) => body) }));
jest.mock('../../../utils/resolveBusinessNameForContext', () => ({
  resolveBusinessNameForContext: jest.fn(),
}));

const { resolveBusinessNameForContext } = require('../../../utils/resolveBusinessNameForContext');
const { AutomationRule } = require('../../../models');
const { runInvoiceSentAutomations } = require('../../../services/automationEngineService');

describe('runInvoiceSentAutomations paid skip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveBusinessNameForContext.mockResolvedValue({
      businessName: 'Test Press',
      branchName: '',
    });
  });

  it('skips invoice_sent rules when the invoice is already paid', async () => {
    const result = await runInvoiceSentAutomations({
      tenantId: 'tenant-1',
      invoice: {
        id: 'inv-1',
        status: 'paid',
        amountPaid: 80,
        totalAmount: 80,
        balance: 0,
      },
    });
    expect(result).toEqual({ skipped: true, reason: 'invoice_already_paid' });
    expect(AutomationRule.findAll).not.toHaveBeenCalled();
  });

  it('allows invoice_sent for a remaining-balance deposit', async () => {
    AutomationRule.findAll.mockResolvedValue([]);
    const result = await runInvoiceSentAutomations({
      tenantId: 'tenant-1',
      invoice: {
        id: 'inv-2',
        status: 'sent',
        amountPaid: 30,
        totalAmount: 80,
        balance: 50,
      },
    });
    expect(result).not.toMatchObject({ reason: 'invoice_already_paid' });
    expect(AutomationRule.findAll).toHaveBeenCalled();
  });
});
