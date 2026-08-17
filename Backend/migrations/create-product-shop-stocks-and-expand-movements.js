const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

const NEW_MOVEMENT_TYPES = [
  'sale',
  'sale_void',
  'count_adjustment',
  'opening',
  'import',
  'damage',
];

/**
 * Create per-shop stock balances, expand movement types, and backfill from products/variants.
 */
const createProductShopStocksAndExpandMovements = async () => {
  console.log('🚀 Starting product_shop_stocks + movement type expansion...');

  // Enum ADD VALUE must not share a transaction with later use of the new labels on older PG.
  console.log('🧱 Expanding product_stock_movements type enum...');
  for (const value of NEW_MOVEMENT_TYPES) {
    // value is a fixed constant from NEW_MOVEMENT_TYPES (not user input)
    await sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_product_stock_movements_type')
           AND NOT EXISTS (
             SELECT 1
             FROM pg_enum e
             JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'enum_product_stock_movements_type'
               AND e.enumlabel = '${value}'
           ) THEN
          ALTER TYPE enum_product_stock_movements_type ADD VALUE '${value}';
        END IF;
      END
      $$;
    `);
  }

  const transaction = await sequelize.transaction();
  try {
    console.log('📦 Creating product_shop_stocks table if needed...');
    await sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS product_shop_stocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "productId" UUID NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "productVariantId" UUID REFERENCES product_variants(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "shopId" UUID NOT NULL REFERENCES shops(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "quantityOnHand" DECIMAL(12, 2) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
      { transaction }
    );

    console.log('📊 Creating unique indexes for product_shop_stocks...');
    await sequelize.query(
      `
      CREATE UNIQUE INDEX IF NOT EXISTS product_shop_stocks_product_shop_uq
        ON product_shop_stocks ("tenantId", "productId", "shopId")
        WHERE "productVariantId" IS NULL;
      `,
      { transaction }
    );
    await sequelize.query(
      `
      CREATE UNIQUE INDEX IF NOT EXISTS product_shop_stocks_variant_shop_uq
        ON product_shop_stocks ("tenantId", "productId", "productVariantId", "shopId")
        WHERE "productVariantId" IS NOT NULL;
      `,
      { transaction }
    );
    await sequelize.query(
      `
      CREATE INDEX IF NOT EXISTS product_shop_stocks_tenant_shop_idx
        ON product_shop_stocks ("tenantId", "shopId");
      `,
      { transaction }
    );
    await sequelize.query(
      `
      CREATE INDEX IF NOT EXISTS product_shop_stocks_product_idx
        ON product_shop_stocks ("productId");
      `,
      { transaction }
    );
    await sequelize.query(
      `
      CREATE INDEX IF NOT EXISTS product_shop_stocks_variant_idx
        ON product_shop_stocks ("productVariantId")
        WHERE "productVariantId" IS NOT NULL;
      `,
      { transaction }
    );

    console.log('📥 Backfilling product_shop_stocks from products (shop-scoped)...');
    await sequelize.query(
      `
      INSERT INTO product_shop_stocks (
        id, "tenantId", "productId", "productVariantId", "shopId", "quantityOnHand", "createdAt", "updatedAt"
      )
      SELECT
        gen_random_uuid(),
        p."tenantId",
        p.id,
        NULL,
        p."shopId",
        COALESCE(p."quantityOnHand", 0),
        NOW(),
        NOW()
      FROM products p
      WHERE p."shopId" IS NOT NULL
        AND COALESCE(p."hasVariants", false) = false
        AND NOT EXISTS (
          SELECT 1 FROM product_shop_stocks s
          WHERE s."tenantId" = p."tenantId"
            AND s."productId" = p.id
            AND s."shopId" = p."shopId"
            AND s."productVariantId" IS NULL
        );
      `,
      { transaction }
    );

    console.log('📥 Backfilling product_shop_stocks from product_variants...');
    await sequelize.query(
      `
      INSERT INTO product_shop_stocks (
        id, "tenantId", "productId", "productVariantId", "shopId", "quantityOnHand", "createdAt", "updatedAt"
      )
      SELECT
        gen_random_uuid(),
        p."tenantId",
        p.id,
        pv.id,
        p."shopId",
        COALESCE(pv."quantityOnHand", 0),
        NOW(),
        NOW()
      FROM product_variants pv
      INNER JOIN products p ON p.id = pv."productId"
      WHERE p."shopId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM product_shop_stocks s
          WHERE s."tenantId" = p."tenantId"
            AND s."productId" = p.id
            AND s."productVariantId" = pv.id
            AND s."shopId" = p."shopId"
        );
      `,
      { transaction }
    );

    await transaction.commit();
    console.log('✅ product_shop_stocks schema + backfill completed successfully!');
  } catch (error) {
    await transaction.rollback();
    console.error('💥 product_shop_stocks migration failed:', error);
    throw error;
  }
};

if (require.main === module) {
  createProductShopStocksAndExpandMovements()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createProductShopStocksAndExpandMovements;
