jest.mock('../../../models', () => ({
  SubscriptionPlan: { findOne: jest.fn().mockResolvedValue(null) },
  SubscriptionPayment: { findOne: jest.fn().mockResolvedValue(null), create: jest.fn() },
  Setting: { findOne: jest.fn().mockResolvedValue(null), findOrCreate: jest.fn() },
  TenantAccessAudit: { create: jest.fn() },
  Tenant: {
    scope: jest.fn(),
    findByPk: jest.fn(),
  },
}));

const {
  resolveBillingStatus,
  normalizePlan,
  normalizePaymentStatus,
  addPeriod,
  DEFAULT_GRACE_DAYS,
  recordSubscriptionPaymentAndActivate,
  resetTenantTrial,
} = require('../../../services/subscriptionBillingService');

const { Tenant, Setting, SubscriptionPlan, SubscriptionPayment, TenantAccessAudit } = require('../../../models');

const baseTenant = (overrides = {}) => ({
  id: 'tenant-1',
  plan: 'trial',
  status: 'active',
  trialEndsAt: new Date('2030-01-15'),
  metadata: { entitlements: {} },
  update: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('subscriptionBillingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Tenant.scope.mockImplementation(() => ({
      findByPk: Tenant.findByPk,
    }));
  });

  describe('normalizePlan', () => {
    it('lowercases plan ids', () => {
      expect(normalizePlan(' Starter ')).toBe('starter');
    });
  });

  describe('normalizePaymentStatus', () => {
    it('allows supported manual payment statuses', () => {
      expect(normalizePaymentStatus(' Pending ')).toBe('pending');
      expect(normalizePaymentStatus('refunded')).toBe('refunded');
    });

    it('defaults unsupported statuses to success for backwards compatibility', () => {
      expect(normalizePaymentStatus('unknown')).toBe('success');
    });
  });

  describe('addPeriod', () => {
    it('adds one month for monthly billing', () => {
      const start = new Date('2026-01-01');
      const end = addPeriod(start, 'monthly');
      expect(end.getMonth()).toBe(1);
    });
  });

  describe('resolveBillingStatus', () => {
    it('returns trialing when trial has not ended', async () => {
      const billing = await resolveBillingStatus(baseTenant(), {
        at: new Date('2026-01-01'),
        subscriptionSetting: {},
      });
      expect(billing.billingStatus).toBe('trialing');
      expect(billing.canAccessApp).toBe(true);
    });

    it('returns trialing with access when trial plan has no trialEndsAt', async () => {
      const billing = await resolveBillingStatus(
        baseTenant({ trialEndsAt: null }),
        { at: new Date('2026-01-01'), subscriptionSetting: {} }
      );
      expect(billing.billingStatus).toBe('trialing');
      expect(billing.canAccessApp).toBe(true);
      expect(billing.plan).toBe('trial');
    });

    it('returns manual_override when billingOverride is unlocked', async () => {
      const billing = await resolveBillingStatus(
        baseTenant({
          trialEndsAt: new Date('2020-01-01'),
          metadata: { entitlements: { billingOverride: 'unlocked' } },
        }),
        { at: new Date('2026-01-01'), subscriptionSetting: {} }
      );
      expect(billing.billingStatus).toBe('manual_override');
      expect(billing.canAccessApp).toBe(true);
    });

    it('keeps enterprise active without ledger payment', async () => {
      const billing = await resolveBillingStatus(
        baseTenant({
          plan: 'enterprise',
          trialEndsAt: new Date('2020-01-01'),
        }),
        { at: new Date('2026-01-01'), subscriptionSetting: {} }
      );
      expect(billing.billingStatus).toBe('active');
      expect(billing.canAccessApp).toBe(true);
      expect(billing.plan).toBe('enterprise');
    });

    it('locks enterprise when billingOverride is locked', async () => {
      const billing = await resolveBillingStatus(
        baseTenant({
          plan: 'enterprise',
          metadata: { entitlements: { billingOverride: 'locked' } },
        }),
        { at: new Date('2026-01-01'), subscriptionSetting: {} }
      );
      expect(billing.billingStatus).toBe('locked');
      expect(billing.canAccessApp).toBe(false);
      expect(billing.lockReason).toBe('platform_locked');
    });

    it('returns locked after trial and grace', async () => {
      const trialEndsAt = new Date('2026-01-01');
      const at = new Date(trialEndsAt);
      at.setDate(at.getDate() + DEFAULT_GRACE_DAYS + 1);
      const billing = await resolveBillingStatus(baseTenant({ trialEndsAt }), {
        at,
        subscriptionSetting: {},
      });
      expect(billing.billingStatus).toBe('locked');
      expect(billing.canAccessApp).toBe(false);
      expect(billing.lockReason).toBe('trial_expired');
    });

    it('returns unknown when tenant object has no id (avoids undefined tenantId queries)', async () => {
      Setting.findOne.mockClear();
      SubscriptionPayment.findOne.mockClear();

      const billing = await resolveBillingStatus({
        plan: 'trial',
        trialEndsAt: new Date('2030-01-01'),
        status: 'active',
        metadata: {},
      });

      expect(billing.billingStatus).toBe('unknown');
      expect(billing.lockReason).toBe('tenant_not_found');
      expect(Setting.findOne).not.toHaveBeenCalled();
      expect(SubscriptionPayment.findOne).not.toHaveBeenCalled();
    });
  });

  describe('recordSubscriptionPaymentAndActivate', () => {
    it('records pending payments without activating tenant billing', async () => {
      const payment = {
        id: 'payment-1',
        tenantId: 'tenant-1',
        plan: 'enterprise',
        billingPeriod: 'yearly',
        amount: 2000000,
        status: 'pending',
      };
      SubscriptionPayment.findOne.mockResolvedValue(null);
      SubscriptionPayment.create.mockResolvedValue(payment);

      const result = await recordSubscriptionPaymentAndActivate({
        tenantId: 'tenant-1',
        plan: 'enterprise',
        billingPeriod: 'yearly',
        amount: 2000000,
        status: 'pending',
        provider: 'manual',
        providerReference: 'INV-100',
      });

      expect(result).toEqual({ payment, alreadyRecorded: false });
      expect(SubscriptionPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          providerReference: 'INV-100',
        })
      );
      expect(Setting.findOrCreate).not.toHaveBeenCalled();
    });
  });

  describe('resetTenantTrial', () => {
    const at = new Date('2026-06-15T12:00:00.000Z');

    beforeEach(() => {
      Setting.findOne.mockResolvedValue(null);
      SubscriptionPayment.findOne.mockResolvedValue(null);
      TenantAccessAudit.create.mockResolvedValue({});
      Setting.findOrCreate.mockResolvedValue([
        {
          value: { plan: 'trial', status: 'trialing' },
          update: jest.fn().mockResolvedValue(undefined),
        },
      ]);
    });

    it('resets expired trial to now + 1 month and audits the change', async () => {
      const tenant = baseTenant({
        trialEndsAt: new Date('2026-01-01'),
        metadata: { entitlements: { accessState: 'restricted' } },
      });
      Tenant.findByPk
        .mockResolvedValueOnce(tenant)
        .mockResolvedValueOnce({
          ...tenant,
          plan: 'trial',
          trialEndsAt: new Date('2026-07-15T12:00:00.000Z'),
          metadata: { entitlements: { accessState: 'active' } },
        });

      const result = await resetTenantTrial(tenant.id, {
        actorUserId: 'admin-1',
        reason: 'Support courtesy',
        at,
      });

      expect(tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: 'trial',
          trialEndsAt: new Date('2026-07-15T12:00:00.000Z'),
          status: 'active',
          metadata: expect.objectContaining({
            lastTrialResetBy: 'admin-1',
            entitlements: expect.objectContaining({ accessState: 'active' }),
          }),
        })
      );
      expect(TenantAccessAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tenant.id,
          actorUserId: 'admin-1',
          action: 'tenant_trial_reset',
          reason: 'Support courtesy',
        })
      );
      expect(result.plan).toBe('trial');
      expect(result.billing.billingStatus).toBe('trialing');
      expect(result.billing.canAccessApp).toBe(true);
    });

    it('resets to the trial length set on the Trial plan', async () => {
      SubscriptionPlan.findOne.mockResolvedValueOnce({ metadata: { trialMonths: 3 } });
      const tenant = baseTenant({ trialEndsAt: new Date('2026-01-01') });
      Tenant.findByPk.mockResolvedValueOnce(tenant).mockResolvedValueOnce(tenant);

      const result = await resetTenantTrial(tenant.id, { actorUserId: 'admin-1', at });

      expect(result.trialEndsAt).toEqual(new Date('2026-09-15T12:00:00.000Z'));
      expect(tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'trial', trialEndsAt: new Date('2026-09-15T12:00:00.000Z') })
      );
      expect(TenantAccessAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Granted another free trial' })
      );
    });

    it('blocks reset when tenant has an active paid subscription', async () => {
      const tenant = baseTenant({
        plan: 'starter',
        trialEndsAt: new Date('2020-01-01'),
      });
      Tenant.findByPk.mockResolvedValue(tenant);
      SubscriptionPayment.findOne.mockResolvedValue({
        id: 'pay-1',
        plan: 'starter',
        periodStart: new Date('2026-06-01'),
        periodEnd: new Date('2026-07-01'),
      });

      await expect(
        resetTenantTrial(tenant.id, { actorUserId: 'admin-1', at })
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'ACTIVE_PAID_SUBSCRIPTION',
      });
      expect(tenant.update).not.toHaveBeenCalled();
      expect(TenantAccessAudit.create).not.toHaveBeenCalled();
    });

    it('blocks reset for active enterprise tenants', async () => {
      const tenant = baseTenant({
        plan: 'enterprise',
        trialEndsAt: new Date('2020-01-01'),
      });
      Tenant.findByPk.mockResolvedValue(tenant);

      await expect(
        resetTenantTrial(tenant.id, { actorUserId: 'admin-1', at })
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'ACTIVE_PAID_SUBSCRIPTION',
      });
      expect(tenant.update).not.toHaveBeenCalled();
    });

    it('returns 404 when tenant is missing', async () => {
      Tenant.findByPk.mockResolvedValue(null);

      await expect(resetTenantTrial('missing', { at })).rejects.toMatchObject({
        statusCode: 404,
        errorCode: 'TENANT_NOT_FOUND',
      });
    });
  });
});
