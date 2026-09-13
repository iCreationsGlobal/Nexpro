/**
 * Migration: Add rental business type to tenant businessType column
 *
 * Discovers the actual PostgreSQL enum type for tenants.businessType (varies by
 * environment: enum_tenants_businessType from Sequelize vs business_type_enum from
 * older migrations). No-op when the column is VARCHAR/TEXT.
 *
 * Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction in PostgreSQL.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RENTAL_VALUE = 'rental';

/**
 * Resolve PostgreSQL enum type for tenants.businessType (varies by environment).
 * @returns {Promise<string|null>} udt_name from information_schema, or null if column missing
 */
const getTenantBusinessTypeUdtName = async () => {
  const [row] = await sequelize.query(
    `
    SELECT udt_name AS "udtName", data_type AS "dataType"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'businessType';
    `,
    { type: QueryTypes.SELECT }
  );
  return row?.udtName || null;
};

/**
 * Add enum value if the column uses a PostgreSQL enum (not varchar/text).
 * @param {string|null} udtName
 * @param {string} value
 */
const ensureEnumValue = async (udtName, value) => {
  if (!udtName || udtName === 'varchar' || udtName === 'text') {
    return false;
  }

  const [existing] = await sequelize.query(
    `
    SELECT 1 AS found
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = :typeName
      AND e.enumlabel = :value
    LIMIT 1;
    `,
    { replacements: { typeName: udtName, value }, type: QueryTypes.SELECT }
  );

  if (existing?.found) {
    console.log(`  ℹ️  '${value}' already exists on enum ${udtName}`);
    return false;
  }

  await sequelize.query(`
    ALTER TYPE "${udtName}" ADD VALUE IF NOT EXISTS '${value}';
  `);
  console.log(`  ✅ Added '${value}' to enum ${udtName}`);
  return true;
};

const addRentalBusinessType = async (options = {}) => {
  const { closeConnection = true } = options;
  console.log('🏗️  Adding rental to tenant businessType...');

  try {
    const udtName = await getTenantBusinessTypeUdtName();

    if (!udtName) {
      console.log('  ⚠️  tenants.businessType column not found; skipping enum update');
      return;
    }

    console.log(`  📋 tenants.businessType udt: ${udtName}`);

    if (udtName === 'varchar' || udtName === 'text') {
      console.log('  ℹ️  Column is text/varchar; no enum alteration needed');
      return;
    }

    await ensureEnumValue(udtName, RENTAL_VALUE);
    console.log('✅ Rental business type added successfully!');
  } catch (error) {
    console.error('💥 Failed to add rental business type:', error);
    throw error;
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }
};

if (require.main === module) {
  addRentalBusinessType({ closeConnection: true })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addRentalBusinessType;
