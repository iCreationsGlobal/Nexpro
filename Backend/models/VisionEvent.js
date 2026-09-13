const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Per-person physical activity event from ABS Vision Edge.
 * Temporary trackId is anonymous (Person #A37), not a real identity.
 */
const VisionEvent = sequelize.define('VisionEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'tenants', key: 'id' },
  },
  shopId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'shops', key: 'id' },
  },
  cameraId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'vision_cameras', key: 'id' },
  },
  clientEventId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  eventType: {
    type: DataTypes.STRING(60),
    allowNull: false,
  },
  trackId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  confidence: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: false,
    defaultValue: 0,
  },
  zone: {
    type: DataTypes.STRING(60),
    allowNull: true,
  },
  clipReference: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  attributes: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
}, {
  tableName: 'vision_events',
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['shopId'] },
    { fields: ['tenantId', 'shopId', 'startedAt'] },
    { fields: ['eventType'] },
    { fields: ['trackId'] },
  ],
});

module.exports = VisionEvent;
