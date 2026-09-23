const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * One queued marketing message: a single recipient on a single channel.
 * Status flow: pending → processing → sent | failed.
 */
const MarketingCampaignRecipient = sequelize.define('MarketingCampaignRecipient', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  campaignId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  recipientType: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  recipientId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  recipientName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  channel: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  address: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'pending'
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  lockedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'marketing_campaign_recipients',
  timestamps: true
});

module.exports = MarketingCampaignRecipient;
