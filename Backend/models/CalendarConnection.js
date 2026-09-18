const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
module.exports = sequelize.define('CalendarConnection', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: false },
  tokens: { type: DataTypes.TEXT },
  stateHash: { type: DataTypes.STRING },
  stateExpiresAt: { type: DataTypes.DATE },
  verifier: { type: DataTypes.TEXT },
  calendarId: { type: DataTypes.TEXT },
  calendarName: { type: DataTypes.TEXT },
  enabled: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
  lastSyncedAt: { type: DataTypes.DATE },
  lastError: { type: DataTypes.STRING },
}, { tableName: 'calendar_connections', indexes: [{ unique: true, fields: ['tenantId', 'userId'] }] });
