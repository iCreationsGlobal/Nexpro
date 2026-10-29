jest.mock('../../../models', () => ({
  SubscriptionPlan: { findOne: jest.fn() },
}));

const dayjs = require('dayjs');
const { SubscriptionPlan } = require('../../../models');
const {
  isMobileSignupClient,
  resolveSignupPlanAssignment,
  buildSignupSubscriptionSettingValue,
} = require('../../../utils/signupPlanAssignment');

describe('signupPlanAssignment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SubscriptionPlan.findOne.mockResolvedValue(null);
  });

  describe('isMobileSignupClient', () => {
    it('detects X-Client: mobile', () => {
      expect(isMobileSignupClient({ headers: { 'x-client': 'mobile' }, body: {} })).toBe(true);
    });

    it('detects X-App: abs-mobile', () => {
      expect(isMobileSignupClient({ headers: { 'x-app': 'abs-mobile' }, body: {} })).toBe(true);
    });

    it('detects body.client mobile flag', () => {
      expect(isMobileSignupClient({ headers: {}, body: { client: 'mobile' } })).toBe(true);
    });

    it('does not treat web / missing headers as mobile', () => {
      expect(isMobileSignupClient({ headers: { 'user-agent': 'Mozilla' }, body: {} })).toBe(false);
      expect(isMobileSignupClient({ headers: {}, body: {} })).toBe(false);
      expect(isMobileSignupClient(null)).toBe(false);
    });
  });

  describe('resolveSignupPlanAssignment', () => {
    const at = new Date('2026-06-15T12:00:00.000Z');

    it('puts a web signup on the trial', async () => {
      const assignment = await resolveSignupPlanAssignment({ req: { headers: {}, body: {} }, at });
      expect(assignment).toMatchObject({
        channel: 'web',
        planId: 'trial',
        subscriptionStatus: 'trialing',
        metadataExtras: { signupChannel: 'web' },
      });
      expect(dayjs(assignment.trialEndsAt).diff(at, 'month')).toBe(1);
    });

    it('puts an app signup on the trial too, and records that it came from the app', async () => {
      const assignment = await resolveSignupPlanAssignment({
        req: { headers: { 'x-client': 'mobile' }, body: {} },
        at,
      });
      expect(assignment).toMatchObject({
        channel: 'mobile',
        planId: 'trial',
        subscriptionStatus: 'trialing',
        metadataExtras: { signupChannel: 'mobile' },
      });
      expect(dayjs(assignment.trialEndsAt).diff(at, 'month')).toBe(1);
    });

    it('uses the trial length the admin set on the Trial plan', async () => {
      SubscriptionPlan.findOne.mockResolvedValue({ metadata: { trialMonths: 3 } });
      const assignment = await resolveSignupPlanAssignment({
        req: { headers: { 'x-client': 'mobile' }, body: {} },
        at,
      });
      expect(dayjs(assignment.trialEndsAt).diff(at, 'month')).toBe(3);
      expect(SubscriptionPlan.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { planId: 'trial' } })
      );
    });

    it('ignores a plan the client asks for', async () => {
      const assignment = await resolveSignupPlanAssignment({
        req: { headers: {}, body: { plan: 'enterprise' } },
        at,
      });
      expect(assignment.planId).toBe('trial');
    });
  });

  describe('buildSignupSubscriptionSettingValue', () => {
    it('stores the trial as trialing', () => {
      const trialEndsAt = new Date('2026-07-15T12:00:00.000Z');
      const value = buildSignupSubscriptionSettingValue({
        channel: 'mobile',
        planId: 'trial',
        subscriptionStatus: 'trialing',
        trialEndsAt,
      });
      expect(value).toEqual({
        plan: 'trial',
        status: 'trialing',
        trialEndsAt,
        paymentMethod: null,
        seats: 1,
      });
    });
  });
});
