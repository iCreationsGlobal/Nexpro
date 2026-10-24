const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * One opening of Lynk AI inside ABS (services/lynkAi.js): who opened it, the shop they were looking at, and whether
 * it was the web or the phone app. Lynk's questions about the business are answered only for a session ABS opened,
 * as that person, in that shop, with links for that device.
 */
const LynkAiSession = sequelize.define('LynkAiSession', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  /** Lynk's id for the session. */
  lynkSessionId: {
    type: DataTypes.STRING(80),
    allowNull: false,
    unique: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  shopId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  studioLocationId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  /** 'web' or 'app': which links Lynk's answers carry. */
  client: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'web'
  }
}, {
  tableName: 'lynk_ai_sessions',
  timestamps: true,
  indexes: [{ fields: ['tenantId', 'createdAt'] }]
});

module.exports = LynkAiSession;
