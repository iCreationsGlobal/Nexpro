const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

/**
 * Lynk AI inside ABS (models/LynkAiSession.js): one row per opening, so Lynk's questions are answered only for
 * sessions ABS opened, as that person, in their shop.
 * @param {{ closeConnection?: boolean }} [options]
 */
const createLynkAiSessions = async (options = {}) => {
  const { closeConnection = true } = options;
  console.log('[createLynkAiSessions] Starting...');

  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS lynk_ai_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "lynkSessionId" VARCHAR(80) NOT NULL UNIQUE,
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "shopId" UUID NULL,
        "studioLocationId" UUID NULL,
        client VARCHAR(10) NOT NULL DEFAULT 'web',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS lynk_ai_sessions_tenant_created ON lynk_ai_sessions ("tenantId", "createdAt");
    `);
    console.log('[createLynkAiSessions] Done.');
  } catch (error) {
    console.error('[createLynkAiSessions] Failed:', error.message);
    throw error;
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }
};

if (require.main === module) {
  createLynkAiSessions().catch(() => process.exit(1));
}

module.exports = createLynkAiSessions;
