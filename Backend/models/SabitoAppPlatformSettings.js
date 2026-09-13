const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { DEFAULT_PLATFORM_FEE_PERCENT } = require('../config/sabitoAppPlatform');

/**
 * Singleton Control Center settings for the Sabito App marketer program.
 * id is always 1.
 */
const SabitoAppPlatformSettings = sequelize.define(
  'SabitoAppPlatformSettings',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      defaultValue: 1,
    },
    platformFeePercent: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      defaultValue: DEFAULT_PLATFORM_FEE_PERCENT,
      comment: 'ABS take of the marketer commission remitted by the business',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'sabito_app_platform_settings',
    timestamps: true,
  }
);

module.exports = SabitoAppPlatformSettings;
