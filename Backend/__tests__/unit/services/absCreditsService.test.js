jest.mock('../../../services/platformSmsUsageService', () => ({
  getTenantUsageSummary: jest.fn(),
}));

const { getTenantUsageSummary } = require('../../../services/platformSmsUsageService');
const { resolvePlatformSmsBilling } = require('../../../services/absCreditsService');

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

const { sequelize } = require('../../../config/database');

describe('resolvePlatformSmsBilling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses free quota when remaining covers the send', async () => {
    getTenantUsageSummary.mockResolvedValue({
      sentCount: 10,
      monthlyLimit: 100,
      monthlyLimitEnabled: true,
      remaining: 90,
    });
    sequelize.query.mockResolvedValue([[{ balance: 0 }]]);

    const result = await resolvePlatformSmsBilling('tenant-1', 1);
    expect(result.allowed).toBe(true);
    expect(result.billType).toBe('free');
  });

  it('falls back to credits when free quota is exhausted', async () => {
    getTenantUsageSummary.mockResolvedValue({
      sentCount: 100,
      monthlyLimit: 100,
      monthlyLimitEnabled: true,
      remaining: 0,
    });
    sequelize.query.mockResolvedValue([[{ balance: 25 }]]);

    const result = await resolvePlatformSmsBilling('tenant-1', 2);
    expect(result.allowed).toBe(true);
    expect(result.billType).toBe('credits');
  });

  it('rejects when free and credits are both insufficient', async () => {
    getTenantUsageSummary.mockResolvedValue({
      sentCount: 100,
      monthlyLimit: 100,
      monthlyLimitEnabled: true,
      remaining: 0,
    });
    sequelize.query.mockResolvedValue([[{ balance: 0 }]]);

    const result = await resolvePlatformSmsBilling('tenant-1', 1);
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('ABS_CREDITS_INSUFFICIENT');
  });
});
