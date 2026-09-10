const { Op } = require('sequelize');
const { sequelize } = require('../../../config/database');
const { Sale, Invoice, Expense, Tenant, Payment } = require('../../../models');
const {
  computeAlignedProfit,
  isRetailBusinessType,
  roundMoney,
  percentChange,
} = require('../profitFormulas');
const {
  getEqualLengthPriorPeriod,
  resolveAnalysisPeriod,
  countInclusiveDays,
} = require('./dates');
const { applyTenantFilter } = require('../../../utils/tenantUtils');

/**
 * @param {string} tenantId
 * @returns {Promise<{ businessType: string, tenantName: string, isRetail: boolean }>}
 */
async function resolveTenantMeta(tenantId) {
  const tenant = await Tenant.findByPk(tenantId, {
    attributes: ['id', 'businessType', 'name'],
  });
  const businessType = tenant?.businessType || 'printing_press';
  return {
    businessType,
    tenantName: tenant?.name || 'Business',
    isRetail: isRetailBusinessType(businessType),
  };
}

/**
 * Collected revenue for the period — Payment ledger by paymentDate when available.
 * @param {{ tenantId: string, shopFilterId?: string|null, studioLocationFilterId?: string|null }} scope
 * @param {Date} start
 * @param {Date} end
 * @param {boolean} isRetail
 * @returns {Promise<{ revenue: number, saleCount: number }>}
 */
async function fetchRevenue(scope, start, end, isRetail) {
  const { tenantId, shopFilterId, studioLocationFilterId } = scope;
  const hasPayments = await Payment.count({
    where: applyTenantFilter(tenantId, { type: 'income', status: 'completed' }),
  });

  if (hasPayments > 0) {
    const collectedRevenueService = require('../../collectedRevenueService');
    const fakeReq = {
      tenantId,
      shopScoped: Boolean(shopFilterId),
      shopFilterId: shopFilterId || null,
      canAccessAllShops: !shopFilterId,
      studioLocationScoped: Boolean(studioLocationFilterId),
      studioLocationFilterId: studioLocationFilterId || null,
      canAccessAllStudioLocations: !studioLocationFilterId,
    };
    const dateFilter = { [Op.between]: [start, end] };
    const revenueRaw = await collectedRevenueService.sumCollectedRevenue(
      fakeReq,
      dateFilter,
      { mode: isRetail ? 'retail' : 'studio' }
    );
    const periodRows = await collectedRevenueService.getCollectedRevenueByPeriod(
      fakeReq,
      dateFilter,
      'day',
      isRetail ? 'retail' : 'studio'
    );
    const saleCount = (periodRows || []).reduce(
      (sum, row) => sum + (parseInt(row.count, 10) || 0),
      0
    );
    return {
      revenue: roundMoney(revenueRaw),
      saleCount,
    };
  }

  if (isRetail) {
    const where = {
      tenantId,
      status: 'completed',
      createdAt: { [Op.between]: [start, end] },
    };
    if (shopFilterId) where.shopId = shopFilterId;
    const [revenueRaw, saleCount] = await Promise.all([
      Sale.sum('total', { where }) || 0,
      Sale.count({ where }),
    ]);
    return {
      revenue: roundMoney(revenueRaw),
      saleCount: Number(saleCount || 0),
    };
  }

  const invoiceWhere = {
    tenantId,
    status: { [Op.ne]: 'cancelled' },
    amountPaid: { [Op.gt]: 0 },
    [Op.and]: [
      sequelize.where(
        sequelize.fn('COALESCE', sequelize.col('paidDate'), sequelize.col('updatedAt')),
        { [Op.between]: [start, end] }
      ),
    ],
  };
  if (studioLocationFilterId) invoiceWhere.studioLocationId = studioLocationFilterId;
  const [revenueRaw, saleCount] = await Promise.all([
    Invoice.sum('amountPaid', { where: invoiceWhere }) || 0,
    Invoice.count({ where: invoiceWhere }),
  ]);
  return {
    revenue: roundMoney(revenueRaw),
    saleCount: Number(saleCount || 0),
  };
}

/**
 * Operating expenses (approved when available — Expense may not always have approval).
 * Matches assistant / dashboard expense sum by expenseDate.
 * @param {{ tenantId: string, shopFilterId?: string|null, studioLocationFilterId?: string|null }} scope
 * @param {Date} start
 * @param {Date} end
 */
async function fetchOperatingExpenses(scope, start, end) {
  const where = {
    tenantId: scope.tenantId,
    expenseDate: { [Op.between]: [start, end] },
  };
  if (scope.shopFilterId) where.shopId = scope.shopFilterId;
  if (scope.studioLocationFilterId) where.studioLocationId = scope.studioLocationFilterId;
  const raw = (await Expense.sum('amount', { where })) || 0;
  return roundMoney(raw);
}

/**
 * Retail COGS aligned with dashboardController SQL.
 * @param {{ tenantId: string, shopFilterId?: string|null }} scope
 * @param {Date} start
 * @param {Date} end
 */
async function fetchRetailCogs(scope, start, end) {
  const shopClause = scope.shopFilterId ? ' AND s."shopId" = :shopId' : '';
  const rows = await sequelize.query(
    `
    SELECT COALESCE(SUM(si.quantity * COALESCE(pv."costPrice", p."costPrice", 0)), 0) as "cogs"
    FROM sale_items si
    INNER JOIN sales s ON s.id = si."saleId"
    LEFT JOIN products p ON p.id = si."productId"
    LEFT JOIN product_variants pv ON pv.id = si."productVariantId"
    WHERE s."tenantId" = :tenantId
      AND s.status = 'completed'
      AND s."deletedAt" IS NULL
      AND s."createdAt" BETWEEN :start AND :end
      AND COALESCE(p."trackStock", true) != false
      ${shopClause}
    `,
    {
      replacements: {
        tenantId: scope.tenantId,
        start,
        end,
        ...(scope.shopFilterId ? { shopId: scope.shopFilterId } : {}),
      },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  return roundMoney(rows?.[0]?.cogs);
}

/**
 * Period financial snapshot with COGS-aware profit for retail.
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function fetchPeriodSnapshot({
  tenantId,
  shopFilterId = null,
  studioLocationFilterId = null,
  start,
  end,
  label,
  businessType,
  isRetail,
}) {
  const scope = { tenantId, shopFilterId, studioLocationFilterId };
  const [{ revenue, saleCount }, operatingExpenses, cogs] = await Promise.all([
    fetchRevenue(scope, start, end, isRetail),
    fetchOperatingExpenses(scope, start, end),
    isRetail ? fetchRetailCogs(scope, start, end) : Promise.resolve(0),
  ]);

  const aligned = computeAlignedProfit({
    revenue,
    operatingExpenses,
    cogs,
    isRetail,
  });
  const dayCount = countInclusiveDays(start, end);
  const aov = saleCount > 0 ? roundMoney(revenue / saleCount) : 0;

  return {
    label,
    businessType,
    isRetail,
    start: start.toISOString(),
    end: end.toISOString(),
    dayCount,
    saleCount,
    aov,
    revenuePerDay: roundMoney(revenue / dayCount),
    ...aligned,
    // Convenience alias used in templates / UI
    profit: aligned.netProfit,
    expenses: aligned.totalExpenses,
  };
}

/**
 * Sales for today — or the Ask AI selected period when dates/period are provided.
 */
async function getSalesToday(ctx) {
  const meta = await resolveTenantMeta(ctx.tenantId);
  const range = resolveAnalysisPeriod(
    { ...ctx, defaultPeriod: 'today' },
    ctx.now
  );
  const snapshot = await fetchPeriodSnapshot({
    ...ctx,
    ...meta,
    start: range.start,
    end: range.end,
    label: range.label,
  });
  return { period: snapshot };
}

/**
 * Sales this month — or the Ask AI selected period when dates/period are provided.
 */
async function getSalesThisMonth(ctx) {
  const meta = await resolveTenantMeta(ctx.tenantId);
  const range = resolveAnalysisPeriod(
    { ...ctx, defaultPeriod: 'month' },
    ctx.now
  );
  const snapshot = await fetchPeriodSnapshot({
    ...ctx,
    ...meta,
    start: range.start,
    end: range.end,
    label: range.label,
  });
  return { period: snapshot };
}

/**
 * Selected (or this month) vs equal-length prior period.
 */
async function getSalesVsPriorPeriod(ctx) {
  const meta = await resolveTenantMeta(ctx.tenantId);
  const currentRange = resolveAnalysisPeriod(
    { ...ctx, defaultPeriod: 'month' },
    ctx.now
  );
  const priorRange = getEqualLengthPriorPeriod(currentRange.start, currentRange.end);

  const [current, prior] = await Promise.all([
    fetchPeriodSnapshot({
      ...ctx,
      ...meta,
      start: currentRange.start,
      end: currentRange.end,
      label: currentRange.label,
    }),
    fetchPeriodSnapshot({
      ...ctx,
      ...meta,
      start: priorRange.start,
      end: priorRange.end,
      label: priorRange.label,
    }),
  ]);

  return {
    current,
    prior,
    changes: {
      revenuePct: percentChange(current.revenue, prior.revenue),
      profitPct: percentChange(current.profit, prior.profit),
      expensesPct: percentChange(current.expenses, prior.expenses),
      saleCountPct: percentChange(current.saleCount, prior.saleCount),
      aovPct: percentChange(current.aov, prior.aov),
      revenuePerDayPct: percentChange(current.revenuePerDay, prior.revenuePerDay),
    },
  };
}

module.exports = {
  resolveTenantMeta,
  fetchPeriodSnapshot,
  fetchRetailCogs,
  getSalesToday,
  getSalesThisMonth,
  getSalesVsPriorPeriod,
};
