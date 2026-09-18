const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

/**
 * Free-form tags on marketing campaigns (used to organize campaigns in the UI).
 * @param {{ closeConnection?: boolean }} [options]
 */
const addMarketingCampaignTags = async (options = {}) => {
  const { closeConnection = true } = options;
  console.log('[addMarketingCampaignTags] Starting...');

  try {
    await sequelize.query(`
      ALTER TABLE marketing_campaigns
        ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    console.log('[addMarketingCampaignTags] Done.');
  } catch (error) {
    console.error('[addMarketingCampaignTags] Failed:', error.message);
    throw error;
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }
};

module.exports = addMarketingCampaignTags;

if (require.main === module) {
  addMarketingCampaignTags()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
