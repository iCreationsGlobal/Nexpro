/**
 * @jest-environment node
 */

jest.mock('../../../models', () => ({
  SabitoAppPlatformSettings: {
    findOrCreate: jest.fn(),
  },
}));

const { SabitoAppPlatformSettings } = require('../../../models');
const {
  getPlatformFeePercent,
  updatePlatformFeePercent,
} = require('../../../services/sabitoAppPlatformService');

describe('sabitoAppPlatformService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getPlatformFeePercent reads the singleton row', async () => {
    SabitoAppPlatformSettings.findOrCreate.mockResolvedValue([
      { id: 1, platformFeePercent: 20, updatedAt: new Date() },
    ]);
    await expect(getPlatformFeePercent()).resolves.toBe(20);
  });

  test('updatePlatformFeePercent clamps and persists', async () => {
    const row = {
      id: 1,
      platformFeePercent: 20,
      updatedAt: new Date(),
      update: jest.fn(async (payload) => {
        Object.assign(row, payload);
      }),
    };
    SabitoAppPlatformSettings.findOrCreate.mockResolvedValue([row]);
    const result = await updatePlatformFeePercent(25);
    expect(row.update).toHaveBeenCalledWith({ platformFeePercent: 25 });
    expect(result.platformFeePercent).toBe(25);
  });
});
