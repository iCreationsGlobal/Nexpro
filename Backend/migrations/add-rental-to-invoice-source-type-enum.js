const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

const KNOWN_INVOICE_SOURCE_ENUMS = ['enum_invoices_sourceType', 'invoice_source_type_enum'];

/**
 * Resolves Postgres enum type names used by invoices."sourceType".
 * @returns {Promise<string[]>}
 */
const discoverInvoiceSourceEnumTypes = async () => {
  const [columnTypes] = await sequelize.query(`
    SELECT DISTINCT udt_name AS typname
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'sourceType'
      AND udt_name IS NOT NULL;
  `);

  const fromColumn = (columnTypes || []).map((row) => row.typname).filter(Boolean);
  return [...new Set([...KNOWN_INVOICE_SOURCE_ENUMS, ...fromColumn])];
};

/**
 * Ensures 'rental' is valid for invoices.sourceType on all relevant Postgres enum types.
 * Idempotent. ALTER TYPE ... ADD VALUE cannot run inside a transaction on some PostgreSQL versions.
 */
const addRentalToInvoiceSourceTypeEnum = async () => {
  const enumTypes = await discoverInvoiceSourceEnumTypes();
  console.log('🔄 Ensuring rental is in invoice sourceType enum(s)...');

  if (!enumTypes.length) {
    console.log('⚠️  No invoice sourceType enum types found; skipping');
    return;
  }

  for (const typname of enumTypes) {
    const [[typeRow]] = await sequelize.query(
      `SELECT oid FROM pg_type WHERE typname = :typname LIMIT 1`,
      { replacements: { typname } }
    );
    if (!typeRow?.oid) {
      console.log(`   ⏭️  ${typname}: type does not exist`);
      continue;
    }

    const [[hasRental]] = await sequelize.query(
      `SELECT 1 AS ok FROM pg_enum WHERE enumlabel = 'rental' AND enumtypid = :oid LIMIT 1`,
      { replacements: { oid: typeRow.oid } }
    );

    if (hasRental?.ok) {
      console.log(`   ✓ ${typname}: rental already present`);
      continue;
    }

    await sequelize.query(`ALTER TYPE "${typname}" ADD VALUE 'rental'`);
    console.log(`   ➕ ${typname}: added rental`);
  }

  console.log('✅ Invoice sourceType enum(s) include rental');
};

if (require.main === module) {
  addRentalToInvoiceSourceTypeEnum()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = addRentalToInvoiceSourceTypeEnum;
