const crypto = require('crypto');

jest.mock('../../../models', () => ({ Customer: {}, Tenant: {}, SabitoTenantMapping: {} }));
jest.mock('../../../middleware/webhookAuth', () => ({ verifySabitoWebhook: jest.fn() }));
jest.mock('../../../services/paystackService', () => ({}));
jest.mock('../../../services/marketplacePayoutService', () => ({ handlePaystackTransferWebhook: jest.fn() }));
jest.mock('../../../services/paystackPublicInvoicePayment', () => ({}));
jest.mock('../../../controllers/subscriptionController', () => ({}));
jest.mock('../../../controllers/absCreditsController', () => ({}));
jest.mock('../../../services/whatsappAssistant', () => ({ receive: jest.fn(async () => {}) }));
jest.mock('../../../services/whatsappService', () => ({
  verifyWebhookSignature: ((signature, payload, secret) => signature === `sha256=${require('crypto').createHmac('sha256', secret).update(payload).digest('hex')}`),
  handleWebhook: jest.fn((body) => body.results),
  findTenantIdByPhoneNumberId: jest.fn(async () => 't1'),
  recordEvent: jest.fn(),
}));

const whatsappService = require('../../../services/whatsappService');
const { receive } = require('../../../services/whatsappAssistant');
const { handleWhatsAppWebhook } = require('../../../controllers/webhookController');

const originalEnv = process.env;
const message = (phoneNumberId) => ({ type: 'message', phoneNumberId, messageId: 'm1', from: '233244000001', messageType: 'text', text: 'How much did I sell?', payload: { text: { body: 'How much did I sell?' } } });
const status = (phoneNumberId) => ({ type: 'status', phoneNumberId, messageId: 'm0', status: 'read', recipientId: '233244000001' });

async function post(results, { sign = 'secret' } = {}) {
  const rawBody = Buffer.from(JSON.stringify({ results }));
  const res = { status: jest.fn(() => res), json: jest.fn(() => res), send: jest.fn(() => res) };
  await handleWhatsAppWebhook({
    method: 'POST',
    query: {},
    headers: sign ? { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', sign).update(rawBody).digest('hex')}` } : {},
    rawBody,
    body: JSON.parse(rawBody),
  }, res);
  return res.status.mock.calls[0][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  process.env = { ...originalEnv, WHATSAPP_APP_SECRET: 'secret', ABS_WHATSAPP_ASSISTANT: 'true', ABS_WHATSAPP_NUMBER: '233500000000', WHATSAPP_PHONE_NUMBER_ID: '999', WHATSAPP_ACCESS_TOKEN: 'tok' };
});
afterAll(() => { process.env = originalEnv; });

describe('WhatsApp messages from Meta', () => {
  it.each([['not signed', null], ['signed with something else', 'guess']])('are refused when %s', async (_, sign) => {
    expect(await post([message('999')], { sign })).toBe(401);
    expect(receive).not.toHaveBeenCalled();
    expect(whatsappService.recordEvent).not.toHaveBeenCalled();
  });

  it('to ABS\'s own number are answered, and the words are not logged', async () => {
    expect(await post([message('999'), status('999')])).toBe(200);
    expect(receive).toHaveBeenCalledWith([message('999')]);
    expect(whatsappService.recordEvent).toHaveBeenCalledTimes(1);
    expect(whatsappService.recordEvent.mock.calls[0][0].eventType).toBe('status');
  });

  it('do not make Meta wait for the answer', async () => {
    receive.mockReturnValueOnce(new Promise(() => {}));
    expect(await post([message('999')])).toBe(200);
  });

  it('to a business\'s own number are kept as before', async () => {
    expect(await post([message('555')])).toBe(200);
    expect(receive).not.toHaveBeenCalled();
    expect(whatsappService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', direction: 'inbound', phoneNumberId: '555' }));
  });

  it('are never answered while it is switched off', async () => {
    process.env.ABS_WHATSAPP_ASSISTANT = '';
    expect(await post([message('999')])).toBe(200);
    expect(receive).not.toHaveBeenCalled();
  });

  it('are never answered without the secret, as they can\'t be checked', async () => {
    process.env.WHATSAPP_APP_SECRET = '';
    expect(await post([message('999')], { sign: null })).toBe(200);
    expect(receive).not.toHaveBeenCalled();
  });
});
