const crypto = require('crypto');

const SECRET = 'sk_test_webhook_secret';

jest.mock('../../../models', () => ({ Customer: {}, Tenant: {}, SabitoTenantMapping: {} }));
jest.mock('../../../middleware/webhookAuth', () => ({ verifySabitoWebhook: jest.fn() }));
jest.mock('../../../services/whatsappService', () => ({}));
jest.mock('../../../services/paystackService', () => {
  const nodeCrypto = require('crypto');
  return {
    secretKey: 'sk_test_webhook_secret',
    verifyWebhookSignature: (signature, body) =>
      nodeCrypto.createHmac('sha512', 'sk_test_webhook_secret').update(body).digest('hex') === signature,
    verifyTransaction: jest.fn(),
  };
});
jest.mock('../../../services/marketplacePayoutService', () => ({
  handlePaystackTransferWebhook: jest.fn().mockResolvedValue({ handled: false }),
}));
jest.mock('../../../services/paystackPublicInvoicePayment', () => ({
  applyPaystackChargeToInvoiceFromTx: jest.fn(),
  getPaystackInvoiceLinkMetadata: jest.fn(() => ({})),
  parseInvoiceIdFromPublicPaystackReference: jest.fn(),
}));
jest.mock('../../../controllers/subscriptionController', () => ({ applySubscriptionFromTransaction: jest.fn() }));
jest.mock('../../../controllers/absCreditsController', () => ({ applyCreditsFromTransaction: jest.fn() }));

const { handlePaystackTransferWebhook } = require('../../../services/marketplacePayoutService');
const { handlePaystackWebhook } = require('../../../controllers/webhookController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  return res;
};

const sign = (raw) => crypto.createHmac('sha512', SECRET).update(raw).digest('hex');

const transferFailed = { event: 'transfer.failed', data: { reference: 'mp_abc', reason: 'forged' } };

describe('handlePaystackWebhook signature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unsigned events, so a payout cannot be pushed back into the payout queue', async () => {
    const res = makeRes();
    await handlePaystackWebhook({ headers: {}, body: transferFailed }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(handlePaystackTransferWebhook).not.toHaveBeenCalled();
  });

  it('rejects events with a wrong signature', async () => {
    const raw = JSON.stringify(transferFailed);
    const res = makeRes();
    await handlePaystackWebhook(
      { headers: { 'x-paystack-signature': sign('something else') }, body: transferFailed, rawBody: Buffer.from(raw) },
      res
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(handlePaystackTransferWebhook).not.toHaveBeenCalled();
  });

  it('verifies against the exact bytes Paystack sent', async () => {
    // Formatting differs from JSON.stringify(req.body), so only the raw bytes match the signature
    const raw = JSON.stringify(transferFailed, null, 2);
    const res = makeRes();
    await handlePaystackWebhook(
      { headers: { 'x-paystack-signature': sign(raw) }, body: transferFailed, rawBody: Buffer.from(raw) },
      res
    );

    expect(handlePaystackTransferWebhook).toHaveBeenCalledWith('transfer.failed', transferFailed.data);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
