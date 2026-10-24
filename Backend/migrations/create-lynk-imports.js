const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

/**
 * "Bring in with Lynk AI" imports (models/LynkImport.js): one row per import an owner or manager started, so ABS
 * takes Lynk's products only for its own imports, once each, and never again after Undo.
 * @param {{ closeConnection?: boolean }} [options]
 */
const createLynkImports = async (options = {}) => {
  const { closeConnection = true } = options;
  console.log('[createLynkImports] Starting...');

  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS lynk_imports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "importId" VARCHAR(80) NOT NULL UNIQUE,
        "startedBy" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'started',
        "batchId" VARCHAR(80) NOT NULL,
        "addedCount" INTEGER NOT NULL DEFAULT 0,
        "updatedCount" INTEGER NOT NULL DEFAULT 0,
        result JSONB NOT NULL DEFAULT '{}'::jsonb,
        "finishedAt" TIMESTAMPTZ NULL,
        "undoneAt" TIMESTAMPTZ NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS lynk_imports_tenant_created ON lynk_imports ("tenantId", "createdAt");
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS lynk_imports_tenant_batch ON lynk_imports ("tenantId", "batchId");
    `);
    console.log('[createLynkImports] Done.');
  } catch (error) {
    console.error('[createLynkImports] Failed:', error.message);
    throw error;
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }
};

if (require.main === module) {
  createLynkImports().catch(() => process.exit(1));
}

module.exports = createLynkImports;
