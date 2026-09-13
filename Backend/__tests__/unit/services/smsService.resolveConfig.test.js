jest.mock('../../../models', () => ({
  Setting: {
    findOne: jest.fn(),
  },
}));

jest.mock('../../../services/platformSmsSettingsService', () => ({
  getSavedPlatformSmsConfig: jest.fn(),
}));

jest.mock('../../../services/platformSmsUsageService', () => ({
  checkPlatformSmsLimit: jest.fn(),
  incrementPlatformSmsUsage: jest.fn(),
}));

jest.mock('../../../services/absCreditsService', () => ({
  resolvePlatformSmsBilling: jest.fn(),
  debitForSend: jest.fn(),
}));

const { Setting } = require('../../../models');
const { getSavedPlatformSmsConfig } = require('../../../services/platformSmsSettingsService');
const { incrementPlatformSmsUsage } = require('../../../services/platformSmsUsageService');
const {
  resolvePlatformSmsBilling,
  debitForSend,
} = require('../../../services/absCreditsService');
const smsService = require('../../../services/smsService');
const axios = require('axios');

jest.mock('axios');

describe('smsService config resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSavedPlatformSmsConfig.mockResolvedValue(null);
    resolvePlatformSmsBilling.mockResolvedValue({
      allowed: true,
      billType: 'free',
      freeSummary: {},
      creditsBalance: 0,
    });
    incrementPlatformSmsUsage.mockResolvedValue(1);
    debitForSend.mockResolvedValue({ balance: 0 });
  });

  it('prefers tenant SMS when enabled with valid credentials', async () => {
    Setting.findOne.mockResolvedValue({
      value: {
        enabled: true,
        provider: 'termii',
        apiKey: 'tenant-key',
        senderId: 'SHOP01',
      },
    });

    const config = await smsService.getResolvedConfig('tenant-1');

    expect(config.source).toBe('tenant');
    expect(config.limited).toBe(false);
    expect(getSavedPlatformSmsConfig).not.toHaveBeenCalled();
  });

  it('falls back to platform SMS when tenant SMS is not configured', async () => {
    Setting.findOne.mockResolvedValue({ value: { enabled: false } });
    getSavedPlatformSmsConfig.mockResolvedValue({
      enabled: true,
      provider: 'arkesel',
      apiKey: 'platform-key',
      senderId: 'ABS',
      source: 'platform',
      limited: true,
      monthlyLimit: 100,
    });

    const config = await smsService.getResolvedConfig('tenant-1');

    expect(config.source).toBe('platform');
    expect(config.limited).toBe(true);
    expect(config.senderId).toBe('ABS');
  });

  it('returns ABS_CREDITS_INSUFFICIENT when free quota and credits are exhausted', async () => {
    Setting.findOne.mockResolvedValue({ value: { enabled: false } });
    getSavedPlatformSmsConfig.mockResolvedValue({
      enabled: true,
      provider: 'arkesel',
      apiKey: 'platform-key',
      senderId: 'ABS',
      source: 'platform',
      limited: true,
    });
    resolvePlatformSmsBilling.mockResolvedValue({
      allowed: false,
      billType: null,
      errorCode: 'ABS_CREDITS_INSUFFICIENT',
      error: 'credits exhausted',
      freeSummary: { sentCount: 100, monthlyLimit: 100 },
      creditsBalance: 0,
    });

    const result = await smsService.sendMessage('tenant-1', '+233241234567', 'Hello');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ABS_CREDITS_INSUFFICIENT');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('increments platform usage only after a successful Arkesel send', async () => {
    Setting.findOne.mockResolvedValue({ value: { enabled: false } });
    getSavedPlatformSmsConfig.mockResolvedValue({
      enabled: true,
      provider: 'arkesel',
      apiKey: 'platform-key',
      senderId: 'ABS',
      source: 'platform',
      limited: true,
    });
    axios.post.mockResolvedValue({
      status: 200,
      data: { status: 'success', data: { id: 'msg-1' } },
    });

    const result = await smsService.sendMessage('tenant-1', '+233241234567', 'Hello');

    expect(result.success).toBe(true);
    expect(incrementPlatformSmsUsage).toHaveBeenCalled();
  });

  it('debits ABS Credits when platform billing type is credits', async () => {
    Setting.findOne.mockResolvedValue({ value: { enabled: false } });
    getSavedPlatformSmsConfig.mockResolvedValue({
      enabled: true,
      provider: 'arkesel',
      apiKey: 'platform-key',
      senderId: 'ABS',
      source: 'platform',
      limited: true,
    });
    resolvePlatformSmsBilling.mockResolvedValue({
      allowed: true,
      billType: 'credits',
      freeSummary: {},
      creditsBalance: 10,
    });
    axios.post.mockResolvedValue({
      status: 200,
      data: { status: 'success', data: { id: 'msg-2' } },
    });

    const result = await smsService.sendMessage('tenant-1', '+233241234567', 'Hello');

    expect(result.success).toBe(true);
    expect(result.platformBillType).toBe('credits');
    expect(debitForSend).toHaveBeenCalled();
  });
});
