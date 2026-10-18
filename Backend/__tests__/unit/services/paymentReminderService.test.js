jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

jest.mock('../../../models', () => ({
  Invoice: {
    findAll: jest.fn(),
  },
  Customer: {},
  Tenant: {
    findByPk: jest.fn(),
  },
  Setting: {
    findOne: jest.fn(),
  },
  WhatsAppMessageEvent: {
    findOne: jest.fn(),
  },
}));

jest.mock('../../../services/whatsappService', () => ({
  getConfig: jest.fn(),
  validatePhoneNumber: jest.fn(),
  checkRateLimit: jest.fn(),
  sendMessage: jest.fn(),
}));

jest.mock('../../../services/smsService', () => ({
  getResolvedConfig: jest.fn(),
  validatePhoneNumber: jest.fn(),
  checkRateLimit: jest.fn(),
  sendMessage: jest.fn(),
}));

jest.mock('../../../services/emailService', () => ({
  getConfig: jest.fn(),
  sendMessage: jest.fn(),
}));

jest.mock('../../../services/emailTemplates', () => ({
  paymentReminder: jest.fn(() => ({
    subject: 'Payment reminder',
    html: '<p>Reminder</p>',
    text: 'Reminder',
  })),
}));

jest.mock('../../../services/whatsappTemplates', () => ({
  preparePaymentReminder: jest.fn(() => ['INV-001']),
}));

jest.mock('../../../services/smsTemplateService', () => ({
  renderForTenant: jest.fn().mockResolvedValue('Reminder SMS'),
}));

jest.mock('../../../services/activityLogger', () => ({
  logInvoiceOverdue: jest.fn(),
}));

jest.mock('../../../services/messageDeliveryRulesService', () => ({
  isChannelEnabledForEvent: jest.fn(),
}));

jest.mock('../../../utils/tenantLogo', () => ({
  getTenantLogoUrl: jest.fn(() => ''),
}));

const { Invoice, Setting, Tenant } = require('../../../models');
const emailService = require('../../../services/emailService');
const smsService = require('../../../services/smsService');
const whatsappService = require('../../../services/whatsappService');
const { isChannelEnabledForEvent } = require('../../../services/messageDeliveryRulesService');
const paymentReminderService = require('../../../services/paymentReminderService');

describe('paymentReminderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paymentReminderService.isRunning = false;
    isChannelEnabledForEvent.mockResolvedValue(true);
    whatsappService.getConfig.mockResolvedValue(null);
    smsService.getResolvedConfig.mockResolvedValue(null);
    emailService.getConfig.mockResolvedValue({ enabled: true, provider: 'smtp' });
    emailService.sendMessage.mockResolvedValue({ success: true });
    Setting.findOne.mockResolvedValue({ value: { sendPaymentReminderEmail: true } });
    Tenant.findByPk.mockResolvedValue({ name: 'Test Business', metadata: {} });
  });

  it('sends email reminders for email-only overdue customers when enabled', async () => {
    const invoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      invoiceNumber: 'INV-001',
      balance: '125.50',
      totalAmount: '125.50',
      currency: 'GHS',
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      status: 'overdue',
      paymentToken: 'pay-token',
      customer: {
        id: 'customer-1',
        name: 'Email Customer',
        phone: null,
        email: 'customer@example.com',
      },
      toJSON: jest.fn(function toJSON() {
        return { ...this };
      }),
      update: jest.fn(),
    };
    Invoice.findAll.mockResolvedValue([invoice]);

    await paymentReminderService.checkAndSendReminders();

    expect(emailService.sendMessage).toHaveBeenCalledWith(
      'tenant-1',
      'customer@example.com',
      'Payment reminder',
      '<p>Reminder</p>',
      'Reminder'
    );
    expect(whatsappService.getConfig).toHaveBeenCalled();
    expect(smsService.getResolvedConfig).toHaveBeenCalled();
  });

  it('does not send email reminders when the email toggle is disabled', async () => {
    Setting.findOne.mockResolvedValue({ value: { sendPaymentReminderEmail: false } });
    Invoice.findAll.mockResolvedValue([
      {
        id: 'invoice-1',
        tenantId: 'tenant-1',
        invoiceNumber: 'INV-001',
        balance: '125.50',
        totalAmount: '125.50',
        currency: 'GHS',
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        status: 'overdue',
        customer: {
          id: 'customer-1',
          name: 'Email Customer',
          phone: null,
          email: 'customer@example.com',
        },
      },
    ]);

    await paymentReminderService.checkAndSendReminders();

    expect(emailService.sendMessage).not.toHaveBeenCalled();
  });

  it('always sends the built-in SMS and email reminders when their switches are on', async () => {
    smsService.getResolvedConfig.mockResolvedValue({ enabled: true });
    smsService.validatePhoneNumber.mockReturnValue('+233201234567');
    smsService.sendMessage.mockResolvedValue({ success: true });

    Invoice.findAll.mockResolvedValue([
      {
        id: 'invoice-1',
        tenantId: 'tenant-1',
        invoiceNumber: 'INV-001',
        balance: '125.50',
        totalAmount: '125.50',
        currency: 'GHS',
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        status: 'overdue',
        paymentToken: 'pay-token',
        customer: {
          id: 'customer-1',
          name: 'Ama',
          phone: '+233201234567',
          email: 'ama@example.com',
        },
        toJSON: jest.fn(function toJSON() {
          return { ...this };
        }),
        update: jest.fn(),
      },
    ]);

    await paymentReminderService.checkAndSendReminders();

    expect(smsService.sendMessage).toHaveBeenCalledWith('tenant-1', '+233201234567', 'Reminder SMS');
    expect(emailService.sendMessage).toHaveBeenCalledWith(
      'tenant-1',
      'ama@example.com',
      'Payment reminder',
      '<p>Reminder</p>',
      'Reminder'
    );
  });
});
