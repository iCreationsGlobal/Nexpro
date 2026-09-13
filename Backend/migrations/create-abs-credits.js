const { sequelize } = require('../config/database');

/**
 * ABS Credits prepaid SMS wallet tables.
 * @param {{ closeConnection?: boolean }} [options]
 */
async function up(options = {}) {
  const { closeConnection = true } = options;
  try {
    console.log('🔄 Creating ABS Credits tables...');
    await sequelize.query(`SET statement_timeout TO 15000;`);
    await sequelize.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS tenant_abs_credits (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS tenant_abs_credit_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        delta INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reason VARCHAR(40) NOT NULL,
        reference_type VARCHAR(60),
        reference_id VARCHAR(255),
        metadata JSONB NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_abs_credit_ledger_tenant_created
      ON tenant_abs_credit_ledger (tenant_id, "createdAt" DESC);
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS abs_credit_purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "packId" VARCHAR(60) NOT NULL,
        credits INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        provider VARCHAR(32) NOT NULL DEFAULT 'paystack',
        "providerReference" VARCHAR(255),
        "recordedBy" UUID REFERENCES users(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS abs_credit_purchases_tenant_idx
      ON abs_credit_purchases ("tenantId");
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS abs_credit_purchases_provider_ref_unique
      ON abs_credit_purchases (provider, "providerReference")
      WHERE "providerReference" IS NOT NULL;
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS sms_message_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        description TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS sms_message_groups_tenant_idx
      ON sms_message_groups ("tenantId");
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS sms_message_group_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "groupId" UUID NOT NULL REFERENCES sms_message_groups(id) ON DELETE CASCADE,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "customerId" UUID REFERENCES customers(id) ON DELETE SET NULL,
        phone VARCHAR(32) NOT NULL,
        name VARCHAR(255),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT sms_message_group_members_unique UNIQUE ("groupId", phone)
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS sms_message_group_members_group_idx
      ON sms_message_group_members ("groupId");
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS sms_message_group_members_tenant_idx
      ON sms_message_group_members ("tenantId");
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS sms_marketing_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title VARCHAR(160) NOT NULL,
        content TEXT NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS sms_marketing_templates_tenant_idx
      ON sms_marketing_templates ("tenantId");
    `);

    await sequelize.query(`SET statement_timeout TO 0;`);
    console.log('✅ ABS Credits + messaging groups/templates ready');
  } catch (error) {
    console.error('❌ create-abs-credits failed:', error);
    throw error;
  } finally {
    if (closeConnection) {
      try { await sequelize.close(); } catch (_) { /* ignore */ }
    }
  }
}

async function down() {
  await sequelize.query('DROP TABLE IF EXISTS sms_marketing_templates CASCADE;');
  await sequelize.query('DROP TABLE IF EXISTS sms_message_group_members CASCADE;');
  await sequelize.query('DROP TABLE IF EXISTS sms_message_groups CASCADE;');
  await sequelize.query('DROP TABLE IF EXISTS abs_credit_purchases CASCADE;');
  await sequelize.query('DROP TABLE IF EXISTS tenant_abs_credit_ledger CASCADE;');
  await sequelize.query('DROP TABLE IF EXISTS tenant_abs_credits CASCADE;');
}

if (require.main === module) {
  up().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { up, down };
