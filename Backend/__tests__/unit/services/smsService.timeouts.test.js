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
  incrementPlatformSmsUsage: jest.fn().mockResolvedValue(undefined),
}));

// Platform SMS sends are now billed through ABS Credits (free-tier + paid credits), not the
// older checkPlatformSmsLimit gate — resolvePlatformSmsBilling is the real gate smsService calls.
jest.mock('../../../services/absCreditsService', () => ({
  resolvePlatformSmsBilling: jest.fn(),
  debitForSend: jest.fn().mockResolvedValue({ balance: 0 }),
}));

const { Setting } = require('../../../models');
const { getSavedPlatformSmsConfig } = require('../../../services/platformSmsSettingsService');
const { resolvePlatformSmsBilling } = require('../../../services/absCreditsService');
const smsService = require('../../../services/smsService');
const axios = require('axios');

jest.mock('axios');

describe('smsService provider timeouts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSavedPlatformSmsConfig.mockResolvedValue(null);
    resolvePlatformSmsBilling.mockResolvedValue({ allowed: true, billType: 'free' });
  });

  it('exports separate send and connection-test timeout values', () => {
    expect(smsService.SMS_SEND_TIMEOUT_MS).toBe(45000);
    expect(smsService.SMS_CONNECTION_TEST_TIMEOUT_MS).toBe(15000);
    expect(smsService.SMS_SEND_TIMEOUT_MS).toBeGreaterThan(smsService.SMS_CONNECTION_TEST_TIMEOUT_MS);
  });

  it('uses the send timeout for Arkesel message delivery', async () => {
    Setting.findOne.mockResolvedValue({ value: { enabled: false } });
    getSavedPlatformSmsConfig.mockResolvedValue({
      enabled: true,
      provider: 'arkesel',
      apiKey: 'platform-key',
      senderId: 'ABS',
      source: 'platform',
      limited: true,
    });
    axios.post.mockResolvedValue({ status: 200, data: { data: [{ id: 'msg-1' }] } });

    await smsService.sendMessage('tenant-1', '+233241234567', 'Hello');

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/sms/send'),
      expect.any(Object),
      expect.objectContaining({ timeout: 45000 })
    );
  });

  it('returns SMS_PROVIDER_TIMEOUT when Arkesel send times out', async () => {
    Setting.findOne.mockResolvedValue({ value: { enabled: false } });
    getSavedPlatformSmsConfig.mockResolvedValue({
      enabled: true,
      provider: 'arkesel',
      apiKey: 'platform-key',
      senderId: 'ABS',
      source: 'platform',
      limited: true,
    });
    const timeoutError = new Error('timeout of 45000ms exceeded');
    timeoutError.code = 'ECONNABORTED';
    axios.post.mockRejectedValue(timeoutError);

    const result = await smsService.sendMessage('tenant-1', '+233241234567', 'Hello');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SMS_PROVIDER_TIMEOUT');
    expect(result.error).toContain('may still be delivered');
  });

  it('uses the shorter timeout for Arkesel connection tests', async () => {
    axios.get.mockResolvedValue({ status: 200, data: { balance: 10 } });

    await smsService.testConnection({
      provider: 'arkesel',
      apiKey: 'platform-key',
    });

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/clients/balance-details'),
      expect.objectContaining({ timeout: 15000 })
    );
  });
});
