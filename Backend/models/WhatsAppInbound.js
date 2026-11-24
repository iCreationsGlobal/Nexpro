const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * A message received on ABS's WhatsApp number, by Meta's id: Meta may send the same one again, and it's answered once.
 * Also counted per phone, to limit how many are answered. The words are not kept.
 */
const WhatsAppInbound = sequelize.define('WhatsAppInbound', {
  messageId: {
    type: DataTypes.STRING(200),
    primaryKey: true
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  /** Whether the phone was connected to an ABS user when it wrote. */
  connected: {
    type: DataTypes.BOOLEAN,
    allowNull: false
  }
}, {
  tableName: 'whatsapp_inbound',
  timestamps: true,
  updatedAt: false,
  indexes: [{ fields: ['phone', 'createdAt'] }]
});

module.exports = WhatsAppInbound;
