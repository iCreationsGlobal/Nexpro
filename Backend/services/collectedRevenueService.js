/**
 * Cash-collected revenue from the Payment ledger (by paymentDate + amount).
 * Attributes installment payments to the period they were received, so a 2000
 * invoice/sale paid 800 in January and 1200 in September shows Jan 800 + Sep 1200
 * instead of moving the full running total into the final payment month.
 *
 * Falls back to Invoice.amountPaid / Sale.total when the tenant has no income
 * Payment rows (legacy data), matching prior report behaviour.
 */

const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Payment, Invoice, Sale } = require('../models');
const { applyTenantFilter } = require('../utils/tenantUtils');
const { getShopSqlFragment } = require('../utils/shopUtils');
const { getStudioLocationSqlFragment } = require('../utils/studioLocationUtils');
const { scopedReportWhere } = require('../utils/reportScopeUtils');

const hasDateFilter = (dateFilter) =>
  Boolean(dateFilter && (Object.keys(dateFilter).length > 0 || dateFilter[Op.between] !== undefined));

/**
 * @param {string} tenantId
 * @returns {Promise<boolean>}
 */
async function tenantHasIncomePayments(tenantId) {
  const count = await Payment.count({
    where: applyTenantFilter(tenantId, { type: 'income', status: 'completed' }),
  });
  return count > 0;
}

/**
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 * @returns {{ sql: string, replacements: Object, hasDate: boolean }}
 */
function buildPaymentDateClause(dateFilter) {
  const hasDate = hasDateFilter(dateFilter);
  if (!hasDate) {
    return { sql: '', replacements: {}, hasDate: false };
  }
  return {
    sql: ' AND p."paymentDate" BETWEEN :startDate AND :endDate',
    replacements: {
      startDate: dateFilter[Op.between][0],
      endDate: dateFilter[Op.between][1],
    },
    hasDate: true,
  };
}

/**
 * Scope income payments for studio (invoice/job location) or retail (sale shop).
 * Unscoped: all completed income payments for the tenant.
 * @param {import('express').Request} req
 * @param {'studio'|'retail'} mode
 */
function buildPaymentScopeSql(req, mode) {
  if (mode === 'retail') {
    const shopFrag = getShopSqlFragment(req, 's');
    const shopScoped =
      req.shopScoped &&
      (Boolean(req.shopFilterId) ||
        (!req.canAccessAllShops && Array.isArray(req.allowedShopIds) && req.allowedShopIds.length > 0));

    if (shopScoped) {
      return {
        joinSql: `
          INNER JOIN sales s ON s."tenantId" = p."tenantId"
            AND s."deletedAt" IS NULL
            AND s.status NOT IN ('cancelled', 'refunded')
            AND (
              p.description = CONCAT('sale:', s.id::text)
              OR p.description LIKE CONCAT('sale:', s.id::text, '%')
            )
        `,
        whereSql: shopFrag.sql,
        replacements: shopFrag.replacements,
      };
    }

    // Tenant-wide retail: sale-linked, dealer settlements, and other income (POS tender / manual).
    return {
      joinSql: '',
      whereSql: '',
      replacements: {},
    };
  }

  // Studio location scope — only payments tied to in-scope invoices or jobs.
  const studioFrag = getStudioLocationSqlFragment(req, 'i');
  const jobStudioFrag = getStudioLocationSqlFragment(req, 'j');
  const locationScoped =
    req.studioLocationScoped &&
    (Boolean(req.studioLocationFilterId) ||
      (!req.canAccessAllStudioLocations &&
        Array.isArray(req.allowedStudioLocationIds) &&
        req.allowedStudioLocationIds.length > 0));

  if (!locationScoped) {
    return { joinSql: '', whereSql: '', replacements: {} };
  }

  return {
    joinSql: '',
    whereSql: `
      AND (
        EXISTS (
          SELECT 1 FROM invoices i
          WHERE i."tenantId" = p."tenantId"
            AND i.status != 'cancelled'
            AND (
              p.description = CONCAT('invoice:', i.id::text)
              OR p.description LIKE CONCAT('invoice:', i.id::text, '%')
            )
            ${studioFrag.sql}
        )
        OR (
          p."jobId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM jobs j
            WHERE j.id = p."jobId"
              AND j."tenantId" = p."tenantId"
              ${jobStudioFrag.sql}
          )
        )
      )
    `,
    replacements: { ...studioFrag.replacements, ...jobStudioFrag.replacements },
  };
}

/**
 * Invoice fallback (legacy / no Payment rows): running amountPaid by paidDate/updatedAt.
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 */
async function sumStudioInvoiceFallback(req, dateFilter = {}) {
  const where = scopedReportWhere(req, {
    status: { [Op.ne]: 'cancelled' },
    amountPaid: { [Op.gt]: 0 },
  });
  if (hasDateFilter(dateFilter)) {
    where[Op.and] = [
      sequelize.where(
        sequelize.fn('COALESCE', sequelize.col('Invoice.paidDate'), sequelize.col('Invoice.updatedAt')),
        { [Op.between]: dateFilter[Op.between] }
      ),
    ];
  }
  return parseFloat((await Invoice.sum('amountPaid', { where })) || 0);
}

/**
 * Retail fallback: completed Sale.total by createdAt (prior revenue behaviour).
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 * @param {'total'|'amountPaid'} field
 */
async function sumRetailSaleFallback(req, dateFilter = {}, field = 'total') {
  const { applyShopFilter } = require('../utils/shopUtils');
  const where = applyShopFilter(
    req,
    applyTenantFilter(req.tenantId, {
      status: 'completed',
      deletedAt: null,
      ...(hasDateFilter(dateFilter) && { createdAt: dateFilter }),
    })
  );
  return parseFloat((await Sale.sum(field, { where })) || 0);
}

/**
 * Sum collected cash from Payment ledger for the period.
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 * @param {'studio'|'retail'} mode
 * @returns {Promise<number>}
 */
async function sumFromPaymentLedger(req, dateFilter, mode) {
  const dateClause = buildPaymentDateClause(dateFilter);
  const scope = buildPaymentScopeSql(req, mode);
  const rows = await sequelize.query(
    `
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM payments p
      ${scope.joinSql}
      WHERE p."tenantId" = :tenantId
        AND p.type = 'income'
        AND p.status = 'completed'
        ${dateClause.sql}
        ${scope.whereSql}
    `,
    {
      replacements: {
        tenantId: req.tenantId,
        ...dateClause.replacements,
        ...scope.replacements,
      },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  let total = parseFloat(rows?.[0]?.total || 0);

  // Retail legacy gap: older POS tenders updated Sale.amountPaid without a Payment row.
  // Include those once, attributed by sale createdAt, so enabling the ledger for installments
  // does not zero-out historical cash POS revenue.
  if (mode === 'retail') {
    const shopFrag = getShopSqlFragment(req, 's');
    const saleDateSql = hasDateFilter(dateFilter)
      ? 'AND s."createdAt" BETWEEN :startDate AND :endDate'
      : '';
    const orphanRows = await sequelize.query(
      `
        SELECT COALESCE(SUM(
          CASE
            WHEN s."amountPaid" > s.total THEN s.total
            ELSE s."amountPaid"
          END
        ), 0) AS total
        FROM sales s
        WHERE s."tenantId" = :tenantId
          AND s."deletedAt" IS NULL
          AND s.status NOT IN ('cancelled', 'refunded')
          AND s."amountPaid" > 0
          AND NOT EXISTS (
            SELECT 1 FROM payments p
            WHERE p."tenantId" = s."tenantId"
              AND p.type = 'income'
              AND p.status = 'completed'
              AND (
                p.description = CONCAT('sale:', s.id::text)
                OR p.description LIKE CONCAT('sale:', s.id::text, '%')
              )
          )
          ${saleDateSql}
          ${shopFrag.sql}
      `,
      {
        replacements: {
          tenantId: req.tenantId,
          ...(hasDateFilter(dateFilter)
            ? {
                startDate: dateFilter[Op.between][0],
                endDate: dateFilter[Op.between][1],
              }
            : {}),
          ...shopFrag.replacements,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    total += parseFloat(orphanRows?.[0]?.total || 0);
  }

  return total;
}

/**
 * @param {import('express').Request} req
 * @param {Object} [dateFilter]
 * @param {{ mode: 'studio'|'retail', fallbackField?: 'total'|'amountPaid' }} options
 * @returns {Promise<number>}
 */
async function sumCollectedRevenue(req, dateFilter = {}, options = {}) {
  const mode = options.mode || 'studio';
  const fallbackField = options.fallbackField || (mode === 'retail' ? 'total' : 'amountPaid');

  if (await tenantHasIncomePayments(req.tenantId)) {
    return sumFromPaymentLedger(req, dateFilter, mode);
  }

  if (mode === 'retail') {
    return sumRetailSaleFallback(req, dateFilter, fallbackField);
  }
  return sumStudioInvoiceFallback(req, dateFilter);
}

/**
 * Period breakdown of collected payments (hour / week / month / day).
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 * @param {string} groupBy
 * @param {'studio'|'retail'} mode
 */
async function getCollectedRevenueByPeriod(req, dateFilter = {}, groupBy = 'day', mode = 'studio') {
  if (!(await tenantHasIncomePayments(req.tenantId))) {
    return null; // caller should use legacy Sale/Invoice period queries
  }

  const dateClause = buildPaymentDateClause(dateFilter);
  const scope = buildPaymentScopeSql(req, mode);
  const replacements = {
    tenantId: req.tenantId,
    ...dateClause.replacements,
    ...scope.replacements,
  };

  if (groupBy === 'hour') {
    return sequelize.query(
      `
        SELECT FLOOR(EXTRACT(HOUR FROM p."paymentDate")/2)*2 AS "hour",
               SUM(p.amount) AS "totalRevenue",
               COUNT(p.id) AS "count"
        FROM payments p
        ${scope.joinSql}
        WHERE p."tenantId" = :tenantId
          AND p.type = 'income'
          AND p.status = 'completed'
          ${dateClause.sql}
          ${scope.whereSql}
        GROUP BY 1 ORDER BY 1
      `,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );
  }

  if (groupBy === 'week') {
    return sequelize.query(
      `
        SELECT FLOOR((EXTRACT(DAY FROM p."paymentDate") - 1) / 7) + 1 AS "week",
               DATE_TRUNC('month', p."paymentDate") AS "month",
               SUM(p.amount) AS "totalRevenue",
               COUNT(p.id) AS "count"
        FROM payments p
        ${scope.joinSql}
        WHERE p."tenantId" = :tenantId
          AND p.type = 'income'
          AND p.status = 'completed'
          ${dateClause.sql}
          ${scope.whereSql}
        GROUP BY 1, 2 ORDER BY 2, 1
      `,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );
  }

  if (groupBy === 'month') {
    return sequelize.query(
      `
        SELECT EXTRACT(MONTH FROM p."paymentDate") AS "month",
               EXTRACT(YEAR FROM p."paymentDate") AS "year",
               SUM(p.amount) AS "totalRevenue",
               COUNT(p.id) AS "count"
        FROM payments p
        ${scope.joinSql}
        WHERE p."tenantId" = :tenantId
          AND p.type = 'income'
          AND p.status = 'completed'
          ${dateClause.sql}
          ${scope.whereSql}
        GROUP BY 1, 2 ORDER BY 2, 1
      `,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );
  }

  return sequelize.query(
    `
      SELECT CAST(p."paymentDate" AS DATE) AS "date",
             SUM(p.amount) AS "totalRevenue",
             COUNT(p.id) AS "count"
      FROM payments p
      ${scope.joinSql}
      WHERE p."tenantId" = :tenantId
        AND p.type = 'income'
        AND p.status = 'completed'
        ${dateClause.sql}
        ${scope.whereSql}
      GROUP BY 1 ORDER BY 1
    `,
    { replacements, type: sequelize.QueryTypes.SELECT }
  );
}

/**
 * Top customers by collected payment amount.
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 * @param {number} limit
 * @param {'studio'|'retail'} mode
 */
async function getCollectedRevenueByCustomer(req, dateFilter = {}, limit = 20, mode = 'studio') {
  if (!(await tenantHasIncomePayments(req.tenantId))) {
    return null;
  }

  const dateClause = buildPaymentDateClause(dateFilter);
  const scope = buildPaymentScopeSql(req, mode);
  const rows = await sequelize.query(
    `
      SELECT p."customerId" AS "customerId",
             SUM(p.amount) AS "totalRevenue",
             COUNT(p.id) AS "paymentCount",
             c.id AS "customer.id",
             c.name AS "customer.name",
             c.company AS "customer.company"
      FROM payments p
      ${scope.joinSql}
      LEFT JOIN customers c ON c.id = p."customerId"
      WHERE p."tenantId" = :tenantId
        AND p.type = 'income'
        AND p.status = 'completed'
        AND p."customerId" IS NOT NULL
        ${dateClause.sql}
        ${scope.whereSql}
      GROUP BY p."customerId", c.id, c.name, c.company
      ORDER BY SUM(p.amount) DESC
      LIMIT :limit
    `,
    {
      replacements: {
        tenantId: req.tenantId,
        limit,
        ...dateClause.replacements,
        ...scope.replacements,
      },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return (rows || []).map((row) => ({
    customerId: row.customerId,
    totalRevenue: parseFloat(row.totalRevenue || 0),
    paymentCount: parseInt(row.paymentCount, 10) || 0,
    customer: row['customer.id']
      ? {
          id: row['customer.id'],
          name: row['customer.name'],
          company: row['customer.company'],
        }
      : null,
  }));
}

/**
 * Dashboard helper: sum collections in a fixed date window (and optional prev window).
 * @param {import('express').Request} req
 * @param {{ tenantId: string, monthStart: Date, monthEnd: Date, todayStart?: Date, todayEnd?: Date, weekStart?: Date, weekEnd?: Date, filterStart?: Date, filterEnd?: Date, prevStart?: Date, prevEnd?: Date, hasDateFilter?: boolean, prevPeriod?: boolean }} bounds
 * @param {'studio'|'retail'} mode
 */
async function sumCollectedRevenueWindows(req, bounds, mode) {
  if (!(await tenantHasIncomePayments(bounds.tenantId || req.tenantId))) {
    return null;
  }

  const scope = buildPaymentScopeSql(req, mode);
  const rows = await sequelize.query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN p."paymentDate" BETWEEN :monthStart AND :monthEnd THEN p.amount ELSE 0 END), 0) AS "monthRevenue",
        COALESCE(SUM(CASE WHEN p."paymentDate" BETWEEN :todayStart AND :todayEnd THEN p.amount ELSE 0 END), 0) AS "todayRevenue",
        COALESCE(SUM(CASE WHEN p."paymentDate" BETWEEN :weekStart AND :weekEnd THEN p.amount ELSE 0 END), 0) AS "weekRevenue",
        COALESCE(SUM(p.amount), 0) AS "totalRevenue"
        ${bounds.hasDateFilter ? `,COALESCE(SUM(CASE WHEN p."paymentDate" BETWEEN :filterStart AND :filterEnd THEN p.amount ELSE 0 END), 0) AS "filteredRevenue"` : ''}
        ${bounds.prevPeriod ? `,COALESCE(SUM(CASE WHEN p."paymentDate" BETWEEN :prevStart AND :prevEnd THEN p.amount ELSE 0 END), 0) AS "prevRevenue"` : ''}
      FROM payments p
      ${scope.joinSql}
      WHERE p."tenantId" = :tenantId
        AND p.type = 'income'
        AND p.status = 'completed'
        ${scope.whereSql}
    `,
    {
      replacements: {
        tenantId: bounds.tenantId || req.tenantId,
        monthStart: bounds.monthStart,
        monthEnd: bounds.monthEnd,
        todayStart: bounds.todayStart || bounds.monthStart,
        todayEnd: bounds.todayEnd || bounds.monthEnd,
        weekStart: bounds.weekStart || bounds.monthStart,
        weekEnd: bounds.weekEnd || bounds.monthEnd,
        ...(bounds.hasDateFilter
          ? { filterStart: bounds.filterStart, filterEnd: bounds.filterEnd }
          : {}),
        ...(bounds.prevPeriod ? { prevStart: bounds.prevStart, prevEnd: bounds.prevEnd } : {}),
        ...scope.replacements,
      },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return rows?.[0] || null;
}

module.exports = {
  hasDateFilter,
  tenantHasIncomePayments,
  sumCollectedRevenue,
  getCollectedRevenueByPeriod,
  getCollectedRevenueByCustomer,
  sumCollectedRevenueWindows,
  sumStudioInvoiceFallback,
  sumRetailSaleFallback,
};
