const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

/**
 * Per-recipient send queue for marketing campaigns. Each row is one message on one channel
 * (pending → processing → sent | failed); the unique index stops the same address from
 * being queued twice in one campaign.
 * @param {{ closeConnection?: boolean }} [options]
 */
const createMarketingCampaignRecipients = async (options = {}) => {
  const { closeConnection = true } = options;
  console.log('[createMarketingCampaignRecipients] Starting...');

  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS marketing_campaign_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "campaignId" UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
        "recipientType" VARCHAR(20) NOT NULL,
        "recipientId" UUID NULL,
        "recipientName" VARCHAR(255) NULL,
        channel VARCHAR(20) NOT NULL,
        address VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        error TEXT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        "lockedAt" TIMESTAMPTZ NULL,
        "sentAt" TIMESTAMPTZ NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS marketing_campaign_recipients_campaign_channel_address
        ON marketing_campaign_recipients ("campaignId", channel, address);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS marketing_campaign_recipients_campaign_status
        ON marketing_campaign_recipients ("campaignId", status);
    `);
    console.log('[createMarketingCampaignRecipients] Done.');
  } catch (error) {
    console.error('[createMarketingCampaignRecipients] Failed:', error.message);
    throw error;
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }
};

module.exports = createMarketingCampaignRecipients;

if (require.main === module) {
  createMarketingCampaignRecipients()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
