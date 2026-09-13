const { sequelize } = require('../config/database');

/**
 * Add customers.metadata JSONB for extensible per-customer data (e.g. rental guarantor, risk profile).
 */
async function up() {
  try {
    console.log('🔄 Adding metadata column to customers...');
    await sequelize.query(`
      ALTER TABLE IF EXISTS customers
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
    console.log('✅ metadata column ready on customers');
  } catch (error) {
    console.error('❌ add-metadata-to-customers failed:', error);
    throw error;
  }
}

async function down() {
  try {
    await sequelize.query(`
      ALTER TABLE IF EXISTS customers
      DROP COLUMN IF EXISTS metadata;
    `);
  } catch (error) {
    console.error('❌ add-metadata-to-customers down failed:', error);
    throw error;
  }
}

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { up, down };
