jest.mock('../../../models', () => ({
  Tenant: { findByPk: jest.fn() },
  Customer: { findByPk: jest.fn() },
}));

jest.mock('../../../services/emailService', () => ({
  getConfig: jest.fn(),
  sendMessage: jest.fn(),
}));

jest.mock('../../../services/smsService', () => ({
  getResolvedConfig: jest.fn(),
  validatePhoneNumber: jest.fn(),
  sendMessage: jest.fn(),
}));

jest.mock('../../../services/whatsappService', () => ({
  getConfig: jest.fn(),
  validatePhoneNumber: jest.fn(),
  sendMessage: jest.fn(),
}));

jest.mock('../../../services/whatsappTemplates', () => ({
  prepareOrderCreated: jest.fn(() => ['Ama', 'ORD-1', 'GHS 10.00', 'Biz']),
}));

jest.mock('../../../services/emailTemplates', () => ({
  orderCreatedEmail: jest.fn(() => ({
    subject: 'Order received',
    html: '<p>hi</p>',
    text: 'hi',
  })),
}));

jest.mock('../../../services/messageDeliveryRulesService', () => ({
  isChannelEnabledForEvent: jest.fn(),
}));

jest.mock('../../../services/smsTemplateService', () => ({
  renderForTenant: jest.fn(),
}));

jest.mock('../../../utils/tenantLogo', () => ({
  getTenantLogoUrl: jest.fn(() => null),
}));

jest.mock('../../../utils/resolveBusinessNameForContext', () => ({
  resolveBusinessNameForContext: jest.fn(),
}));

jest.mock('../../../utils/orderTrackingLink', () => ({
  resolveOrderTrackingLink: jest.fn(),
}));

const { Tenant } = require('../../../models');
const emailService = require('../../../services/emailService');
const smsService = require('../../../services/smsService');
const emailTemplates = require('../../../services/emailTemplates');
const smsTemplateService = require('../../../services/smsTemplateService');
const { isChannelEnabledForEvent } = require('../../../services/messageDeliveryRulesService');
const { resolveBusinessNameForContext } = require('../../../utils/resolveBusinessNameForContext');
const { resolveOrderTrackingLink } = require('../../../utils/orderTrackingLink');
const {
  notifyOrderCreatedForCustomer,
  buildSmsMessageFallback,
} = require('../../../services/orderCustomerNotificationService');

describe('orderCustomerNotificationService', () => {
  const sale = {
    id: 'sale-1',
    saleNumber: 'ORD-42',
    total: 50,
    shopId: 'shop-1',
    customer: {
      id: 'c-1',
      name: 'Ama',
      phone: '+233241234567',
      email: 'ama@example.com',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolveOrderTrackingLink.mockResolvedValue(
      'https://app.example.com/track/kitchen?order=ORD-42'
    );
    resolveBusinessNameForContext.mockResolvedValue({ businessName: 'Kitchen Co' });
    Tenant.findByPk.mockResolvedValue({ id: 't1', name: 'Kitchen Co', metadata: {} });
    isChannelEnabledForEvent.mockImplementation((_t, _e, channel) =>
      Promise.resolve(channel === 'sms' || channel === 'email')
    );
    emailService.getConfig.mockResolvedValue({ enabled: true });
    emailService.sendMessage.mockResolvedValue({ success: true });
    smsService.getResolvedConfig.mockResolvedValue({ enabled: true });
    smsService.validatePhoneNumber.mockReturnValue('+233241234567');
    smsService.sendMessage.mockResolvedValue({ success: true });
    smsTemplateService.renderForTenant.mockResolvedValue(null);
  });

  it('includes tracking link in SMS fallback', () => {
    const body = buildSmsMessageFallback(
      sale,
      'Kitchen Co',
      'https://app.example.com/track/kitchen?order=ORD-42'
    );
    expect(body).toContain('ORD-42');
    expect(body).toContain('Track your order: https://app.example.com/track/kitchen?order=ORD-42');
    expect(body).not.toMatch(/ETA|ready in|minutes/i);
  });

  it('passes resolved tracking link into SMS and email', async () => {
    await notifyOrderCreatedForCustomer({ tenantId: 't1', sale });

    expect(resolveOrderTrackingLink).toHaveBeenCalledWith('t1', { orderNumber: 'ORD-42' });
    expect(emailTemplates.orderCreatedEmail).toHaveBeenCalledWith(
      sale,
      sale.customer,
      expect.objectContaining({ name: 'Kitchen Co' }),
      'https://app.example.com/track/kitchen?order=ORD-42'
    );
    expect(smsService.sendMessage).toHaveBeenCalledWith(
      't1',
      '+233241234567',
      expect.stringContaining('Track your order:')
    );
  });

  it('only skips channels turned off in the delivery rules', async () => {
    isChannelEnabledForEvent.mockImplementation((_t, _e, channel) => Promise.resolve(channel === 'email'));
    const result = await notifyOrderCreatedForCustomer({ tenantId: 't1', sale });
    expect(result.skipped).toBeUndefined();
    expect(emailService.sendMessage).toHaveBeenCalled();
    expect(smsService.sendMessage).not.toHaveBeenCalled();
  });

  describe('notifyOrderStatusChangedForCustomer', () => {
    beforeEach(() => {
      isChannelEnabledForEvent.mockImplementation((_t, eventKey, channel) =>
        Promise.resolve(eventKey === 'order_status' && channel === 'sms')
      );
    });

    it('sends SMS with order number and new status', async () => {
      const { notifyOrderStatusChangedForCustomer } = require('../../../services/orderCustomerNotificationService');
      const result = await notifyOrderStatusChangedForCustomer({
        tenantId: 't1',
        sale,
        newStatus: 'out_for_delivery',
        previousStatus: 'processing',
      });

      expect(result.sent).toBe(true);
      expect(smsService.sendMessage).toHaveBeenCalledWith(
        't1',
        '+233241234567',
        expect.stringMatching(/ORD-42[\s\S]*out for delivery/)
      );
    });

    it('skips when status is unchanged', async () => {
      const { notifyOrderStatusChangedForCustomer } = require('../../../services/orderCustomerNotificationService');
      const result = await notifyOrderStatusChangedForCustomer({
        tenantId: 't1',
        sale,
        newStatus: 'ready',
        previousStatus: 'ready',
      });
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('unchanged_status');
      expect(smsService.sendMessage).not.toHaveBeenCalled();
    });

    it('skips gracefully when phone is missing', async () => {
      const { notifyOrderStatusChangedForCustomer } = require('../../../services/orderCustomerNotificationService');
      const result = await notifyOrderStatusChangedForCustomer({
        tenantId: 't1',
        sale: { ...sale, customer: { ...sale.customer, phone: null } },
        newStatus: 'delivered',
        previousStatus: 'out_for_delivery',
      });
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('missing_phone');
      expect(smsService.sendMessage).not.toHaveBeenCalled();
    });

    it('skips when SMS channel is disabled for order_status', async () => {
      isChannelEnabledForEvent.mockResolvedValue(false);
      const { notifyOrderStatusChangedForCustomer } = require('../../../services/orderCustomerNotificationService');
      const result = await notifyOrderStatusChangedForCustomer({
        tenantId: 't1',
        sale,
        newStatus: 'delivered',
        previousStatus: 'ready',
      });
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('sms_channel_disabled');
      expect(smsService.sendMessage).not.toHaveBeenCalled();
    });
  });
});
