const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Shop camera + zone configuration for ABS Watch.
 * Zones are normalized 0–1 rectangles: { name, type, x, y, w, h }.
 */
const VisionCamera = sequelize.define('VisionCamera', {
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
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'counter',
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  streamUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  zones: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
}, {
  tableName: 'vision_cameras',
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['shopId'] },
    { fields: ['tenantId', 'shopId'] },
  ],
});

module.exports = VisionCamera;
