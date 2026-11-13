jest.mock('../../../services/subscriptionBillingService', () => ({
  resolveBillingStatus: jest.fn(),
}));

const { resolveBillingStatus } = require('../../../services/subscriptionBillingService');
const { enforceBillingAccess, isBillingExemptRequest } = require('../../../middleware/billingEnforcement');

const req = (method, baseUrl, path) => ({ method, baseUrl, path, tenantId: 't1', tenant: { id: 't1' }, user: {} });

describe('isBillingExemptRequest', () => {
  it('lets a locked workspace ask for its account to be deleted (App Store 5.1.1(v))', () => {
    expect(isBillingExemptRequest(req('POST', '/api/settings', '/data-deletion-request'))).toBe(true);
  });

  it('keeps the rest of settings locked', () => {
    expect(isBillingExemptRequest(req('PATCH', '/api/settings', '/interface-mode'))).toBe(false);
    expect(isBillingExemptRequest(req('GET', '/api/settings', '/data-deletion-request'))).toBe(false);
  });

  it('keeps sign-in, billing and profile open', () => {
    expect(isBillingExemptRequest(req('POST', '/api/auth', '/apple'))).toBe(true);
    expect(isBillingExemptRequest(req('GET', '/api/subscription', '/payments'))).toBe(true);
    expect(isBillingExemptRequest(req('PUT', '/api/settings', '/profile'))).toBe(true);
  });
});

describe('enforceBillingAccess', () => {
  it('blocks a locked workspace with SUBSCRIPTION_LOCKED', async () => {
    resolveBillingStatus.mockResolvedValue({ canAccessApp: false, billingStatus: 'locked' });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), locals: {} };
    const next = jest.fn();
    await enforceBillingAccess(req('GET', '/api/sales', '/'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].errorCode).toBe('SUBSCRIPTION_LOCKED');
  });

  it('lets the deletion request through while locked', async () => {
    resolveBillingStatus.mockResolvedValue({ canAccessApp: false, billingStatus: 'locked' });
    const next = jest.fn();
    await enforceBillingAccess(req('POST', '/api/settings', '/data-deletion-request'), {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});
