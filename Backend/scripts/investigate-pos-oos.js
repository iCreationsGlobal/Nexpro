#!/usr/bin/env node
/**
 * Read-only POS "Out of Stock" investigation. Does not UPDATE/INSERT/DELETE.
 *
 * On Contabo:
 *   cd ~/nexpro/Backend && node scripts/investigate-pos-oos.js
 *
 * Or paste the same file to /tmp if this path is not on the VPS yet.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

const redactUrl = (url) => {
  if (!url) return '(missing DATABASE_URL)';
  try {
    const u = new URL(url.replace(/^postgresql:/, 'postgres:'));
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname} ssl=${u.searchParams.get('sslmode') || 'default'}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
};

const rows = (result) => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
};

const printSection = (title, data) => {
  console.log(`\n======== ${title} ========`);
  if (!data || (Array.isArray(data) && data.length === 0)) {
    console.log('(no rows)');
    return;
  }
  console.log(JSON.stringify(data, null, 2));
};

const run = async () => {
  await sequelize.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');

  console.log('DB', redactUrl(process.env.DATABASE_URL));
  if (String(process.env.DATABASE_URL || '').includes('dry-wildflower')) {
    console.log('WARNING: this looks like the DEMO database, not production.');
  }

  const table = rows(await sequelize.query(`
    SELECT to_regclass('public.product_shop_stocks') AS shop_stock_table
  `));
  printSection('1. product_shop_stocks table', table);

  printSection('2. Active tracked products (catalog qty)', rows(await sequelize.query(`
    SELECT
      COUNT(*)::int AS products,
      COUNT(*) FILTER (WHERE COALESCE("hasVariants", false) = false)::int AS simple,
      COUNT(*) FILTER (WHERE COALESCE("hasVariants", false) = true)::int AS variant_parents,
      COUNT(*) FILTER (WHERE COALESCE("quantityOnHand", 0) > 0)::int AS catalog_gt_0,
      COUNT(*) FILTER (WHERE COALESCE("quantityOnHand", 0) <= 0)::int AS catalog_lte_0,
      COUNT(*) FILTER (WHERE COALESCE("trackStock", true) = true)::int AS tracking
    FROM products
    WHERE COALESCE("isActive", true) = true
  `)));

  if (table[0]?.shop_stock_table) {
    printSection('3. product_shop_stocks totals (all rows)', rows(await sequelize.query(`
      SELECT
        COUNT(*)::int AS rows,
        COUNT(*) FILTER (WHERE "quantityOnHand" > 0)::int AS qty_gt_0,
        COUNT(*) FILTER (WHERE "quantityOnHand" = 0)::int AS qty_eq_0,
        COUNT(*) FILTER (WHERE "productVariantId" IS NULL)::int AS parent_rows,
        COUNT(*) FILTER (WHERE "productVariantId" IS NOT NULL)::int AS variant_rows,
        ROUND(COALESCE(SUM("quantityOnHand"), 0)::numeric, 2) AS sum_qty,
        COUNT(DISTINCT "tenantId")::int AS tenants
      FROM product_shop_stocks
    `)));

    printSection('4. Simple products: catalog vs shop stock (POS overlay source)', rows(await sequelize.query(`
      SELECT
        COUNT(*)::int AS simple_active,
        COUNT(*) FILTER (WHERE COALESCE(p."quantityOnHand", 0) > 0)::int AS catalog_in_stock,
        COUNT(*) FILTER (WHERE pss.id IS NULL)::int AS no_shop_row,
        COUNT(*) FILTER (WHERE pss.id IS NOT NULL AND COALESCE(pss."quantityOnHand", 0) > 0)::int AS shop_in_stock,
        COUNT(*) FILTER (WHERE pss.id IS NOT NULL AND COALESCE(pss."quantityOnHand", 0) <= 0)::int AS shop_zero,
        COUNT(*) FILTER (
          WHERE COALESCE(p."quantityOnHand", 0) > 0
            AND (pss.id IS NULL OR COALESCE(pss."quantityOnHand", 0) <= 0)
        )::int AS catalog_has_stock_shop_missing_or_zero
      FROM products p
      LEFT JOIN LATERAL (
        SELECT s.id, s."quantityOnHand"
        FROM product_shop_stocks s
        WHERE s."productId" = p.id
          AND s."productVariantId" IS NULL
          AND (p."shopId" IS NULL OR s."shopId" = p."shopId")
        ORDER BY s."quantityOnHand" DESC NULLS LAST
        LIMIT 1
      ) pss ON true
      WHERE COALESCE(p."isActive", true) = true
        AND COALESCE(p."trackStock", true) = true
        AND COALESCE(p."hasVariants", false) = false
    `)));
  } else {
    console.log('\nproduct_shop_stocks does not exist — POS overlay cannot run.');
  }

  printSection('5. Tenants with the most catalog-in-stock vs shop-zero simple products', rows(await sequelize.query(`
    SELECT
      t.name AS tenant,
      t."businessType",
      COUNT(*)::int AS simple_active,
      COUNT(*) FILTER (WHERE COALESCE(p."quantityOnHand", 0) > 0)::int AS catalog_in_stock,
      COUNT(*) FILTER (WHERE pss.id IS NOT NULL AND COALESCE(pss."quantityOnHand", 0) > 0)::int AS shop_in_stock,
      COUNT(*) FILTER (
        WHERE COALESCE(p."quantityOnHand", 0) > 0
          AND (pss.id IS NULL OR COALESCE(pss."quantityOnHand", 0) <= 0)
      )::int AS catalog_yes_shop_no
    FROM products p
    JOIN tenants t ON t.id = p."tenantId"
    LEFT JOIN LATERAL (
      SELECT s.id, s."quantityOnHand"
      FROM product_shop_stocks s
      WHERE s."productId" = p.id
        AND s."productVariantId" IS NULL
        AND (p."shopId" IS NULL OR s."shopId" = p."shopId")
      ORDER BY s."quantityOnHand" DESC NULLS LAST
      LIMIT 1
    ) pss ON true
    WHERE COALESCE(p."isActive", true) = true
      AND COALESCE(p."trackStock", true) = true
      AND COALESCE(p."hasVariants", false) = false
    GROUP BY t.id, t.name, t."businessType"
    HAVING COUNT(*) FILTER (WHERE COALESCE(p."quantityOnHand", 0) > 0) > 0
    ORDER BY catalog_yes_shop_no DESC, catalog_in_stock DESC
    LIMIT 25
  `)));

  printSection('6. Sample SKUs (do not change these — read only)', rows(await sequelize.query(`
    SELECT
      t.name AS tenant,
      t."businessType",
      p.name AS product,
      p."hasVariants",
      p."quantityOnHand" AS catalog_qty,
      pss."quantityOnHand" AS home_shop_qty,
      (
        SELECT COUNT(*)::int
        FROM product_variants pv
        WHERE pv."productId" = p.id
          AND COALESCE(pv."isActive", true) = true
      ) AS active_variant_rows,
      p."shopId" IS NOT NULL AS has_home_shop
    FROM products p
    JOIN tenants t ON t.id = p."tenantId"
    LEFT JOIN LATERAL (
      SELECT s."quantityOnHand"
      FROM product_shop_stocks s
      WHERE s."productId" = p.id
        AND s."productVariantId" IS NULL
        AND (p."shopId" IS NULL OR s."shopId" = p."shopId")
      ORDER BY s."quantityOnHand" DESC NULLS LAST
      LIMIT 1
    ) pss ON true
    WHERE COALESCE(p."isActive", true) = true
      AND COALESCE(p."trackStock", true) = true
      AND COALESCE(p."quantityOnHand", 0) > 0
      AND COALESCE(p."hasVariants", false) = false
    ORDER BY p."updatedAt" DESC
    LIMIT 20
  `)));

  printSection('7. How to read this', [
    {
      if_shop_stock_gt_0_but_pos_oos:
        'Code bug: POS includes variants:[], old API summed [] and wiped qty to 0. Deploy API commit 268817e (do not UPDATE quantities).',
      if_catalog_gt_0_and_shop_stock_0:
        'Data split: Products table uses catalog qty; POS overlays shop rows of 0. Find why shop rows were created at 0.',
      if_both_0:
        'Catalog really has no stock. Products page would also show 0.',
    },
  ]);
};

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
