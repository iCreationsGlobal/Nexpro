const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Reconciliation outcome for ABS Watch.
 * kind is matched | unmatched_interaction | sale_without_event.
 * Owner review is confirm / dismiss / needs_context — never an accusation.
 */
const VisionIncident = sequelize.define('VisionIncident', {
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
  kind: {
    type: DataTypes.STRING(40),
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'pending',
  },
  eventId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'vision_events', key: 'id' },
  },
  saleId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'sales', key: 'id' },
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
  clipReference: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  reviewNote: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  reviewedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
}, {
  tableName: 'vision_incidents',
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['shopId'] },
    { fields: ['tenantId', 'shopId', 'startedAt'] },
    { fields: ['kind'] },
    { fields: ['status'] },
    { fields: ['eventId'] },
    { fields: ['saleId'] },
  ],
});

module.exports = VisionIncident;
