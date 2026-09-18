const { sequelize } = require('../config/database');
module.exports = async function createCalendarIntegration() {
  await sequelize.transaction(async transaction => {
    await sequelize.query(`CREATE TABLE IF NOT EXISTS calendar_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tokens TEXT, "stateHash" VARCHAR(255), "stateExpiresAt" TIMESTAMPTZ, verifier TEXT,
      "calendarId" TEXT, "calendarName" TEXT, enabled BOOLEAN NOT NULL DEFAULT false,
      "lastSyncedAt" TIMESTAMPTZ, "lastError" VARCHAR(255),
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("tenantId", "userId")
    )`, { transaction });
    // No task FK: deleted tasks must retain their event link until Google confirms deletion.
    await sequelize.query(`CREATE TABLE IF NOT EXISTS calendar_task_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "connectionId" UUID NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
      "taskId" UUID NOT NULL, "eventId" VARCHAR(255) NOT NULL, fingerprint VARCHAR(255),
      status VARCHAR(255) DEFAULT 'pending', "lastError" VARCHAR(255),
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("connectionId", "taskId")
    )`, { transaction });
  });
};
