jest.mock('../../../models', () => ({
  Sale: { findOne: jest.fn() },
  SaleItem: {},
  Customer: {},
  Shop: {},
  Tenant: {},
  Setting: { findOne: jest.fn() },
  SaleActivity: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  Product: {},
  Invoice: {},
  User: {},
  Payment: {},
  Barcode: {},
}));

jest.mock('../../../services/messageDeliveryRulesService', () => ({
  isChannelEnabledForEvent: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../../services/smsService', () => ({
  getResolvedConfig: jest.fn().mockResolvedValue({ provider: 'test' }),
  validatePhoneNumber: jest.fn().mockReturnValue('0240000000'),
  sendMessage: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../services/smsTemplateService', () => ({
  renderForTenant: jest.fn().mockResolvedValue('Receipt SMS'),
}));

jest.mock('../../../services/whatsappService', () => ({
  getConfig: jest.fn().mockResolvedValue(null),
  validatePhoneNumber: jest.fn(),
}));

jest.mock('../../../services/emailService', () => ({
  getConfig: jest.fn().mockResolvedValue(null),
  sendMessage: jest.fn(),
}));

const { Sale, Setting, SaleActivity } = require('../../../models');
const messageDeliveryRulesService = require('../../../services/messageDeliveryRulesService');
const smsService = require('../../../services/smsService');
const saleController = require('../../../controllers/saleController');

const mockSettings = ({ prefs = null, posMode = null } = {}) => {
  Setting.findOne.mockImplementation(async ({ where }) => {
    if (where.key === 'customer-notification-preferences') return prefs ? { value: prefs } : null;
    if (where.key === 'pos_config') return posMode ? { value: { receipt: { mode: posMode } } } : null;
    return null;
  });
};

describe('saleController autoSendReceiptIfEnabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSettings();
    SaleActivity.findAll.mockResolvedValue([]);
    SaleActivity.create.mockResolvedValue({});
    messageDeliveryRulesService.isChannelEnabledForEvent.mockResolvedValue(false);
    smsService.sendMessage.mockResolvedValue({ success: true });
    Sale.findOne.mockResolvedValue({
      customer: { phone: '0240000000', email: 'a@b.com' },
    });
  });

  it('sends by default when the workspace never set the receipt preference', async () => {
    await saleController.autoSendReceiptIfEnabled('tenant-1', 'sale-1');

    expect(Sale.findOne).toHaveBeenCalled();
  });

  it('skips when the preference is explicitly off and POS is not in auto_send mode', async () => {
    mockSettings({ prefs: { autoSendReceiptToCustomer: false }, posMode: 'ask' });

    await saleController.autoSendReceiptIfEnabled('tenant-1', 'sale-1');

    expect(Sale.findOne).not.toHaveBeenCalled();
    expect(SaleActivity.create).not.toHaveBeenCalled();
  });

  it('still sends when the preference is off but POS auto_send mode is on', async () => {
    mockSettings({ prefs: { autoSendReceiptToCustomer: false }, posMode: 'auto_send' });

    await saleController.autoSendReceiptIfEnabled('tenant-1', 'sale-1');

    expect(Sale.findOne).toHaveBeenCalled();
  });

  it('sends the SMS receipt and records the channel for dedupe', async () => {
    messageDeliveryRulesService.isChannelEnabledForEvent.mockImplementation(
      async (_tenantId, _eventKey, channel) => channel === 'sms'
    );

    await saleController.autoSendReceiptIfEnabled('tenant-1', 'sale-1');

    expect(smsService.sendMessage).toHaveBeenCalledWith('tenant-1', '0240000000', 'Receipt SMS');
    expect(SaleActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      saleId: 'sale-1',
      type: 'receipt_sent',
      metadata: expect.objectContaining({ channels: ['sms'], source: 'auto_send_receipt' }),
    }));
  });

  it('does not resend a channel already sent within the dedupe window', async () => {
    messageDeliveryRulesService.isChannelEnabledForEvent.mockImplementation(
      async (_tenantId, _eventKey, channel) => channel === 'sms'
    );
    SaleActivity.findAll.mockResolvedValue([{ id: 'act-1', metadata: { channels: ['sms'] } }]);

    await saleController.autoSendReceiptIfEnabled('tenant-1', 'sale-1');

    expect(smsService.sendMessage).not.toHaveBeenCalled();
    expect(SaleActivity.create).not.toHaveBeenCalled();
  });
});
