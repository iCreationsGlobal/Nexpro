const { SabitoAppPlatformSettings } = require('../models');
const {
  DEFAULT_PLATFORM_FEE_PERCENT,
  clampFeePercent,
  getEnvPlatformFeePercent,
} = require('../config/sabitoAppPlatform');

const getOrCreatePlatformSettings = async () => {
  const [row] = await SabitoAppPlatformSettings.findOrCreate({
    where: { id: 1 },
    defaults: {
      id: 1,
      platformFeePercent: getEnvPlatformFeePercent(),
    },
  });
  return row;
};

const getPlatformFeePercent = async () => {
  const row = await getOrCreatePlatformSettings();
  return clampFeePercent(row.platformFeePercent);
};

const getPlatformSettings = async () => {
  const row = await getOrCreatePlatformSettings();
  return {
    platformFeePercent: clampFeePercent(row.platformFeePercent),
    defaultPlatformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
    updatedAt: row.updatedAt,
  };
};

const updatePlatformFeePercent = async (value) => {
  const percent = clampFeePercent(value);
  const row = await getOrCreatePlatformSettings();
  await row.update({ platformFeePercent: percent });
  return getPlatformSettings();
};

module.exports = {
  getOrCreatePlatformSettings,
  getPlatformFeePercent,
  getPlatformSettings,
  updatePlatformFeePercent,
};
