const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { sequelize, testConnection } = require('../config/database');

const quoteIdent = (identifier) => {
  if (!/^[a-z][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
};

/**
 * Sabito App Admin: listing moderation, commission split, remittances, platform take %.
 */
const addSabitoAppAdminAndSettlement = async ({ closeConnection = true } = {}) => {
  const isDirect = require.main === module;
  try {
    console.log('[addSabitoAppAdminAndSettlement] Starting...');
    if (isDirect) await testConnection();

    const [settingsTables] = await sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'partner_program_settings' LIMIT 1`
    );
    if (!settingsTables.length) {
      console.log('  Skipping (partner_program_settings does not exist)');
      return;
    }

    await sequelize.query(`
      ALTER TABLE ${quoteIdent('partner_program_settings')}
        ADD COLUMN IF NOT EXISTS "moderationStatus" VARCHAR(32) NOT NULL DEFAULT 'draft';
    `);
    await sequelize.query(`
      ALTER TABLE ${quoteIdent('partner_program_settings')}
        ADD COLUMN IF NOT EXISTS "moderationNote" TEXT;
    `);
    await sequelize.query(`
      ALTER TABLE ${quoteIdent('partner_program_settings')}
        ADD COLUMN IF NOT EXISTS "moderatedAt" TIMESTAMPTZ;
    `);
    await sequelize.query(`
      ALTER TABLE ${quoteIdent('partner_program_settings')}
        ADD COLUMN IF NOT EXISTS "moderatedBy" UUID REFERENCES users(id) ON DELETE SET NULL;
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS partner_program_settings_moderation_idx
      ON ${quoteIdent('partner_program_settings')} ("moderationStatus", enabled, listed);
    `);
    await sequelize.query(`
      UPDATE ${quoteIdent('partner_program_settings')}
      SET "moderationStatus" = 'approved'
      WHERE enabled = TRUE AND listed = TRUE AND "moderationStatus" = 'draft';
    `);

    await sequelize.query(`
      ALTER TABLE ${quoteIdent('partner_commissions')}
        ADD COLUMN IF NOT EXISTS "platformFeePercent" DECIMAL(6, 2) NOT NULL DEFAULT 20;
    `);
    await sequelize.query(`
      ALTER TABLE ${quoteIdent('partner_commissions')}
        ADD COLUMN IF NOT EXISTS "platformFeeAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;
    `);
    await sequelize.query(`
      ALTER TABLE ${quoteIdent('partner_commissions')}
        ADD COLUMN IF NOT EXISTS "marketerShareAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;
    `);
    await sequelize.query(`
      ALTER TABLE ${quoteIdent('partner_commissions')}
        ADD COLUMN IF NOT EXISTS "remittanceStatus" VARCHAR(32) NOT NULL DEFAULT 'owed';
    `);
    await sequelize.query(`
      ALTER TABLE ${quoteIdent('partner_commissions')}
        ADD COLUMN IF NOT EXISTS "remittanceId" UUID;
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent('partner_remittances')} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        amount DECIMAL(12, 2) NOT NULL,
        "platformFeeAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
        "marketerShareAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
        status VARCHAR(32) NOT NULL DEFAULT 'paid',
        "paidAt" TIMESTAMPTZ,
        "paidByUserId" UUID REFERENCES users(id) ON DELETE SET NULL,
        "recordedByUserId" UUID REFERENCES users(id) ON DELETE SET NULL,
        "payoutReference" VARCHAR(160),
        notes TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS partner_remittances_tenant_status_idx
      ON ${quoteIdent('partner_remittances')} ("tenantId", status);
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'partner_commissions_remittanceid_fkey'
        ) THEN
          ALTER TABLE ${quoteIdent('partner_commissions')}
            ADD CONSTRAINT partner_commissions_remittanceId_fkey
            FOREIGN KEY ("remittanceId") REFERENCES ${quoteIdent('partner_remittances')}(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS partner_commissions_remittance_idx
      ON ${quoteIdent('partner_commissions')} ("remittanceStatus", "remittanceId");
    `);

    await sequelize.query(`
      UPDATE ${quoteIdent('partner_commissions')}
      SET
        "platformFeePercent" = 20,
        "platformFeeAmount" = ROUND(("amount"::numeric * 20) / 100, 2),
        "marketerShareAmount" = ROUND("amount"::numeric - ROUND(("amount"::numeric * 20) / 100, 2), 2),
        "remittanceStatus" = CASE WHEN status = 'paid' THEN 'collected' ELSE "remittanceStatus" END
      WHERE "marketerShareAmount" = 0 AND "amount" > 0;
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent('sabito_app_platform_settings')} (
        id INTEGER PRIMARY KEY,
        "platformFeePercent" DECIMAL(6, 2) NOT NULL DEFAULT 20,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT sabito_app_platform_settings_singleton CHECK (id = 1)
      );
    `);
    await sequelize.query(`
      INSERT INTO ${quoteIdent('sabito_app_platform_settings')} (id, "platformFeePercent")
      VALUES (1, 20)
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('[addSabitoAppAdminAndSettlement] Done.');
  } catch (error) {
    console.error('[addSabitoAppAdminAndSettlement] Failed:', error.message);
    throw error;
  } finally {
    if (isDirect && closeConnection) {
      await sequelize.close();
    }
  }
};

module.exports = addSabitoAppAdminAndSettlement;

if (require.main === module) {
  addSabitoAppAdminAndSettlement()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
