jest.mock('../../../models', () => ({
  Tenant: {
    findByPk: jest.fn(),
  },
}));

jest.mock('../../../utils/tenantEntitlements', () => ({
  getTenantEffectiveEntitlements: jest.fn(),
}));

const { Tenant } = require('../../../models');
const { getTenantEffectiveEntitlements } = require('../../../utils/tenantEntitlements');
const { requireFeature } = require('../../../middleware/featureAccess');

const runMiddleware = (req, featureKey) =>
  new Promise((resolve, reject) => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((body) =>
        resolve({ status: res.status.mock.calls[0]?.[0], body, nextCalled: false })
      ),
    };
    const next = jest.fn(() => resolve({ nextCalled: true, req }));
    requireFeature(featureKey)(req, res, (err) => (err ? reject(err) : resolve({ nextCalled: true, req })));
  });

describe('requireFeature fast path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTenantEffectiveEntitlements.mockResolvedValue({
      enabledFeatures: ['crm'],
      effectiveFeatureFlags: { crm: true },
    });
    Tenant.findByPk.mockResolvedValue({
      id: 'tenant-1',
      plan: 'starter',
      businessType: 'shop',
    });
  });

  it('allows access when req.enabledFeatures includes the feature without querying tenant', async () => {
    const req = {
      enabledFeatures: ['rentals', 'crm'],
      tenant: { id: 'tenant-1', plan: 'pro', businessType: 'rental' },
    };

    const result = await runMiddleware(req, 'rentals');

    expect(result.nextCalled).toBe(true);
    expect(Tenant.findByPk).not.toHaveBeenCalled();
    expect(getTenantEffectiveEntitlements).not.toHaveBeenCalled();
  });

  it('returns 403 when req.enabledFeatures omits the feature without querying tenant', async () => {
    const req = {
      enabledFeatures: ['crm'],
      tenant: { id: 'tenant-1', plan: 'pro', businessType: 'rental' },
    };

    const result = await runMiddleware(req, 'rentals');

    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(403);
    expect(result.body.featureRequired).toBe('rentals');
    expect(Tenant.findByPk).not.toHaveBeenCalled();
  });

  it('falls back to tenant entitlements when req.enabledFeatures is not set', async () => {
    const req = {
      headers: { 'x-tenant-id': 'tenant-1' },
    };

    const result = await runMiddleware(req, 'crm');

    expect(result.nextCalled).toBe(true);
    expect(Tenant.findByPk).toHaveBeenCalledWith('tenant-1');
    expect(getTenantEffectiveEntitlements).toHaveBeenCalled();
  });
});
