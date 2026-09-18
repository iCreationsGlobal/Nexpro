const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

/**
 * A repeated "ADD COLUMN IF NOT EXISTS paymentToken ... UNIQUE" migration left invoices with
 * three separate indexes on the same column: two duplicate UNIQUE constraints
 * (invoices_paymentToken_key, invoices_paymentToken_key1) plus a redundant plain btree index
 * (invoices_payment_token_idx). Every invoice insert/update pays to maintain all three for no
 * benefit — collapse down to the single original unique constraint, which already indexes the
 * column for lookups.
 * @param {{ closeConnection?: boolean }} [options]
 */
const fixDuplicateInvoicePaymentTokenIndexes = async (options = {}) => {
  const { closeConnection = true } = options;
  console.log('[fixDuplicateInvoicePaymentTokenIndexes] Starting...');

  try {
    await sequelize.query(`
      ALTER TABLE invoices DROP CONSTRAINT IF EXISTS "invoices_paymentToken_key1";
    `);
    await sequelize.query(`
      DROP INDEX IF EXISTS invoices_payment_token_idx;
    `);
    console.log('[fixDuplicateInvoicePaymentTokenIndexes] Done.');
  } catch (error) {
    console.error('[fixDuplicateInvoicePaymentTokenIndexes] Failed:', error.message);
    throw error;
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }
};

module.exports = fixDuplicateInvoicePaymentTokenIndexes;

if (require.main === module) {
  fixDuplicateInvoicePaymentTokenIndexes()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
