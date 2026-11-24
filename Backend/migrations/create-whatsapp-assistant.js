const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

/**
 * ABS on WhatsApp (services/whatsappAssistant.js): phones connected to ABS users, and the messages already received
 * (models/WhatsAppLink.js, models/WhatsAppInbound.js).
 * @param {{ closeConnection?: boolean }} [options]
 */
const createWhatsAppAssistant = async (options = {}) => {
  const { closeConnection = true } = options;
  console.log('[createWhatsAppAssistant] Starting...');

  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "shopId" UUID NULL,
        "studioLocationId" UUID NULL,
        phone VARCHAR(20) NULL UNIQUE,
        "connectedAt" TIMESTAMPTZ NULL,
        "codeHash" VARCHAR(64) NULL UNIQUE,
        "codeExpiresAt" TIMESTAMPTZ NULL,
        "pinHash" VARCHAR(100) NOT NULL,
        "pinTries" INTEGER NOT NULL DEFAULT 0,
        "pinLockedUntil" TIMESTAMPTZ NULL,
        "unlockHash" VARCHAR(64) NULL UNIQUE,
        "unlockExpiresAt" TIMESTAMPTZ NULL,
        "unlockedUntil" TIMESTAMPTZ NULL,
        "pendingMessage" JSONB NULL,
        "conversationId" VARCHAR(40) NULL,
        "conversationAt" TIMESTAMPTZ NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_inbound (
        "messageId" VARCHAR(200) PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        connected BOOLEAN NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS whatsapp_inbound_phone_created ON whatsapp_inbound (phone, "createdAt");
    `);
    console.log('[createWhatsAppAssistant] Done.');
  } catch (error) {
    console.error('[createWhatsAppAssistant] Failed:', error.message);
    throw error;
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }
};

if (require.main === module) {
  createWhatsAppAssistant().catch(() => process.exit(1));
}

module.exports = createWhatsAppAssistant;
