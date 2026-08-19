jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    col: jest.fn((name) => ({ col: name })),
    where: jest.fn((...args) => ({ where: args })),
    literal: jest.fn((value) => ({ literal: value })),
  },
}));

jest.mock('../../../models', () => ({
  Tenant: { findByPk: jest.fn(), findAll: jest.fn(), count: jest.fn() },
  User: {},
  UserTenant: {},
  Notification: {},
  Vendor: {},
  Job: {},
  InviteToken: {},
  SubscriptionPlan: { findOne: jest.fn(), create: jest.fn() },
  SubscriptionPayment: { findAll: jest.fn() },
  TenantAccessAudit: { create: jest.fn() },
  Setting: { findOrCreate: jest.fn() },
}));

jest.mock('../../../services/subscriptionBillingService', () => ({
  resolveBillingStatus: jest.fn().mockResolvedValue({ status: 'active' }),
  recordSubscriptionPaymentAndActivate: jest.fn(),
  toBillingPayload: jest.fn((status) => status),
  normalizePlan: jest.fn((plan) => plan),
  normalizeBillingPeriod: jest.fn((period) => period),
  normalizePaymentStatus: jest.fn((status) => status || 'success'),
  PAID_PLANS: ['starter', 'professional', 'enterprise'],
}));

jest.mock('../../../services/emailService', () => ({}));
jest.mock('../../../services/emailTemplates', () => ({
  inviteTenantEmail: jest.fn(),
}));
jest.mock('../../../utils/frontendUrl', () => ({
  getFrontendBaseUrl: jest.fn(() => 'https://app.example.com'),
}));
jest.mock('../../../utils/deleteTenantData', () => ({
  PLATFORM_TENANT_SLUG: 'platform',
  deleteTenantData: jest.fn(),
  deleteOrphanUsersWithoutTenants: jest.fn(),
}));
jest.mock('../../../services/permanentDeleteTenantService', () => ({
  permanentlyDeleteTenant: jest.fn(),
}));
jest.mock('../../../config/enterpriseTiers', () => ({
  ENTERPRISE_TIER_IDS: ['business', 'corporate'],
  getEnterpriseTier: jest.fn(),
}));
jest.mock('../../../services/subscriptionPlanCatalogService', () => ({
  buildEnterprisePaymentMetadata: jest.fn(),
}));
jest.mock('../../../utils/seatLimitHelper', () => ({
  getSeatUsageSummary: jest.fn(),
}));
jest.mock('../../../utils/storageLimitHelper', () => ({
  getStorageUsageSummary: jest.fn(),
}));

const { Tenant, SubscriptionPayment, SubscriptionPlan, TenantAccessAudit } = require('../../../models');
const adminController = require('../../../controllers/adminController');

const createResponse = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

const createTenant = (metadata = {}) => ({
  id: 'tenant-1',
  plan: 'trial',
  status: 'active',
  metadata,
  save: jest.fn().mockResolvedValue(undefined),
  changed: jest.fn(),
});

describe('adminController.updateTenantAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SubscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-trial',
      planId: 'trial',
      name: 'Trial',
      marketing: { featureFlags: {} },
      seatLimit: 5,
      storageLimitMB: 1024,
    });
    TenantAccessAudit.create.mockResolvedValue({});
  });

  it('persists true and false feature overrides and removes missing keys', async () => {
    const tenant = createTenant({
      entitlements: {
        featureOverrides: {
          reports: true,
          automations: true,
        },
      },
    });
    Tenant.findByPk.mockResolvedValueOnce(tenant).mockResolvedValueOnce(tenant);

    const req = {
      params: { id: tenant.id },
      user: { id: 'admin-1' },
      body: {
        featureOverrides: {
          automations: false,
          apiAccess: true,
        },
      },
    };
    const res = createResponse();
    const next = jest.fn();

    await adminController.updateTenantAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(tenant.metadata.entitlements.featureOverrides).toEqual({
      automations: false,
      apiAccess: true,
    });
    expect(tenant.changed).toHaveBeenCalledWith('metadata', true);
    expect(tenant.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.metadata.entitlements.featureOverrides).toEqual({
      automations: false,
      apiAccess: true,
    });
  });

  it('clears all feature overrides when payload is null', async () => {
    const tenant = createTenant({
      entitlements: {
        featureOverrides: {
          reports: false,
          apiAccess: true,
        },
      },
    });
    Tenant.findByPk.mockResolvedValueOnce(tenant).mockResolvedValueOnce(tenant);

    const req = {
      params: { id: tenant.id },
      user: { id: 'admin-1' },
      body: { featureOverrides: null },
    };
    const res = createResponse();
    const next = jest.fn();

    await adminController.updateTenantAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(tenant.metadata.entitlements.featureOverrides).toEqual({});
    expect(tenant.changed).toHaveBeenCalledWith('metadata', true);
    expect(tenant.save).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].data.accessControl.featureOverrides).toEqual({});
  });
});

describe('adminController.getBillingSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('separates Enterprise license payments from estimated MRR', async () => {
    const now = new Date('2026-06-06T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    Tenant.findAll
      .mockResolvedValueOnce([
        { plan: 'starter', count: '2' },
        { plan: 'enterprise', count: '1' },
      ])
      .mockResolvedValueOnce([{ id: 'enterprise-tenant-1' }])
      .mockResolvedValueOnce([]);
    Tenant.count.mockResolvedValue(3);
    SubscriptionPayment.findAll.mockResolvedValue([
      {
        tenantId: 'enterprise-tenant-1',
        plan: 'enterprise',
        amount: 2400000,
        billingPeriod: 'yearly',
        periodStart: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2027-01-01T00:00:00.000Z'),
        metadata: { paymentType: 'enterprise_license' },
      },
      {
        tenantId: 'enterprise-tenant-1',
        plan: 'enterprise',
        amount: 120000,
        billingPeriod: 'monthly',
        periodStart: new Date('2026-06-01T00:00:00.000Z'),
        periodEnd: new Date('2026-07-01T00:00:00.000Z'),
        metadata: { paymentType: 'enterprise_cloud_renewal' },
      },
    ]);

    const res = createResponse();
    const next = jest.fn();

    await adminController.getBillingSummary({}, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(SubscriptionPayment.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plan: 'enterprise',
          status: 'success',
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0].data;
    expect(data.estimatedMRR).toBe(1458);
    expect(data.oneTimeRevenue).toBe(24000);
    expect(data.recordedRevenue).toBe(25200);
    expect(data.planBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ plan: 'starter', count: 2, mrr: 258 }),
        expect.objectContaining({
          plan: 'enterprise',
          count: 1,
          mrr: 1200,
          recordedRevenue: 25200,
          oneTimeRevenue: 24000,
          recurringRevenue: 1200,
        }),
      ])
    );

    jest.useRealTimers();
  });

  it('keeps fallback Enterprise license payments out of estimated MRR', async () => {
    const now = new Date('2028-06-06T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    Tenant.findAll
      .mockResolvedValueOnce([{ plan: 'enterprise', count: '1' }])
      .mockResolvedValueOnce([{ id: 'enterprise-tenant-1' }])
      .mockResolvedValueOnce([]);
    Tenant.count.mockResolvedValue(0);
    SubscriptionPayment.findAll.mockResolvedValue([
      {
        tenantId: 'enterprise-tenant-1',
        plan: 'enterprise',
        amount: 2400000,
        billingPeriod: 'yearly',
        periodStart: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2027-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        metadata: { paymentType: 'enterprise_license' },
      },
    ]);

    const res = createResponse();
    const next = jest.fn();

    await adminController.getBillingSummary({}, res, next);

    const data = res.json.mock.calls[0][0].data;
    expect(data.estimatedMRR).toBe(0);
    expect(data.oneTimeRevenue).toBe(24000);
    expect(data.planBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          plan: 'enterprise',
          count: 1,
          mrr: 0,
          recordedRevenue: 24000,
          oneTimeRevenue: 24000,
        }),
      ])
    );

    jest.useRealTimers();
  });

  it('excludes trial and free tenants from paying totals', async () => {
    Tenant.findAll
      .mockResolvedValueOnce([{ plan: 'free', count: '4' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    Tenant.count.mockResolvedValue(4);
    SubscriptionPayment.findAll.mockResolvedValue([]);

    const res = createResponse();
    const next = jest.fn();

    await adminController.getBillingSummary({}, res, next);

    const data = res.json.mock.calls[0][0].data;
    expect(data.estimatedMRR).toBe(0);
    expect(data.payingTenants).toBe(0);
    expect(data.planBreakdown).toEqual([]);
  });
});
