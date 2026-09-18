const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

/**
 * Lead broadcast support: suppression flag on leads, and audienceType on
 * marketing_campaigns so a campaign can target leads instead of customers.
 * @param {{ closeConnection?: boolean }} [options]
 */
const addLeadsMarketingBroadcast = async (options = {}) => {
  const { closeConnection = true } = options;
  console.log('[addLeadsMarketingBroadcast] Starting...');
  const transaction = await sequelize.transaction();

  try {
    await sequelize.query(`
      ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS "doNotContact" BOOLEAN NOT NULL DEFAULT false;
    `, { transaction });

    await sequelize.query(`
      ALTER TABLE marketing_campaigns
        ADD COLUMN IF NOT EXISTS "audienceType" VARCHAR(20) NOT NULL DEFAULT 'customer';
    `, { transaction });

    await transaction.commit();
    console.log('[addLeadsMarketingBroadcast] Done.');
  } catch (error) {
    await transaction.rollback();
    console.error('[addLeadsMarketingBroadcast] Failed:', error.message);
    throw error;
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }
};

module.exports = addLeadsMarketingBroadcast;

if (require.main === module) {
  addLeadsMarketingBroadcast()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
