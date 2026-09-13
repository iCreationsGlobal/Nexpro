const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { sequelize, testConnection } = require('../config/database');

const createRentalUnits = async () => {
  const isDirect = require.main === module;
  try {
    console.log('🔄 Creating rental_units table and rental_items.rentalUnitId...\n');
    if (isDirect) await testConnection();

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_rental_units_status') THEN
          CREATE TYPE enum_rental_units_status AS ENUM ('available', 'rented', 'maintenance', 'retired');
        END IF;
      END $$;
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS rental_units (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "productId" UUID NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "branchId" UUID REFERENCES shops(id) ON UPDATE CASCADE ON DELETE SET NULL,
        "serialNumber" VARCHAR(255) NOT NULL,
        status enum_rental_units_status NOT NULL DEFAULT 'available',
        notes TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS rental_units_tenant_product_serial_unique
      ON rental_units ("tenantId", "productId", "serialNumber");
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS rental_units_tenant_idx ON rental_units ("tenantId");
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS rental_units_product_idx ON rental_units ("productId");
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS rental_units_branch_idx ON rental_units ("branchId");
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS rental_units_status_idx ON rental_units (status);
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'rental_items' AND column_name = 'rentalUnitId'
        ) THEN
          ALTER TABLE rental_items
          ADD COLUMN "rentalUnitId" UUID REFERENCES rental_units(id) ON UPDATE CASCADE ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS rental_items_rental_unit_idx ON rental_items ("rentalUnitId");
    `);

    console.log('✅ create-rental-units migration completed.\n');
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
  createRentalUnits();
}

module.exports = createRentalUnits;
