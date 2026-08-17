const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

/**
 * Add invoice.metadata JSONB and customers.ghanaCardPin for GRA e-VAT.
 */
const addEvatComplianceFields = async ({ closeConnection = true } = {}) => {
  console.log('🚀 Adding e-VAT / compliance fields...');
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    `, { transaction });

    await sequelize.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS "ghanaCardPin" VARCHAR(255);
    `, { transaction });

    await transaction.commit();
    console.log('✅ e-VAT / compliance fields ready');
  } catch (error) {
    await transaction.rollback();
    console.error('💥 e-VAT compliance fields migration failed:', error);
    throw error;
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }
};

if (require.main === module) {
  addEvatComplianceFields()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addEvatComplianceFields;
