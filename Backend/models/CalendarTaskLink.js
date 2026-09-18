const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
module.exports = sequelize.define('CalendarTaskLink', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  connectionId: { type: DataTypes.UUID, allowNull: false },
  taskId: { type: DataTypes.UUID, allowNull: false },
  eventId: { type: DataTypes.STRING, allowNull: false },
  fingerprint: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  lastError: { type: DataTypes.STRING },
}, { tableName: 'calendar_task_links', indexes: [{ unique: true, fields: ['connectionId', 'taskId'] }] });
