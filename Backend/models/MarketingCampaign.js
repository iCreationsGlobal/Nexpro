const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MarketingCampaign = sequelize.define('MarketingCampaign', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'tenants', key: 'id' },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  },
  name: {
    type: DataTypes.STRING(180),
    allowNull: false
  },
  goal: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'draft'
  },
  audienceType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'customer'
  },
  tags: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },
  channels: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },
  audienceFilter: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  audienceSnapshot: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  messageContent: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  stats: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  },
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  }
}, {
  tableName: 'marketing_campaigns',
  timestamps: true
});

module.exports = MarketingCampaign;
