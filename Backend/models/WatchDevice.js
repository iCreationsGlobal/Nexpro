const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * An ABS Watch agent (shop PC / Watch Box) paired to one workspace + shop.
 * Pairing: owner creates a pending device and types its one-time code into the agent, which
 * receives a device key. Only hashes of the code and key are stored. Camera logins never leave
 * the agent; the cloud keeps camera names, roles and zones.
 */
const WatchDevice = sequelize.define('WatchDevice', {
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
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  /** pending (waiting for the agent to pair) | active | revoked */
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'pending',
  },
  pairingCodeHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  pairingExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  keyHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  pairedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  lastSeenAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  agentVersion: {
    type: DataTypes.STRING(40),
    allowNull: true,
  },
  platform: {
    type: DataTypes.STRING(60),
    allowNull: true,
  },
  /** Last heartbeat: { cameras: [{ cameraId, online, lastFrameAt, fps, error }], errors: [] } */
  health: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  revokedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
}, {
  tableName: 'watch_devices',
  timestamps: true,
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['tenantId', 'shopId'] },
    { fields: ['pairingCodeHash'] },
  ],
});

module.exports = WatchDevice;
