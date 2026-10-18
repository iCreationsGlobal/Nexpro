jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
  },
}));

jest.mock('../../../services/platformSmsUsageService', () => ({
  getCurrentYearMonth: jest.fn(() => '2026-07'),
  getNextResetAt: jest.fn(() => '2026-08-01T00:00:00.000Z'),
  getMonthlyLimit: jest.fn(async () => 100),
}));

jest.mock('../../../services/platformSmsSettingsService', () => ({
  testPlatformSmsConnection: jest.fn(),
}));

const { sequelize } = require('../../../config/database');
const { testPlatformSmsConnection } = require('../../../services/platformSmsSettingsService');
const {
  computeSmsUsageMetrics,
  resolvePeriodBounds,
  sanitizeBalancePayload,
  getMessagingUsage,
} = require('../../../services/adminMessagingUsageService');

describe('adminMessagingUsageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('computeSmsUsageMetrics', () => {
    it('computes remaining and percent used', () => {
      expect(computeSmsUsageMetrics(25, 100)).toEqual({
        sentCount: 25,
        monthlyLimit: 100,
        remaining: 75,
        percentUsed: 25,
      });
    });

    it('clamps remaining at zero when over limit', () => {
      expect(computeSmsUsageMetrics(120, 100)).toEqual({
        sentCount: 120,
        monthlyLimit: 100,
        remaining: 0,
        percentUsed: 100,
      });
    });
  });

  describe('resolvePeriodBounds', () => {
    it('defaults to last 30 days ending at to/now', () => {
      const to = new Date('2026-07-11T12:00:00.000Z');
      const { from, to: toDate } = resolvePeriodBounds({ to: to.toISOString(), defaultDays: 30 });
      expect(toDate.toISOString()).toBe(to.toISOString());
      const expectedFrom = new Date(to);
      expectedFrom.setDate(expectedFrom.getDate() - 30);
      expect(from.toISOString()).toBe(expectedFrom.toISOString());
    });

    it('uses explicit from/to when provided', () => {
      const { from, to } = resolvePeriodBounds({
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T23:59:59.000Z',
      });
      expect(from.toISOString()).toBe('2026-06-01T00:00:00.000Z');
      expect(to.toISOString()).toBe('2026-06-30T23:59:59.000Z');
    });
  });

  describe('sanitizeBalancePayload', () => {
    it('exposes balance fields without secrets', () => {
      expect(sanitizeBalancePayload({
        sms_balance: 42.5,
        main_balance: 100,
        api_key: 'secret',
      })).toEqual({
        smsBalance: 42.5,
        mainBalance: 100,
        currency: null,
        bonus: null,
        raw: { sms_balance: 42.5, main_balance: 100, bonus: null },
      });
    });

    it('returns null for invalid input', () => {
      expect(sanitizeBalancePayload(null)).toBeNull();
      expect(sanitizeBalancePayload('x')).toBeNull();
    });
  });

  describe('getMessagingUsage', () => {
    it('returns yearMonth, period, platformSms and balance only', async () => {
      sequelize.query.mockResolvedValue([[
        { tenantId: 't1', tenantName: 'Shop One', sentCount: 30 },
        { tenantId: 't2', tenantName: null, sentCount: 10 },
      ]]);

      const data = await getMessagingUsage({
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T00:00:00.000Z',
      });

      expect(Object.keys(data).sort()).toEqual(['balance', 'period', 'platformSms', 'yearMonth']);
      expect(data.yearMonth).toBe('2026-07');
      expect(data.period).toEqual({ from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T00:00:00.000Z' });
      expect(data.balance).toBeNull();
      expect(data.platformSms.totals).toEqual({ sentCount: 40, remaining: 160, tenantCount: 2 });
      expect(data.platformSms.byTenant[1]).toEqual(expect.objectContaining({
        tenantName: 'Unknown tenant',
        remaining: 90,
      }));
      expect(sequelize.query).toHaveBeenCalledTimes(1);
      expect(sequelize.query.mock.calls[0][0]).not.toMatch(/automation_runs/);
      expect(testPlatformSmsConnection).not.toHaveBeenCalled();
    });

    it('includes the provider balance when asked', async () => {
      sequelize.query.mockResolvedValue([[]]);
      testPlatformSmsConnection.mockResolvedValue({
        provider: 'arkesel',
        message: 'ok',
        data: { sms_balance: 12 },
      });

      const data = await getMessagingUsage({ yearMonth: '2026-06', includeBalance: 'true' }, { userId: 'admin-1' });

      expect(testPlatformSmsConnection).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-1' }));
      expect(data.balance).toEqual(expect.objectContaining({
        ok: true,
        provider: 'arkesel',
        balance: expect.objectContaining({ smsBalance: 12 }),
      }));
    });

    it('treats a missing usage table as no usage', async () => {
      const missing = new Error('relation "tenant_platform_sms_usage" does not exist');
      missing.parent = { code: '42P01' };
      sequelize.query.mockRejectedValue(missing);

      const data = await getMessagingUsage({});

      expect(data.platformSms.byTenant).toEqual([]);
      expect(data.platformSms.totals.sentCount).toBe(0);
    });
  });
});
