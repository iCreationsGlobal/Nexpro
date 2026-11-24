const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * A person's WhatsApp, connected to ABS (services/whatsappLinks.js): one row per ABS user, with the business and shop
 * they ask about. `phone` (digits) is empty until they send the connect message from that phone. The connect code and
 * the unlock link are kept only as hashes.
 */
const WhatsAppLink = sequelize.define('WhatsAppLink', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true
  },
  tenantId: {
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
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true
  },
  connectedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  codeHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true
  },
  codeExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  pinHash: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  pinTries: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  pinLockedUntil: {
    type: DataTypes.DATE,
    allowNull: true
  },
  unlockHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true
  },
  unlockExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  /** Answers are given until then; after it, the PIN again. */
  unlockedUntil: {
    type: DataTypes.DATE,
    allowNull: true
  },
  /** What they asked while locked, answered once they enter the PIN. */
  pendingMessage: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  /** Their conversation with Lynk AI. */
  conversationId: {
    type: DataTypes.STRING(40),
    allowNull: true
  },
  conversationAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'whatsapp_links',
  timestamps: true
});

module.exports = WhatsAppLink;
