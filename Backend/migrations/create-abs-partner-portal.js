const {
  sequelize
} = require('../config/database');
async function migrate({
  closeConnection = true
} = {}) {
  try {
    await sequelize.transaction(async transaction => {
      await sequelize.query(`CREATE TABLE IF NOT EXISTS abs_partner_accounts (
        id UUID PRIMARY KEY, "salesAgentId" UUID NOT NULL UNIQUE REFERENCES sales_agents(id),
        email VARCHAR(255) NOT NULL UNIQUE, role VARCHAR(20) NOT NULL DEFAULT 'reseller' CHECK (role IN ('reseller','distributor')),
        "distributorId" UUID REFERENCES abs_partner_accounts(id), "passwordHash" TEXT,
        "inviteHash" VARCHAR(64), "inviteExpiresAt" TIMESTAMPTZ, "tokenVersion" INTEGER NOT NULL DEFAULT 0,
        "payoutDetails" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK ("distributorId" IS NULL OR (role = 'reseller' AND "distributorId" <> id))
      );`, {
        transaction
      });
      await sequelize.query(`CREATE TABLE IF NOT EXISTS abs_partner_records (
        id UUID PRIMARY KEY, "partnerId" UUID NOT NULL REFERENCES abs_partner_accounts(id),
        kind VARCHAR(20) NOT NULL CHECK (kind IN ('lead','support','payout')), title VARCHAR(200) NOT NULL,
        status VARCHAR(30) NOT NULL, details JSONB NOT NULL DEFAULT '{}', history JSONB NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`, {
        transaction
      });
      await sequelize.query('CREATE INDEX IF NOT EXISTS abs_partner_records_owner_kind ON abs_partner_records ("partnerId", kind);', {
        transaction
      });
      await sequelize.query('CREATE INDEX IF NOT EXISTS abs_partner_accounts_distributor ON abs_partner_accounts ("distributorId");', {
        transaction
      });
      await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS abs_partner_one_pending_payout ON abs_partner_records ("partnerId") WHERE kind = 'payout' AND status = 'pending';`, {
        transaction
      });
    });
  } finally {
    if (closeConnection) await sequelize.close();
  }
}
module.exports = migrate;
if (require.main === module) migrate().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
