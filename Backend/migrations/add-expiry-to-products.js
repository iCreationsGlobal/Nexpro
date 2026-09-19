const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { sequelize, testConnection } = require('../config/database');

/**
 * Optional expiry tracking on products, for any shop that sells perishable/expiring goods
 * (food, cosmetics, etc.) — not just pharmacies. Mirrors drugs.expiryDate/batchNumber.
 */
const addExpiryToProducts = async () => {
  const isDirect = require.main === module;
  try {
    console.log('🔄 Adding expiryDate/batchNumber columns to products...\n');
    if (isDirect) await testConnection();

    const [columns] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products' AND column_name IN ('expiryDate', 'batchNumber');
    `);
    const existing = new Set(columns.map((c) => c.column_name));

    if (existing.has('expiryDate')) {
      console.log('✅ Column expiryDate already exists on products.');
    } else {
      await sequelize.query(`
        ALTER TABLE products
        ADD COLUMN "expiryDate" DATE;
      `);
      console.log('✅ Column expiryDate added to products.');
    }

    if (existing.has('batchNumber')) {
      console.log('✅ Column batchNumber already exists on products.');
    } else {
      await sequelize.query(`
        ALTER TABLE products
        ADD COLUMN "batchNumber" VARCHAR(255);
      `);
      console.log('✅ Column batchNumber added to products.');
    }

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_products_tenant_expiry_date
      ON products ("tenantId", "expiryDate")
      WHERE "expiryDate" IS NOT NULL;
    `);
    console.log('✅ Index on products(tenantId, expiryDate) ready.');

    console.log('✅ add-expiry-to-products migration completed.\n');
    if (isDirect) {
      await sequelize.close();
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    if (isDirect) {
      await sequelize.close();
      process.exit(1);
    }
    throw error;
  }
};

if (require.main === module) {
  addExpiryToProducts();
}

module.exports = addExpiryToProducts;
