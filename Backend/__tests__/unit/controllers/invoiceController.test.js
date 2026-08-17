jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock('../../../models', () => ({
  Invoice: { findOne: jest.fn(), findAndCountAll: jest.fn(), findAll: jest.fn(), count: jest.fn(), sum: jest.fn(), destroy: jest.fn() },
  Job: { findAll: jest.fn().mockResolvedValue([]) },
  Sale: { findAll: jest.fn().mockResolvedValue([]) },
  Customer: {},
  JobItem: {},
  Payment: { create: jest.fn(), findOne: jest.fn(), findAll: jest.fn().mockResolvedValue([]) },
  SaleItem: {},
  Prescription: {},
  SaleActivity: {},
  Tenant: {},
  Setting: { findOne: jest.fn() },
  Quote: {},
  QuoteItem: {},
  Product: {},
  Shop: { findByPk: jest.fn() },
  StudioLocation: { findByPk: jest.fn() },
  User: {},
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateInvoiceListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));

jest.mock('../../../services/activityLogger', () => ({
  logInvoiceSent: jest.fn(),
  logInvoicePaid: jest.fn(),
  logPaymentReceived: jest.fn(),
}));

jest.mock('../../../services/customerBalanceService', () => ({
  updateCustomerBalance: jest.fn(),
}));

jest.mock('../../../services/invoiceSaleService', () => ({
  ensureSaleFromPaidInvoice: jest.fn().mockResolvedValue({ sale: null, created: false, updated: false }),
}));

jest.mock('../../../services/sabitoWebhookService', () => ({
  sendInvoiceWebhook: jest.fn(),
  sendInvoicePaidWebhook: jest.fn(),
}));

jest.mock('../../../services/mobileMoneyService', () => ({}));
jest.mock('../../../services/tenantMomoCollectionService', () => ({
  getResolvedMtnConfigForTenant: jest.fn(),
}));
jest.mock('../../../services/tenantHubtelCollectionService', () => ({
  getResolvedHubtelConfigForTenant: jest.fn(),
}));
jest.mock('../../../services/paymentCollectionRouter', () => ({
  buildPublicPaymentOptions: jest.fn(() => ({
    paystack: true,
    directHubtel: false,
    directMtnMoMo: false,
    directAirtelMoMo: false,
    directMoMo: false,
  })),
  resolveMoMoCollector: jest.fn(() => ({ rail: 'paystack' })),
}));
jest.mock('../../../services/directMoMoChargeService', () => ({
  initiateDirectMoMoCharge: jest.fn(),
  checkDirectMoMoStatus: jest.fn(),
  buildMobileMoneyRefMeta: jest.fn((result, extras = {}) => ({
    referenceId: result.referenceId,
    provider: result.provider,
    status: result.status || 'PENDING',
    rail: result.rail,
    ...extras,
  })),
}));

jest.mock('../../../services/invoiceAccountingService', () => ({
  createInvoicePaymentJournal: jest.fn(),
  createInvoiceRevenueJournal: jest.fn(),
}));

jest.mock('../../../utils/taxConfig', () => ({
  getTaxConfigForTenant: jest.fn().mockResolvedValue({ enabled: false }),
}));

jest.mock('../../../utils/taxCalculation', () => ({
  convertLineItemsFromTaxInclusive: jest.fn(({ items, subtotal }) => ({ items, subtotal })),
}));

jest.mock('../../../utils/tenantLogo', () => ({
  getTenantLogoUrl: jest.fn(),
}));

jest.mock('../../../utils/documentOrganizationUtils', () => ({
  resolveDocumentOrganization: jest.fn().mockResolvedValue({ name: 'Test Business' }),
  organizationToEmailCompany: jest.fn().mockReturnValue({
    name: 'Test Business',
    logo: '',
    primaryColor: '#166534',
  }),
}));

jest.mock('../../../services/whatsappService', () => ({
  getConfig: jest.fn().mockResolvedValue(null),
  validatePhoneNumber: jest.fn((phone) => phone),
  sendMessage: jest.fn(),
}));

jest.mock('../../../services/smsService', () => ({
  getResolvedConfig: jest.fn().mockResolvedValue(null),
  validatePhoneNumber: jest.fn((phone) => phone),
  checkRateLimit: jest.fn().mockReturnValue(true),
  sendMessage: jest.fn(),
}));

jest.mock('../../../services/emailTemplates', () => ({
  invoiceNotification: jest.fn().mockReturnValue({
    subject: 'Invoice INV-001',
    html: '<p>Invoice</p>',
    text: 'Invoice',
  }),
  invoicePaidConfirmation: jest.fn().mockReturnValue({
    subject: 'Payment received INV-001',
    html: '<p>Paid</p>',
    text: 'Paid',
  }),
}));

jest.mock('../../../services/emailService', () => ({
  sendMessage: jest.fn(),
  getConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../services/messageDeliveryRulesService', () => ({
  isChannelEnabledForEvent: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/customerNotificationBridgeService', () => ({
  TEMPLATE_KEYS: {
    INVOICE_SENT: 'invoice_sent_notification',
    PAYMENT_RECEIVED_THANK_YOU: 'payment_received_thank_you',
  },
  isCustomerNotificationEffectiveEnabled: jest.fn(),
  shouldUseAutomationInsteadOfBuiltIn: jest.fn(),
}));

jest.mock('../../../services/automationEngineService', () => ({
  runPaymentReceivedAutomations: jest.fn(),
  runReviewRequestAutomations: jest.fn(),
  runInvoiceSentAutomations: jest.fn().mockResolvedValue({ executed: 1 }),
  runHighValueInvoiceAutomations: jest.fn().mockResolvedValue({ executed: 0 }),
}));

const { Invoice, Payment, Setting, Job, Sale } = require('../../../models');
const { Op } = require('sequelize');
const { updateCustomerBalance } = require('../../../services/customerBalanceService');
const { ensureSaleFromPaidInvoice } = require('../../../services/invoiceSaleService');
const emailService = require('../../../services/emailService');
const emailTemplates = require('../../../services/emailTemplates');
const { createInvoicePaymentJournal } = require('../../../services/invoiceAccountingService');
const bridgeService = require('../../../services/customerNotificationBridgeService');
const automationEngineService = require('../../../services/automationEngineService');
const invoiceController = require('../../../controllers/invoiceController');

describe('invoiceController sendInvoiceToCustomer logging', () => {
  const baseInvoice = () => ({
    id: 'invoice-1',
    tenantId: 'tenant-1',
    invoiceNumber: 'INV-001',
    saleId: 'sale-1',
    sourceType: 'sale',
    customerId: 'customer-1',
    paymentToken: 'token-1',
    totalAmount: 125,
    items: [],
    customer: {
      id: 'customer-1',
      email: 'alex@example.com',
      phone: '+233501234567',
    },
    job: null,
    update: jest.fn().mockResolvedValue(undefined),
    reload: jest.fn().mockResolvedValue(undefined),
    toJSON() {
      return {
        id: this.id,
        invoiceNumber: this.invoiceNumber,
        saleId: this.saleId,
        sourceType: this.sourceType,
        totalAmount: this.totalAmount,
      };
    },
  });

  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    bridgeService.isCustomerNotificationEffectiveEnabled.mockImplementation(async (_tenantId, { settingEnabled }) => settingEnabled);
    bridgeService.shouldUseAutomationInsteadOfBuiltIn.mockResolvedValue(false);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs the setting, sale invoice identifiers, masked email, attempt, and success', async () => {
    const invoice = baseInvoice();
    Invoice.findOne.mockResolvedValue(invoice);
    Setting.findOne.mockResolvedValue({
      value: { autoSendInvoiceToCustomer: true },
    });
    emailService.sendMessage.mockResolvedValue({ success: true, messageId: 'msg-1' });

    await invoiceController.sendInvoiceToCustomer('tenant-1', invoice, {
      userId: 'user-1',
      deliverySource: 'test_sale_invoice',
    });

    expect(emailService.sendMessage).toHaveBeenCalledWith(
      'tenant-1',
      'alex@example.com',
      'Invoice INV-001',
      '<p>Invoice</p>',
      'Invoice'
    );
    expect(logSpy).toHaveBeenCalledWith('[InvoiceDelivery]', expect.objectContaining({
      event: 'invoice_send_decision',
      tenantId: 'tenant-1',
      userId: 'user-1',
      saleId: 'sale-1',
      invoiceId: 'invoice-1',
      sourceType: 'sale',
      autoSendInvoiceToCustomer: true,
      hasCustomerEmail: true,
      customerEmail: 'al***@e***.com',
      decision: 'send_customer_channels',
    }));
    expect(logSpy).toHaveBeenCalledWith('[InvoiceDelivery]', expect.objectContaining({
      event: 'invoice_email_attempt',
      providerPath: 'emailService.sendMessage',
    }));
    expect(logSpy).toHaveBeenCalledWith('[InvoiceDelivery]', expect.objectContaining({
      event: 'invoice_email_success',
      providerPath: 'emailService.sendMessage',
      messageId: 'msg-1',
    }));
  });

  it('logs a skip and does not send email when auto-send is disabled', async () => {
    const invoice = baseInvoice();
    Invoice.findOne.mockResolvedValue(invoice);
    Setting.findOne.mockResolvedValue({
      value: { autoSendInvoiceToCustomer: false },
    });

    await invoiceController.sendInvoiceToCustomer('tenant-1', invoice, {
      deliverySource: 'test_sale_invoice',
    });

    expect(emailService.sendMessage).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('[InvoiceDelivery]', expect.objectContaining({
      event: 'invoice_send_decision',
      tenantId: 'tenant-1',
      saleId: 'sale-1',
      autoSendInvoiceToCustomer: false,
      autoSendInvoiceToCustomerRaw: false,
      decision: 'skip_customer_channels',
      reason: 'auto_send_disabled',
    }));
    expect(logSpy).toHaveBeenCalledWith('[InvoiceDelivery]', expect.objectContaining({
      event: 'invoice_email_skipped',
      reason: 'auto_send_disabled',
    }));
  });

  it('uses automation rules instead of built-in channels when invoice_sent rule is enabled', async () => {
    const invoice = baseInvoice();
    Invoice.findOne.mockResolvedValue(invoice);
    Setting.findOne.mockResolvedValue({
      value: { autoSendInvoiceToCustomer: true },
    });
    bridgeService.isCustomerNotificationEffectiveEnabled.mockResolvedValue(true);
    bridgeService.shouldUseAutomationInsteadOfBuiltIn.mockResolvedValue(true);

    await invoiceController.sendInvoiceToCustomer('tenant-1', invoice, {
      userId: 'user-1',
      deliverySource: 'quote_accept',
    });

    expect(emailService.sendMessage).not.toHaveBeenCalled();
    expect(automationEngineService.runInvoiceSentAutomations).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        invoice,
        paymentLink: expect.stringContaining('/pay-invoice/'),
        actorUserId: 'user-1',
      })
    );
    expect(logSpy).toHaveBeenCalledWith('[InvoiceDelivery]', expect.objectContaining({
      event: 'invoice_send_decision',
      decision: 'send_via_automation',
      reason: 'automation_rule_enabled',
    }));
  });

  it('skips invoice_sent pay CTAs when the invoice is already paid', async () => {
    const invoice = {
      ...baseInvoice(),
      status: 'paid',
      amountPaid: 125,
      balance: 0,
    };
    Invoice.findOne.mockResolvedValue(invoice);
    Setting.findOne.mockResolvedValue({
      value: { autoSendInvoiceToCustomer: true, sendInvoicePaidConfirmationToCustomer: true },
    });
    bridgeService.shouldUseAutomationInsteadOfBuiltIn.mockImplementation(async (_tenantId, templateKey) => (
      templateKey === bridgeService.TEMPLATE_KEYS.INVOICE_SENT
    ));
    emailService.sendMessage.mockResolvedValue({ success: true, messageId: 'paid-1' });

    await invoiceController.sendInvoiceToCustomer('tenant-1', invoice, {
      userId: 'user-1',
      deliverySource: 'job_creation_auto_send',
    });

    expect(automationEngineService.runInvoiceSentAutomations).not.toHaveBeenCalled();
    expect(emailTemplates.invoiceNotification).not.toHaveBeenCalled();
    expect(emailTemplates.invoicePaidConfirmation).toHaveBeenCalled();
  });

  it('does not resend a paid receipt when skipPaidReceipt is set', async () => {
    const invoice = {
      ...baseInvoice(),
      status: 'paid',
      amountPaid: 125,
      balance: 0,
    };
    Invoice.findOne.mockResolvedValue(invoice);
    Setting.findOne.mockResolvedValue({
      value: { autoSendInvoiceToCustomer: true },
    });

    await invoiceController.sendInvoiceToCustomer('tenant-1', invoice, {
      userId: 'user-1',
      deliverySource: 'job_creation_auto_send',
      skipPaidReceipt: true,
    });

    expect(automationEngineService.runInvoiceSentAutomations).not.toHaveBeenCalled();
    expect(emailTemplates.invoiceNotification).not.toHaveBeenCalled();
    expect(emailTemplates.invoicePaidConfirmation).not.toHaveBeenCalled();
    expect(emailService.sendMessage).not.toHaveBeenCalled();
  });

  it('still sends invoice_sent with a pay path for a remaining-balance deposit', async () => {
    const invoice = {
      ...baseInvoice(),
      status: 'sent',
      amountPaid: 40,
      balance: 85,
    };
    Invoice.findOne.mockResolvedValue(invoice);
    Setting.findOne.mockResolvedValue({
      value: { autoSendInvoiceToCustomer: true },
    });
    bridgeService.shouldUseAutomationInsteadOfBuiltIn.mockResolvedValue(true);

    await invoiceController.sendInvoiceToCustomer('tenant-1', invoice, {
      userId: 'user-1',
      deliverySource: 'job_creation_auto_send',
    });

    expect(automationEngineService.runInvoiceSentAutomations).toHaveBeenCalled();
    expect(emailTemplates.invoicePaidConfirmation).not.toHaveBeenCalled();
  });
});

describe('invoiceController recordPayment notes', () => {
  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    updateCustomerBalance.mockResolvedValue(undefined);
  });

  it('persists optional notes on the created payment and returns the payment payload', async () => {
    const invoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      invoiceNumber: 'INV-001',
      customerId: 'customer-1',
      jobId: 'job-1',
      totalAmount: 250,
      amountPaid: 50,
      status: 'sent',
      update: jest.fn().mockResolvedValue(undefined),
    };
    const updatedInvoice = {
      ...invoice,
      amountPaid: 125,
      balance: 125,
      toJSON() {
        return {
          id: this.id,
          tenantId: this.tenantId,
          invoiceNumber: this.invoiceNumber,
          amountPaid: this.amountPaid,
          balance: this.balance,
        };
      },
    };
    const payment = {
      id: 'payment-1',
      paymentNumber: 'PAY-1',
      notes: 'Customer paid at front desk',
      toJSON() {
        return {
          id: this.id,
          paymentNumber: this.paymentNumber,
          notes: this.notes,
        };
      },
    };

    Invoice.findOne
      .mockResolvedValueOnce(invoice)
      .mockResolvedValueOnce(updatedInvoice);
    Payment.create.mockResolvedValue(payment);

    const req = {
      params: { id: 'invoice-1' },
      body: {
        amount: 75,
        paymentMethod: 'cash',
        paymentDate: '2026-05-15',
        notes: 'Customer paid at front desk',
      },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await invoiceController.recordPayment(req, res, next);

    expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 75,
      notes: 'Customer paid at front desk',
      description: 'invoice:invoice-1',
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ id: 'invoice-1' }),
      payment: expect.objectContaining({
        id: 'payment-1',
        notes: 'Customer paid at front desk',
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts comment alias and stores null when no user note is provided', async () => {
    const invoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      invoiceNumber: 'INV-001',
      customerId: 'customer-1',
      jobId: null,
      totalAmount: 100,
      amountPaid: 0,
      status: 'sent',
      update: jest.fn().mockResolvedValue(undefined),
    };
    const updatedInvoice = {
      ...invoice,
      amountPaid: 50,
      balance: 50,
      toJSON() {
        return { id: this.id, tenantId: this.tenantId, invoiceNumber: this.invoiceNumber };
      },
    };

    Invoice.findOne
      .mockResolvedValueOnce(invoice)
      .mockResolvedValueOnce(updatedInvoice);
    Payment.create.mockResolvedValue({ id: 'payment-2', paymentNumber: 'PAY-2', notes: 'MoMo ref 123' });

    const req = {
      params: { id: 'invoice-1' },
      body: {
        amount: 50,
        paymentMethod: 'cash',
        paymentDate: '2026-05-15',
        comment: 'MoMo ref 123',
      },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await invoiceController.recordPayment(req, res, next);

    expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({
      notes: 'MoMo ref 123',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('stores null notes when payment comment fields are omitted', async () => {
    const invoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      invoiceNumber: 'INV-001',
      customerId: 'customer-1',
      jobId: null,
      totalAmount: 100,
      amountPaid: 0,
      status: 'sent',
      update: jest.fn().mockResolvedValue(undefined),
    };
    const updatedInvoice = {
      ...invoice,
      amountPaid: 25,
      balance: 75,
      toJSON() {
        return { id: this.id, tenantId: this.tenantId, invoiceNumber: this.invoiceNumber };
      },
    };

    Invoice.findOne
      .mockResolvedValueOnce(invoice)
      .mockResolvedValueOnce(updatedInvoice);
    Payment.create.mockResolvedValue({ id: 'payment-3', paymentNumber: 'PAY-3', notes: null });

    const req = {
      params: { id: 'invoice-1' },
      body: {
        amount: 25,
        paymentMethod: 'cash',
        paymentDate: '2026-05-15',
      },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await invoiceController.recordPayment(req, res, next);

    expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({
      notes: null,
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

describe('invoiceController markInvoicePaid payment date', () => {
  let errorSpy;
  let setImmediateSpy;

  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    setImmediateSpy = jest.spyOn(global, 'setImmediate').mockImplementation((callback) => {
      if (typeof callback === 'function') callback();
      return 1;
    });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    setImmediateSpy.mockRestore();
  });

  it('persists the selected payment date on invoice, payment, and journal records', async () => {
    const invoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      invoiceNumber: 'INV-001',
      customerId: 'customer-1',
      jobId: 'job-1',
      totalAmount: 250,
      amountPaid: 50,
      status: 'sent',
      update: jest.fn().mockResolvedValue(undefined),
    };
    const updatedInvoice = {
      ...invoice,
      amountPaid: 250,
      balance: 0,
      status: 'paid',
      paidDate: new Date('2026-05-15T00:00:00.000Z'),
      toJSON() {
        return {
          id: this.id,
          tenantId: this.tenantId,
          invoiceNumber: this.invoiceNumber,
          customerId: this.customerId,
          jobId: this.jobId,
          amountPaid: this.amountPaid,
          balance: this.balance,
          status: this.status,
          paidDate: this.paidDate,
        };
      },
    };

    Invoice.findOne
      .mockResolvedValueOnce(invoice)
      .mockResolvedValueOnce(updatedInvoice);
    Payment.create.mockResolvedValue({ id: 'payment-1', paymentNumber: 'PAY-1' });

    const req = {
      params: { id: 'invoice-1' },
      body: { paymentDate: '2026-05-15', notes: 'Paid by bank transfer' },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await invoiceController.markInvoicePaid(req, res, next);

    const expectedDate = new Date('2026-05-15');
    expect(invoice.update).toHaveBeenCalledWith(expect.objectContaining({
      amountPaid: 250,
      balance: 0,
      status: 'paid',
      paidDate: expectedDate,
    }));
    expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 200,
      paymentDate: expectedDate,
      notes: 'Paid by bank transfer',
    }));
    expect(ensureSaleFromPaidInvoice).toHaveBeenCalledWith('invoice-1', 'payment-1', expect.objectContaining({
      tenantId: 'tenant-1',
      userId: 'user-1',
      paymentMethod: 'other',
    }));
    expect(createInvoicePaymentJournal).toHaveBeenCalledWith(expect.objectContaining({
      amount: 200,
      paymentDate: expectedDate,
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        id: 'invoice-1',
        paidDate: expectedDate,
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid payment dates before marking an invoice paid', async () => {
    const req = {
      params: { id: 'invoice-1' },
      body: { paymentDate: 'not-a-date' },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await invoiceController.markInvoicePaid(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Payment date is invalid',
    });
    expect(Invoice.findOne).not.toHaveBeenCalled();
    expect(Payment.create).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('invoiceController cancelled invoice access', () => {
  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Job.findAll.mockResolvedValue([]);
    Sale.findAll.mockResolvedValue([]);
    updateCustomerBalance.mockResolvedValue(undefined);
  });

  it('getInvoice returns a cancelled invoice visible in list scope', async () => {
    const cancelledInvoice = {
      id: 'inv-cancelled',
      tenantId: 'tenant-1',
      status: 'cancelled',
      jobId: null,
      saleId: 'sale-1',
      prescriptionId: null,
      shopId: null,
      job: null,
      sale: { soldBy: 'user-1' },
      shop: null,
      studioLocation: null,
      customer: { id: 'customer-1', name: 'Alex' },
      toJSON() {
        return { id: this.id, status: this.status };
      },
    };

    Invoice.findOne.mockResolvedValue(cancelledInvoice);

    const req = {
      params: { id: 'inv-cancelled' },
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      shopScoped: true,
      shopFilterId: 'shop-a',
      user: { id: 'user-1', role: 'admin' },
      tenantRole: 'admin',
    };
    const res = buildRes();
    const next = jest.fn();

    await invoiceController.getInvoice(req, res, next);

    expect(Invoice.findOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ id: 'inv-cancelled' }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('lets shop-scoped staff view sale-linked invoices from the same shop', async () => {
    const invoice = {
      id: 'inv-sale',
      tenantId: 'tenant-1',
      status: 'sent',
      jobId: null,
      saleId: 'sale-1',
      prescriptionId: null,
      shopId: 'shop-a',
      job: null,
      sale: { soldBy: 'other-staff' },
      shop: null,
      studioLocation: null,
      customer: { id: 'customer-1', name: 'Alex' },
      toJSON() {
        return { id: this.id, saleId: this.saleId, shopId: this.shopId };
      },
    };

    Invoice.findOne.mockResolvedValue(invoice);

    const req = {
      params: { id: 'inv-sale' },
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      shopScoped: true,
      shopFilterId: 'shop-a',
      user: { id: 'staff-1', role: 'admin' },
      tenantRole: 'staff',
    };
    const res = buildRes();
    const next = jest.fn();

    await invoiceController.getInvoice(req, res, next);

    expect(Sale.findAll).not.toHaveBeenCalled();
    expect(Job.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', createdBy: 'staff-1' }),
    }));
    expect(Invoice.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'inv-sale',
        tenantId: 'tenant-1',
        [Op.and]: expect.arrayContaining([
          { [Op.or]: expect.arrayContaining([{ saleId: { [Op.ne]: null } }]) },
        ]),
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('deleteCancelledInvoice removes a cancelled invoice with no payments', async () => {
    const cancelledInvoice = {
      id: 'inv-cancelled',
      tenantId: 'tenant-1',
      status: 'cancelled',
      amountPaid: 0,
      balance: 120,
      customerId: 'customer-1',
      shopId: null,
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    Invoice.findOne.mockResolvedValue(cancelledInvoice);

    const req = {
      params: { id: 'inv-cancelled' },
      tenantId: 'tenant-1',
      shopScoped: true,
      shopFilterId: 'shop-a',
      user: { id: 'user-1', role: 'admin' },
      tenantRole: 'admin',
    };
    const res = buildRes();
    const next = jest.fn();

    await invoiceController.deleteCancelledInvoice(req, res, next);

    expect(cancelledInvoice.destroy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('invoiceController getInvoices list visibility', () => {
  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Job.findAll.mockResolvedValue([]);
    Sale.findAll.mockResolvedValue([]);
    Invoice.count.mockResolvedValue(0);
    Invoice.findAll.mockResolvedValue([]);
  });

  it('applies strict shop filter and sale sourceType for shop tenants', async () => {
    const req = {
      query: { page: '1', limit: '20', shopId: 'shop-a' },
      headers: {},
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      shopScoped: true,
      shopFilterId: 'shop-a',
      user: { id: 'user-1', role: 'admin' },
      tenantRole: 'admin',
    };
    const res = buildRes();
    const next = jest.fn();

    await invoiceController.getInvoices(req, res, next);

    expect(Invoice.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          shopId: 'shop-a',
          [Op.or]: [{ sourceType: 'sale' }, { sourceType: 'quote' }],
        }),
        distinct: true,
        col: 'id',
      })
    );
    expect(Invoice.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          shopId: 'shop-a',
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('getInvoiceStats applies the same strict shop filter as list', async () => {
    const req = {
      query: {},
      headers: {},
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      shopScoped: true,
      shopFilterId: 'shop-a',
      user: { id: 'user-1', role: 'admin' },
      tenantRole: 'admin',
    };
    const res = buildRes();
    const next = jest.fn();

    Invoice.count.mockResolvedValue(3);
    Invoice.sum.mockResolvedValue(100);

    await invoiceController.getInvoiceStats(req, res, next);

    expect(Invoice.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          shopId: 'shop-a',
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('applyInvoicePaymentInternal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks the invoice paid, creates a Payment, and queues payment_received automations', async () => {
    const invoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      invoiceNumber: 'INV-001',
      customerId: 'customer-1',
      jobId: 'job-1',
      totalAmount: 200,
      amountPaid: 0,
      status: 'draft',
      update: jest.fn().mockResolvedValue(undefined),
    };
    const paidInvoice = {
      ...invoice,
      status: 'paid',
      amountPaid: 200,
      balance: 0,
    };
    Invoice.findOne.mockResolvedValue(paidInvoice);
    Payment.findOne.mockResolvedValue(null);
    Payment.create.mockResolvedValue({
      id: 'pay-1',
      paymentNumber: 'PAY-1',
      amount: 200,
    });

    const result = await invoiceController.applyInvoicePaymentInternal({
      tenantId: 'tenant-1',
      userId: 'user-1',
      invoice,
      amount: 200,
      paymentMethod: 'cash',
      paymentDate: '2026-08-17',
    });

    expect(invoice.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'paid',
      amountPaid: 200,
      balance: 0,
    }));
    expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 200,
      type: 'income',
      description: 'invoice:invoice-1',
      paymentMethod: 'cash',
    }));
    expect(result.invoice.status).toBe('paid');

    await jest.runAllTimersAsync();
    expect(automationEngineService.runPaymentReceivedAutomations).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        paymentAmount: 200,
      })
    );
    expect(automationEngineService.runInvoiceSentAutomations).not.toHaveBeenCalled();
  });

  it('records a deposit as a partial payment', async () => {
    const invoice = {
      id: 'invoice-2',
      tenantId: 'tenant-1',
      invoiceNumber: 'INV-002',
      customerId: 'customer-1',
      jobId: 'job-1',
      totalAmount: 200,
      amountPaid: 0,
      status: 'draft',
      update: jest.fn().mockResolvedValue(undefined),
    };
    const partialInvoice = {
      ...invoice,
      status: 'sent',
      amountPaid: 50,
      balance: 150,
    };
    Invoice.findOne.mockResolvedValue(partialInvoice);
    Payment.findOne.mockResolvedValue(null);
    Payment.create.mockResolvedValue({ id: 'pay-2', amount: 50 });

    const result = await invoiceController.applyInvoicePaymentInternal({
      tenantId: 'tenant-1',
      invoice,
      amount: 50,
      paymentMethod: 'mobile_money',
      paymentDate: '2026-08-17',
    });

    expect(invoice.update).toHaveBeenCalledWith(expect.objectContaining({
      amountPaid: 50,
      balance: 150,
    }));
    expect(invoice.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }));
    expect(result.invoice.balance).toBe(150);

    await jest.runAllTimersAsync();
    expect(automationEngineService.runPaymentReceivedAutomations).toHaveBeenCalled();
  });
});
