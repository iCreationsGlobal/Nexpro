const { sequelize } = require('../config/database');
const { Job, Expense, Customer, Vendor, Invoice, JobItem, Lead, Sale, SaleItem, Product, ProductVariant, Prescription, PrescriptionItem, Drug, MaterialMovement, MaterialItem, Payment } = require('../models');
const { Op } = require('sequelize');
const { applyTenantFilter } = require('../utils/tenantUtils');
const { applyShopFilter, getShopSqlFragment } = require('../utils/shopUtils');
const {
  scopedReportWhere,
  jobScopeSqlFragment,
  documentScopeSqlFragment,
} = require('../utils/reportScopeUtils');
const { resolveBusinessType } = require('../config/businessTypes');
const { classifyAiProviderError, AI_PROVIDER_USER_MESSAGES } = require('../utils/aiProviderErrors');
const collectedRevenueService = require('../services/collectedRevenueService');

/** Tenant + active shop filter for retail reports. */
const scopedRetailWhere = (req, extra = {}) =>
  applyShopFilter(req, applyTenantFilter(req.tenantId, extra));

const isRetailBusiness = (req) => {
  const resolved = resolveBusinessType(req.tenant?.businessType);
  return resolved === 'shop' || resolved === 'pharmacy';
};

const isStudioBusiness = (req) =>
  resolveBusinessType(req.tenant?.businessType) === 'studio';

const invoiceDocumentSqlFragment = (req, tableAlias = '') =>
  documentScopeSqlFragment(req, tableAlias);

const scopedSaleWhere = (req, dateFilter = {}) =>
  scopedRetailWhere(req, {
    // Completed only — excludes cancelled/refunded. POS returns set status to `refunded` when
    // fully returned (SaleReturn records), so revenue is not double-counted. Partial returns keep
    // status `completed`; netting partial refund amounts in reports is a follow-up.
    status: 'completed',
    // Sale isn't paranoid — exclude manager/staff soft-deleted sales from every revenue/COGS/VAT total.
    deletedAt: null,
    ...(hasDateFilter(dateFilter) && { createdAt: dateFilter })
  });

/**
 * Collected revenue for shop/pharmacy: Payment ledger by paymentDate when available
 * (installments land in the month received). Falls back to Sale.total by createdAt.
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 */
const getRetailRevenueTotal = async (req, dateFilter = {}) =>
  collectedRevenueService.sumCollectedRevenue(req, dateFilter, {
    mode: 'retail',
    fallbackField: 'total',
  });

const getRetailCogsTotal = async (req, dateFilter = {}) => {
  if (!isRetailBusiness(req)) return 0;

  const saleItems = await SaleItem.findAll({
    attributes: ['quantity'],
    include: [
      {
        model: Sale,
        as: 'sale',
        attributes: [],
        required: true,
        where: scopedSaleWhere(req, dateFilter)
      },
      {
        model: Product,
        as: 'product',
        attributes: ['costPrice', 'trackStock'],
        required: false
      },
      {
        model: ProductVariant,
        as: 'variant',
        attributes: ['costPrice'],
        required: false
      }
    ]
  });

  // Exclude items whose product has trackStock=false so this total matches dashboardController's
  // COGS query (COALESCE(p."trackStock", true) != false). Keeps Dashboard vs Reports COGS aligned.
  return saleItems.reduce((sum, item) => {
    if (item.product?.trackStock === false) return sum;
    const quantity = parseFloat(item.quantity || 0) || 0;
    const unitCost = parseFloat(item.variant?.costPrice ?? item.product?.costPrice ?? 0) || 0;
    return sum + (quantity * unitCost);
  }, 0);
};

/**
 * POS revenue grouped by period for trend charts.
 * Prefers Payment ledger by paymentDate when available.
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 * @param {string} groupBy
 */
const getRetailRevenueByPeriod = async (req, dateFilter = {}, groupBy = 'day') => {
  const fromPayments = await collectedRevenueService.getCollectedRevenueByPeriod(
    req,
    dateFilter,
    groupBy,
    'retail'
  );
  if (fromPayments) return fromPayments;

  const hasDate = hasDateFilter(dateFilter);
  const shopFrag = getShopSqlFragment(req, '');
  const replacements = {
    tenantId: req.tenantId,
    ...(hasDate && {
      startDate: dateFilter[Op.between][0],
      endDate: dateFilter[Op.between][1]
    }),
    ...shopFrag.replacements
  };
  const dateClause = hasDate ? 'AND "createdAt" BETWEEN :startDate AND :endDate' : '';

  if (groupBy === 'hour') {
    return sequelize.query(
      `SELECT FLOOR(EXTRACT(HOUR FROM "createdAt")/2)*2 as "hour", SUM("total") as "totalRevenue", COUNT("id") as "count"
       FROM "sales" WHERE "tenantId"=:tenantId AND status='completed' AND "total" > 0 ${dateClause}${shopFrag.sql}
       GROUP BY 1 ORDER BY 1`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );
  }
  if (groupBy === 'week') {
    return sequelize.query(
      `SELECT FLOOR((EXTRACT(DAY FROM "createdAt") - 1) / 7) + 1 as "week", DATE_TRUNC('month', "createdAt") as "month",
              SUM("total") as "totalRevenue", COUNT("id") as "count"
       FROM "sales" WHERE "tenantId"=:tenantId AND status='completed' AND "total" > 0 ${dateClause}${shopFrag.sql}
       GROUP BY 1, 2 ORDER BY 2, 1`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );
  }
  if (groupBy === 'month') {
    return sequelize.query(
      `SELECT EXTRACT(MONTH FROM "createdAt") as "month", EXTRACT(YEAR FROM "createdAt") as "year",
              SUM("total") as "totalRevenue", COUNT("id") as "count"
       FROM "sales" WHERE "tenantId"=:tenantId AND status='completed' AND "total" > 0 ${dateClause}${shopFrag.sql}
       GROUP BY 1, 2 ORDER BY 2, 1`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );
  }

  return Sale.findAll({
    attributes: [
      [sequelize.literal('CAST("createdAt" AS DATE)'), 'date'],
      [sequelize.fn('SUM', sequelize.col('total')), 'totalRevenue'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    where: scopedSaleWhere(req, dateFilter),
    group: [sequelize.literal('CAST("createdAt" AS DATE)')],
    order: [[sequelize.literal('CAST("createdAt" AS DATE)'), 'ASC']],
    raw: true
  });
};

/**
 * Invoice revenue for studio types; POS revenue for shop/pharmacy.
 * Uses Payment ledger by paymentDate when available (correct installment attribution).
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 */
const resolveOverviewRevenueTotal = async (req, dateFilter = {}) => {
  if (isRetailBusiness(req)) {
    return getRetailRevenueTotal(req, dateFilter);
  }
  return collectedRevenueService.sumCollectedRevenue(req, dateFilter, { mode: 'studio' });
};
const config = require('../config/config');
const accountingReportService = require('../services/accountingReportService');
const { buildDateFilterFromQuery, parseReportDateRange } = require('../utils/reportDateFilter');

// Debug logging: no-op in production to avoid hot-path I/O
const logReport = (...args) => {
  if (config.nodeEnv === 'development') {
    console.log(...args);
  }
};
const logReportError = (...args) => {
  if (config.nodeEnv === 'development') {
    console.error(...args);
  }
};

// Helper function to check if dateFilter has content (Op.between is a Symbol, so Object.keys() won't include it)
const hasDateFilter = (dateFilter) => {
  return dateFilter && (Object.keys(dateFilter).length > 0 || dateFilter[Op.between] !== undefined);
};

/** Inclusive local-day range from query startDate/endDate (YYYY-MM-DD). */
const resolveDateFilterFromQuery = (query = {}) => buildDateFilterFromQuery(query);

/** Invoice collection date (qualified for joins with customers). */
const invoicePaidAtExpr = () =>
  sequelize.fn('COALESCE', sequelize.col('Invoice.paidDate'), sequelize.col('Invoice.updatedAt'));

const INVOICE_PAID_AT_LITERAL = 'COALESCE("Invoice"."paidDate", "Invoice"."updatedAt")';

const buildCollectedRevenueWhere = (reqOrTenantId, dateFilter = null) => {
  const isReq = reqOrTenantId && typeof reqOrTenantId === 'object' && reqOrTenantId.tenantId;
  const where = isReq
    ? scopedReportWhere(reqOrTenantId, {
        status: { [Op.ne]: 'cancelled' },
        amountPaid: { [Op.gt]: 0 },
      })
    : applyTenantFilter(reqOrTenantId, {
        status: { [Op.ne]: 'cancelled' },
        amountPaid: { [Op.gt]: 0 },
      });

  if (hasDateFilter(dateFilter)) {
    const periodFilter = dateFilter[Op.between];
    where[Op.and] = [
      sequelize.where(invoicePaidAtExpr(), { [Op.between]: periodFilter }),
    ];
  }

  return where;
};

const buildOutstandingInvoiceWhere = (req, dateFilter = null, extra = {}) =>
  scopedReportWhere(req, {
    status: { [Op.in]: ['sent', 'partial', 'overdue'] },
    balance: { [Op.gt]: 0 },
    ...extra,
    ...(hasDateFilter(dateFilter) && { invoiceDate: dateFilter }),
  });

/**
 * Top customers by POS revenue for shop/pharmacy revenue reports.
 * Prefers Payment ledger collections when available.
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 * @param {number} [limit]
 */
const getRetailRevenueByCustomer = async (req, dateFilter = {}, limit = 20) => {
  const fromPayments = await collectedRevenueService.getCollectedRevenueByCustomer(
    req,
    dateFilter,
    limit,
    'retail'
  );
  if (fromPayments) return fromPayments;

  const rows = await Sale.findAll({
    attributes: [
      'customerId',
      [sequelize.fn('SUM', sequelize.col('Sale.total')), 'totalRevenue'],
      [sequelize.fn('COUNT', sequelize.col('Sale.id')), 'paymentCount']
    ],
    where: scopedSaleWhere(req, dateFilter),
    include: [{
      model: Customer,
      as: 'customer',
      attributes: ['id', 'name', 'company'],
      required: false
    }],
    group: ['customerId', 'customer.id'],
    order: [[sequelize.fn('SUM', sequelize.col('Sale.total')), 'DESC']],
    limit,
    subQuery: false
  });
  return rows.filter((row) => row.customerId);
};

// @desc    Get revenue report
// @route   GET /api/reports/revenue
// @access  Private
exports.getRevenueReport = async (req, res, next) => {
  try {
    logReport('[Revenue Report] Starting revenue report generation');
    logReport('[Revenue Report] Tenant ID:', req.tenantId);
    const { startDate, endDate, groupBy = 'day' } = req.query;
    logReport('[Revenue Report] Query params:', { startDate, endDate, groupBy });
    
    const dateFilter = resolveDateFilterFromQuery(req.query);
    if (hasDateFilter(dateFilter)) {
      const [start, end] = dateFilter[Op.between];
      logReport('[Revenue Report] Date filter applied:', { start, end });
    } else {
      logReport('[Revenue Report] No date filter - fetching all data');
    }

    const hasDateFilterValue = hasDateFilter(dateFilter);

    if (isRetailBusiness(req)) {
      const [byPeriod, byCustomer, totalRevenue] = await Promise.all([
        getRetailRevenueByPeriod(req, dateFilter, groupBy),
        getRetailRevenueByCustomer(req, dateFilter),
        getRetailRevenueTotal(req, dateFilter)
      ]);

      return res.status(200).json({
        success: true,
        data: {
          totalRevenue,
          byPeriod,
          byCustomer,
          byMethod: [],
          revenueSource: 'payments'
        }
      });
    }

    const revWhere = buildCollectedRevenueWhere(req, dateFilter);
    const studioFrag = invoiceDocumentSqlFragment(req);

    const getRevenueByPeriod = async () => {
      const fromPayments = await collectedRevenueService.getCollectedRevenueByPeriod(
        req,
        dateFilter,
        groupBy,
        'studio'
      );
      if (fromPayments) return fromPayments;

      if (groupBy === 'hour') {
        return sequelize.query(
          `SELECT FLOOR(EXTRACT(HOUR FROM COALESCE("paidDate", "updatedAt"))/2)*2 as "hour", SUM("amountPaid") as "totalRevenue", COUNT("id") as "count" FROM "invoices" WHERE "tenantId"=:tenantId AND status!='cancelled' AND "amountPaid" > 0 ${hasDateFilterValue ? 'AND COALESCE("paidDate", "updatedAt") BETWEEN :startDate AND :endDate' : ''}${studioFrag.sql} GROUP BY 1 ORDER BY 1`,
          { replacements: { tenantId: req.tenantId, ...(hasDateFilterValue && { startDate: dateFilter[Op.between][0], endDate: dateFilter[Op.between][1] }), ...studioFrag.replacements }, type: sequelize.QueryTypes.SELECT }
        );
      }
      if (groupBy === 'week') {
        // Week of month: 1 = days 1-7, 2 = 8-14, 3 = 15-21, 4 = 22-28, 5 = 29-31 (calendar-aligned, not ISO week)
        return sequelize.query(
          `SELECT FLOOR((EXTRACT(DAY FROM COALESCE("paidDate", "updatedAt")) - 1) / 7) + 1 as "week", DATE_TRUNC('month', COALESCE("paidDate", "updatedAt")) as "month", SUM("amountPaid") as "totalRevenue", COUNT("id") as "count" FROM "invoices" WHERE "tenantId"=:tenantId AND status!='cancelled' AND "amountPaid" > 0 ${hasDateFilterValue ? 'AND COALESCE("paidDate", "updatedAt") BETWEEN :startDate AND :endDate' : ''}${studioFrag.sql} GROUP BY 1, 2 ORDER BY 2, 1`,
          { replacements: { tenantId: req.tenantId, ...(hasDateFilterValue && { startDate: dateFilter[Op.between][0], endDate: dateFilter[Op.between][1] }), ...studioFrag.replacements }, type: sequelize.QueryTypes.SELECT }
        );
      }
      return Invoice.findAll({
        attributes: groupBy === 'month'
          ? [[sequelize.fn('EXTRACT', sequelize.literal(`MONTH FROM ${INVOICE_PAID_AT_LITERAL}`)), 'month'], [sequelize.fn('EXTRACT', sequelize.literal(`YEAR FROM ${INVOICE_PAID_AT_LITERAL}`)), 'year'], [sequelize.fn('SUM', sequelize.literal('"Invoice"."amountPaid"')), 'totalRevenue'], [sequelize.fn('COUNT', sequelize.literal('"Invoice"."id"')), 'count']]
          : [[sequelize.literal(`CAST(${INVOICE_PAID_AT_LITERAL} AS DATE)`), 'date'], [sequelize.fn('SUM', sequelize.literal('"Invoice"."amountPaid"')), 'totalRevenue'], [sequelize.fn('COUNT', sequelize.literal('"Invoice"."id"')), 'count']],
        where: revWhere,
        group: groupBy === 'month' ? [sequelize.fn('EXTRACT', sequelize.literal(`YEAR FROM ${INVOICE_PAID_AT_LITERAL}`)), sequelize.fn('EXTRACT', sequelize.literal(`MONTH FROM ${INVOICE_PAID_AT_LITERAL}`))] : [sequelize.literal(`CAST(${INVOICE_PAID_AT_LITERAL} AS DATE)`)],
        order: groupBy === 'month' ? [[sequelize.fn('EXTRACT', sequelize.literal(`YEAR FROM ${INVOICE_PAID_AT_LITERAL}`)), 'ASC'], [sequelize.fn('EXTRACT', sequelize.literal(`MONTH FROM ${INVOICE_PAID_AT_LITERAL}`)), 'ASC']] : [[sequelize.literal(`CAST(${INVOICE_PAID_AT_LITERAL} AS DATE)`), 'ASC']],
        raw: true
      });
    };

    let revenueByMethod = [];

    const paymentCustomers = await collectedRevenueService.getCollectedRevenueByCustomer(
      req,
      dateFilter,
      20,
      'studio'
    );

    const [revenueByPeriod, revenueByCustomer, totalRevenue] = await Promise.all([
      getRevenueByPeriod(),
      paymentCustomers
        ? Promise.resolve(paymentCustomers)
        : Invoice.findAll({
            attributes: ['customerId', [sequelize.fn('SUM', sequelize.literal('"Invoice"."amountPaid"')), 'totalRevenue'], [sequelize.fn('COUNT', sequelize.literal('"Invoice"."id"')), 'paymentCount']],
            where: revWhere,
            include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'company'] }],
            group: ['customerId', 'customer.id'],
            order: [[sequelize.fn('SUM', sequelize.literal('"Invoice"."amountPaid"')), 'DESC']],
            limit: 20
          }),
      collectedRevenueService.sumCollectedRevenue(req, dateFilter, { mode: 'studio' })
    ]);

    const effectiveTotalRevenue = parseFloat(totalRevenue || 0);
    const effectiveByPeriod = revenueByPeriod;
    logReport('[Revenue Report] Total revenue:', effectiveTotalRevenue, '(payment ledger / invoice fallback)');

    const responseData = {
      totalRevenue: effectiveTotalRevenue,
      byPeriod: effectiveByPeriod,
      byCustomer: revenueByCustomer,
      byMethod: revenueByMethod,
      revenueSource: 'payments'
    };
    logReport('[Revenue Report] Response data summary:', {
      totalRevenue: responseData.totalRevenue,
      byPeriodCount: responseData.byPeriod.length,
      byCustomerCount: responseData.byCustomer.length,
      byMethodCount: responseData.byMethod.length
    });

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    logReportError('[Revenue Report] ERROR:', error.message);
    logReportError('[Revenue Report] Stack:', error.stack);
    logReportError('[Revenue Report] Full error:', error);
    next(error);
  }
};

// @desc    Get expense report
// @route   GET /api/reports/expenses
// @access  Private
exports.getExpenseReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = resolveDateFilterFromQuery(req.query);

    const expenseWhere = scopedReportWhere(req, {
      approvalStatus: 'approved',
      isArchived: false,
      ...(hasDateFilter(dateFilter) && { expenseDate: dateFilter })
    });

    const [expensesByCategory, expensesByVendor, expensesByMethod, expensesByDate, totalExpenses] = await Promise.all([
      Expense.findAll({
        attributes: [
          'category',
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: expenseWhere,
        group: ['category'],
        order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']],
        raw: true
      }),
      Expense.findAll({
        attributes: [
          'vendorId',
          [sequelize.fn('SUM', sequelize.literal('"Expense"."amount"')), 'totalAmount'],
          [sequelize.fn('COUNT', sequelize.literal('"Expense"."id"')), 'count']
        ],
        where: expenseWhere,
        include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'name', 'company'] }],
        group: ['vendorId', 'vendor.id'],
        order: [[sequelize.fn('SUM', sequelize.literal('"Expense"."amount"')), 'DESC']],
        limit: 20
      }),
      Expense.findAll({
        attributes: [
          'paymentMethod',
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: expenseWhere,
        group: ['paymentMethod'],
        order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']]
      }),
      Expense.findAll({
        attributes: [
          [sequelize.literal(`CAST("expenseDate" AS DATE)`), 'date'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: expenseWhere,
        group: [sequelize.literal(`CAST("expenseDate" AS DATE)`)],
        order: [[sequelize.literal(`CAST("expenseDate" AS DATE)`), 'ASC']],
        raw: true
      }),
      Expense.sum('amount', { where: expenseWhere })
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalExpenses: parseFloat(totalExpenses || 0),
        byCategory: expensesByCategory,
        byVendor: expensesByVendor,
        byMethod: expensesByMethod,
        byDate: expensesByDate
      }
    });
  } catch (error) {
    logReportError('Error in getRevenueReport:', error);
    next(error);
  }
};

// @desc    Get outstanding payments report
// @route   GET /api/reports/outstanding-payments
// @access  Private
exports.getOutstandingPaymentsReport = async (req, res, next) => {
  try {
    const dateFilter = resolveDateFilterFromQuery(req.query);
    const isSlim = req.query.slim === 'true' || req.query.overview === 'true';
    const OUTSTANDING_INVOICE_LIMIT = isSlim ? 15 : 500;
    const TOP_CUSTOMER_LIMIT = isSlim ? 10 : 50;
    const outstandingWhere = buildOutstandingInvoiceWhere(req, dateFilter);
    const agingBaseWhere = (dueDateExtra) => scopedReportWhere(req, {
      status: { [Op.in]: ['sent', 'partial', 'overdue'] },
      balance: { [Op.gt]: 0 },
      ...dueDateExtra,
    });

    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(today.getDate() - 60);

    const [
      outstandingInvoices,
      outstandingByCustomer,
      agingCurrent,
      agingThirty,
      agingSixty,
      agingNinetyPlus,
      totalOutstanding,
    ] = await Promise.all([
      Invoice.findAll({
        where: outstandingWhere,
        attributes: [
          'id',
          'invoiceNumber',
          'customerId',
          'jobId',
          'status',
          'balance',
          'totalAmount',
          'dueDate',
          'invoiceDate',
        ],
        include: [
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'email', 'phone'] },
          { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] },
        ],
        order: [['balance', 'DESC'], ['dueDate', 'ASC']],
        limit: OUTSTANDING_INVOICE_LIMIT,
      }),
      Invoice.findAll({
        attributes: [
          'customerId',
          [sequelize.fn('SUM', sequelize.literal('"Invoice"."balance"')), 'totalOutstanding'],
          [sequelize.fn('COUNT', sequelize.literal('"Invoice"."id"')), 'invoiceCount'],
        ],
        where: outstandingWhere,
        include: [{
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'company', 'email'],
        }],
        group: ['customerId', 'customer.id'],
        order: [[sequelize.fn('SUM', sequelize.literal('"Invoice"."balance"')), 'DESC']],
        limit: TOP_CUSTOMER_LIMIT,
      }),
      Invoice.sum('balance', { where: agingBaseWhere({ dueDate: { [Op.gte]: today } }) }),
      Invoice.sum('balance', { where: agingBaseWhere({ dueDate: { [Op.between]: [thirtyDaysAgo, today] } }) }),
      Invoice.sum('balance', { where: agingBaseWhere({ dueDate: { [Op.between]: [sixtyDaysAgo, thirtyDaysAgo] } }) }),
      Invoice.sum('balance', { where: agingBaseWhere({ dueDate: { [Op.lt]: sixtyDaysAgo } }) }),
      Invoice.sum('balance', { where: outstandingWhere }),
    ]);

    const agingAnalysis = {
      current: agingCurrent || 0,
      thirtyDays: agingThirty || 0,
      sixtyDays: agingSixty || 0,
      ninetyPlusDays: agingNinetyPlus || 0,
    };

    res.status(200).json({
      success: true,
      data: {
        totalOutstanding: parseFloat(totalOutstanding || 0),
        invoices: outstandingInvoices,
        byCustomer: outstandingByCustomer,
        agingAnalysis: {
          current: parseFloat(agingAnalysis.current),
          thirtyDays: parseFloat(agingAnalysis.thirtyDays),
          sixtyDays: parseFloat(agingAnalysis.sixtyDays),
          ninetyPlusDays: parseFloat(agingAnalysis.ninetyPlusDays),
        },
      },
    });
  } catch (error) {
    logReportError('Error in getOutstandingPaymentsReport:', error);
    next(error);
  }
};

// @desc    Get sales report
// @route   GET /api/reports/sales
// @access  Private
exports.getSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'category' } = req.query;
    
    const dateFilter = resolveDateFilterFromQuery(req.query);
    const jobFrag = jobScopeSqlFragment(req);

    // Sales by category - using JobItem.category (more accurate than jobType)
    let salesByCategory;
    if (hasDateFilter(dateFilter)) {
      salesByCategory = await sequelize.query(`
        SELECT 
          "JobItem"."category",
          SUM("JobItem"."totalPrice") as "totalSales",
          SUM("JobItem"."quantity") as "totalQuantity",
          COUNT("JobItem"."id") as "itemCount",
          AVG("JobItem"."unitPrice") as "averagePrice"
        FROM "job_items" AS "JobItem"
        INNER JOIN "jobs" AS "job" ON "JobItem"."jobId" = "job"."id"
        WHERE "JobItem"."tenantId" = :tenantId
          AND "job"."createdAt" BETWEEN :startDate AND :endDate${jobFrag.sql}
        GROUP BY "JobItem"."category"
        ORDER BY SUM("JobItem"."totalPrice") DESC
      `, {
        replacements: {
          tenantId: req.tenantId,
          startDate: dateFilter[Op.between][0],
          endDate: dateFilter[Op.between][1],
          ...jobFrag.replacements,
        },
        type: sequelize.QueryTypes.SELECT
      });
    } else {
      salesByCategory = await sequelize.query(`
        SELECT 
          "JobItem"."category",
          SUM("JobItem"."totalPrice") as "totalSales",
          SUM("JobItem"."quantity") as "totalQuantity",
          COUNT("JobItem"."id") as "itemCount",
          AVG("JobItem"."unitPrice") as "averagePrice"
        FROM "job_items" AS "JobItem"
        INNER JOIN "jobs" AS "job" ON "JobItem"."jobId" = "job"."id"
        WHERE "JobItem"."tenantId" = :tenantId${jobFrag.sql}
        GROUP BY "JobItem"."category"
        ORDER BY SUM("JobItem"."totalPrice") DESC
      `, {
        replacements: {
          tenantId: req.tenantId,
          ...jobFrag.replacements,
        },
        type: sequelize.QueryTypes.SELECT
      });
    }

    // Map to match frontend expectations (byJobType -> byCategory)
    const salesByJobType = salesByCategory.map(item => ({
      jobType: item.category,
      category: item.category,
      totalSales: parseFloat(item.totalSales || 0),
      jobCount: parseInt(item.itemCount || 0),
      totalQuantity: parseFloat(item.totalQuantity || 0),
      averagePrice: parseFloat(item.averagePrice || 0)
    }));

    // Sales by customer
    const salesByCustomer = await Job.findAll({
      attributes: [
        'customerId',
        [sequelize.fn('SUM', sequelize.literal('"Job"."finalPrice"')), 'totalSales'],
        [sequelize.fn('COUNT', sequelize.literal('"Job"."id"')), 'jobCount']
      ],
      where: scopedReportWhere(req, {
        ...(hasDateFilter(dateFilter) && { createdAt: dateFilter })
      }),
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['id', 'name', 'company', 'email']
      }],
      group: ['customerId', 'customer.id'],
      order: [[sequelize.fn('SUM', sequelize.literal('"Job"."finalPrice"')), 'DESC']],
      limit: 20
    });

    // Sales by date - using createdAt for date grouping
    const salesByDate = await Job.findAll({
      attributes: [
        [sequelize.literal(`CAST("createdAt" AS DATE)`), 'date'],
        [sequelize.fn('SUM', sequelize.col('finalPrice')), 'totalSales'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'jobCount']
      ],
      where: scopedReportWhere(req, {
        ...(hasDateFilter(dateFilter) && { createdAt: dateFilter })
      }),
      group: [sequelize.literal(`CAST("createdAt" AS DATE)`)],
      order: [[sequelize.literal(`CAST("createdAt" AS DATE)`), 'ASC']],
      raw: true
    });

    // Jobs trend by date - incoming (createdAt) and completed (completionDate)
    let jobsTrendByDate = [];
    if (hasDateFilter(dateFilter)) {
      // Get incoming jobs grouped by createdAt date
      const incomingJobsByDate = await Job.findAll({
        attributes: [
          [sequelize.literal(`CAST("createdAt" AS DATE)`), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'incoming']
        ],
        where: scopedReportWhere(req, {
          createdAt: dateFilter
        }),
        group: [sequelize.literal(`CAST("createdAt" AS DATE)`)],
        order: [[sequelize.literal(`CAST("createdAt" AS DATE)`), 'ASC']],
        raw: true
      });

      // Get completed jobs grouped by completionDate (only jobs with completionDate set)
      const completedJobsByDate = await Job.findAll({
        attributes: [
          [sequelize.literal(`CAST("completionDate" AS DATE)`), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'completed']
        ],
        where: scopedReportWhere(req, {
          status: 'completed',
          completionDate: {
            [Op.and]: [
              { [Op.not]: null },
              dateFilter
            ]
          }
        }),
        group: [sequelize.literal(`CAST("completionDate" AS DATE)`)],
        order: [[sequelize.literal(`CAST("completionDate" AS DATE)`), 'ASC']],
        raw: true
      });

      // Merge the two datasets by date
      const dateMap = new Map();
      
      // Helper function to convert date to ISO string
      const getDateKey = (date) => {
        if (!date) return null;
        if (date instanceof Date) {
          return date.toISOString().split('T')[0];
        }
        // Handle string dates from Sequelize raw queries
        const dateObj = new Date(date);
        return dateObj.toISOString().split('T')[0];
      };
      
      // Add incoming jobs
      incomingJobsByDate.forEach(item => {
        const dateKey = getDateKey(item.date);
        if (dateKey) {
          dateMap.set(dateKey, {
            date: dateKey,
            incoming: parseInt(item.incoming) || 0,
            completed: 0
          });
        }
      });

      // Add completed jobs
      completedJobsByDate.forEach(item => {
        const dateKey = getDateKey(item.date);
        if (dateKey) {
          if (dateMap.has(dateKey)) {
            dateMap.get(dateKey).completed = parseInt(item.completed) || 0;
          } else {
            dateMap.set(dateKey, {
              date: dateKey,
              incoming: 0,
              completed: parseInt(item.completed) || 0
            });
          }
        }
      });

      // Convert map to array and sort by date
      jobsTrendByDate = Array.from(dateMap.values()).sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
      });
    } else {
      // Get all incoming jobs grouped by createdAt date
      const incomingJobsByDate = await Job.findAll({
        attributes: [
          [sequelize.literal(`CAST("createdAt" AS DATE)`), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'incoming']
        ],
        where: scopedReportWhere(req, {}),
        group: [sequelize.literal(`CAST("createdAt" AS DATE)`)],
        order: [[sequelize.literal(`CAST("createdAt" AS DATE)`), 'ASC']],
        raw: true
      });

      // Get all completed jobs grouped by completionDate (only jobs with completionDate set)
      const completedJobsByDate = await Job.findAll({
        attributes: [
          [sequelize.literal(`CAST("completionDate" AS DATE)`), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'completed']
        ],
        where: scopedReportWhere(req, {
          status: 'completed',
          completionDate: {
            [Op.not]: null
          }
        }),
        group: [sequelize.literal(`CAST("completionDate" AS DATE)`)],
        order: [[sequelize.literal(`CAST("completionDate" AS DATE)`), 'ASC']],
        raw: true
      });

      // Merge the two datasets by date
      const dateMap = new Map();
      
      // Helper function to convert date to ISO string
      const getDateKey = (date) => {
        if (!date) return null;
        if (date instanceof Date) {
          return date.toISOString().split('T')[0];
        }
        // Handle string dates from Sequelize raw queries
        const dateObj = new Date(date);
        return dateObj.toISOString().split('T')[0];
      };
      
      // Add incoming jobs
      incomingJobsByDate.forEach(item => {
        const dateKey = getDateKey(item.date);
        if (dateKey) {
          dateMap.set(dateKey, {
            date: dateKey,
            incoming: parseInt(item.incoming) || 0,
            completed: 0
          });
        }
      });

      // Add completed jobs
      completedJobsByDate.forEach(item => {
        const dateKey = getDateKey(item.date);
        if (dateKey) {
          if (dateMap.has(dateKey)) {
            dateMap.get(dateKey).completed = parseInt(item.completed) || 0;
          } else {
            dateMap.set(dateKey, {
              date: dateKey,
              incoming: 0,
              completed: parseInt(item.completed) || 0
            });
          }
        }
      });

      // Convert map to array and sort by date
      jobsTrendByDate = Array.from(dateMap.values()).sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
      });
    }

    // Sales by status
    const salesByStatus = await Job.findAll({
      attributes: [
        'status',
        [sequelize.fn('SUM', sequelize.col('finalPrice')), 'totalSales'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'jobCount']
      ],
      where: scopedReportWhere(req, {
        ...(hasDateFilter(dateFilter) && { createdAt: dateFilter })
      }),
      group: ['status'],
      order: [[sequelize.fn('SUM', sequelize.col('finalPrice')), 'DESC']]
    });

    // Total sales
    const totalSales = await Job.sum('finalPrice', {
      where: scopedReportWhere(req, {
        ...(hasDateFilter(dateFilter) && { createdAt: dateFilter })
      })
    }) || 0;

    // Total jobs count
    const totalJobs = await Job.count({
      where: scopedReportWhere(req, {
        ...(hasDateFilter(dateFilter) && { createdAt: dateFilter })
      })
    }) || 0;

    // Sales by payment method (from Sale model – shop/pharmacy; used for Revenue by Channel fallback)
    const saleWhere = scopedRetailWhere(req, {
      status: 'completed',
      ...(hasDateFilter(dateFilter) && { createdAt: dateFilter })
    });
    let salesByPaymentMethod = [];
    try {
      salesByPaymentMethod = await Sale.findAll({
        attributes: [
          'paymentMethod',
          [sequelize.fn('SUM', sequelize.col('total')), 'totalAmount'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: saleWhere,
        group: ['paymentMethod'],
        order: [[sequelize.fn('SUM', sequelize.col('total')), 'DESC']],
        raw: true
      });
      salesByPaymentMethod = (salesByPaymentMethod || []).map((row) => ({
        paymentMethod: row.paymentMethod || 'other',
        totalAmount: parseFloat(row.totalAmount || 0),
        count: parseInt(row.count || 0, 10)
      }));
    } catch (e) {
      logReportError('Sales by payment method (Sale model):', e);
    }

    // For shop/pharmacy use Sale model for count and value so "Total Sales" = transaction count, "Total Sales Value" = revenue
    const businessType = req.tenant?.businessType || '';
    let effectiveTotalSales = parseFloat(totalSales);
    let effectiveTotalJobs = totalJobs;
    if (businessType === 'shop' || businessType === 'pharmacy') {
      try {
        const [saleRevenue, saleCount] = await Promise.all([
          Sale.sum('total', { where: saleWhere }) || 0,
          Sale.count({ where: saleWhere }) || 0
        ]);
        effectiveTotalSales = parseFloat(saleRevenue);
        effectiveTotalJobs = saleCount;
      } catch (e) {
        logReportError('Sales report (shop/pharmacy Sale totals):', e);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        totalSales: effectiveTotalSales,
        totalJobs: effectiveTotalJobs,
        byJobType: salesByJobType,
        byCustomer: salesByCustomer,
        byDate: salesByDate,
        byStatus: salesByStatus,
        byPaymentMethod: salesByPaymentMethod,
        byPeriod: salesByDate, // Add byPeriod alias for frontend compatibility
        jobsTrendByDate: jobsTrendByDate // Jobs trend with incoming and completed by date
      }
    });
  } catch (error) {
    logReportError('Error in getRevenueReport:', error);
    next(error);
  }
};

// @desc    Get profit & loss report
// @route   GET /api/reports/profit-loss
// @access  Private
exports.getProfitLossReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (startDate && endDate && (await accountingReportService.hasAccountingData(req.tenantId))) {
      const data = await accountingReportService.getProfitLossFromAccounting(req.tenantId, startDate, endDate);
      return res.status(200).json({ success: true, data, source: 'accounting' });
    }

    const dateFilter = resolveDateFilterFromQuery(req.query);

    const [revenue, operatingExpenses, cogs] = await Promise.all([
      resolveOverviewRevenueTotal(req, dateFilter),
      Expense.sum('amount', {
        where: scopedReportWhere(req, {
          approvalStatus: 'approved',
          isArchived: false,
          ...(hasDateFilter(dateFilter) && { expenseDate: dateFilter })
        })
      }) || 0,
      getRetailCogsTotal(req, dateFilter)
    ]);

    const totalExpenses = parseFloat(operatingExpenses || 0) + parseFloat(cogs || 0);
    const grossProfit = parseFloat(revenue || 0) - parseFloat(cogs || 0);
    const netProfit = parseFloat(revenue || 0) - totalExpenses;
    const grossProfitMargin = revenue > 0 ? ((grossProfit / revenue) * 100) : 0;
    const netProfitMargin = revenue > 0 ? ((netProfit / revenue) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        revenue: parseFloat(revenue),
        expenses: parseFloat(totalExpenses),
        operatingExpenses: parseFloat(operatingExpenses || 0),
        cogs: parseFloat(cogs || 0),
        grossProfit: parseFloat(grossProfit),
        netProfit: parseFloat(netProfit),
        grossProfitMargin: parseFloat(grossProfitMargin.toFixed(2)),
        netProfitMargin: parseFloat(netProfitMargin.toFixed(2)),
        profitMargin: parseFloat(netProfitMargin.toFixed(2))
      }
    });
  } catch (error) {
    logReportError('Error in getRevenueReport:', error);
    next(error);
  }
};

// --- Compliance / Revenue Center reports (submission-ready statements) ---

// @desc    Get income and expenditure report (for compliance submission)
// @route   GET /api/reports/income-expenditure
// @access  Private
exports.getIncomeExpenditureReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (startDate && endDate && (await accountingReportService.hasAccountingData(req.tenantId))) {
      const [data, stock] = await Promise.all([
        accountingReportService.getIncomeExpenditureFromAccounting(req.tenantId, startDate, endDate),
        accountingReportService.getOpeningClosingStockFromAccounting(req.tenantId, startDate, endDate)
      ]);
      return res.status(200).json({
        success: true,
        data: { ...data, openingStockValue: stock.openingStockValue, closingStockValue: stock.closingStockValue },
        source: 'accounting'
      });
    }

    const dateFilter = resolveDateFilterFromQuery(req.query);

    const revWhere = buildCollectedRevenueWhere(req, dateFilter);
    const expenseWhere = scopedReportWhere(req, {
      approvalStatus: 'approved',
      isArchived: false,
      ...(hasDateFilter(dateFilter) && { expenseDate: dateFilter })
    });

    const [totalIncome, expensesByCategory, totalExpenditure] = await Promise.all([
      isRetailBusiness(req)
        ? collectedRevenueService.sumCollectedRevenue(req, dateFilter, {
            mode: 'retail',
            fallbackField: 'total',
          })
        : collectedRevenueService.sumCollectedRevenue(req, dateFilter, { mode: 'studio' }),
      Expense.findAll({
        attributes: [
          'category',
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: expenseWhere,
        group: ['category'],
        order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']],
        raw: true
      }),
      Expense.sum('amount', { where: expenseWhere }) || 0
    ]);

    const incomeTotal = parseFloat(totalIncome);
    const expenditureTotal = parseFloat(totalExpenditure);
    const surplusDeficit = incomeTotal - expenditureTotal;

    res.status(200).json({
      success: true,
      data: {
        income: {
          total: incomeTotal,
          label: 'Income (from sales / paid invoices)'
        },
        expenditure: {
          total: expenditureTotal,
          byCategory: (expensesByCategory || []).map((row) => ({
            category: row.category || 'Uncategorized',
            amount: parseFloat(row.totalAmount || 0),
            count: parseInt(row.count, 10) || 0
          }))
        },
        surplusDeficit
      }
    });
  } catch (error) {
    logReportError('Error in getIncomeExpenditureReport:', error);
    next(error);
  }
};

// @desc    Get profit & loss report with expense breakdown (compliance submission format)
// @route   GET /api/reports/profit-loss/compliance
// @access  Private
exports.getProfitLossComplianceReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (startDate && endDate && (await accountingReportService.hasAccountingData(req.tenantId))) {
      const [data, stock] = await Promise.all([
        accountingReportService.getProfitLossComplianceFromAccounting(req.tenantId, startDate, endDate),
        accountingReportService.getOpeningClosingStockFromAccounting(req.tenantId, startDate, endDate)
      ]);
      return res.status(200).json({
        success: true,
        data: { ...data, openingStockValue: stock.openingStockValue, closingStockValue: stock.closingStockValue },
        source: 'accounting'
      });
    }

    const dateFilter = resolveDateFilterFromQuery(req.query);

    const revWhere = buildCollectedRevenueWhere(req, dateFilter);
    const expenseWhere = scopedReportWhere(req, {
      approvalStatus: 'approved',
      isArchived: false,
      ...(hasDateFilter(dateFilter) && { expenseDate: dateFilter })
    });

    const [revenue, expensesByCategory, operatingExpenses, cogs] = await Promise.all([
      Invoice.sum('amountPaid', { where: revWhere }) || 0,
      Expense.findAll({
        attributes: [
          'category',
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: expenseWhere,
        group: ['category'],
        order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']],
        raw: true
      }),
      Expense.sum('amount', { where: expenseWhere }) || 0,
      getRetailCogsTotal(req, dateFilter)
    ]);

    const revenueNum = parseFloat(revenue);
    const operatingExpensesNum = parseFloat(operatingExpenses);
    const cogsNum = parseFloat(cogs || 0);
    const expensesNum = operatingExpensesNum + cogsNum;
    const grossProfit = revenueNum - cogsNum;
    const netProfit = revenueNum - expensesNum;
    const grossProfitMargin = revenueNum > 0 ? ((grossProfit / revenueNum) * 100) : 0;
    const netProfitMargin = revenueNum > 0 ? ((netProfit / revenueNum) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        revenue: revenueNum,
        expenses: expensesNum,
        operatingExpenses: operatingExpensesNum,
        cogs: cogsNum,
        grossProfit,
        netProfit,
        grossProfitMargin: parseFloat(grossProfitMargin.toFixed(2)),
        netProfitMargin: parseFloat(netProfitMargin.toFixed(2)),
        profitMargin: parseFloat(netProfitMargin.toFixed(2)),
        expensesByCategory: (expensesByCategory || []).map((row) => ({
          category: row.category || 'Uncategorized',
          amount: parseFloat(row.totalAmount || 0),
          count: parseInt(row.count, 10) || 0
        }))
      }
    });
  } catch (error) {
    logReportError('Error in getProfitLossComplianceReport:', error);
    next(error);
  }
};

// @desc    Get statement of financial position (simplified balance sheet as at end date)
// @route   GET /api/reports/financial-position
// @access  Private
exports.getFinancialPositionReport = async (req, res, next) => {
  try {
    const { endDate } = req.query;
    const asAtRange = endDate ? parseReportDateRange(endDate, endDate) : null;
    const asAtEnd = asAtRange
      ? asAtRange[Op.between][1]
      : (() => {
        const d = new Date();
        d.setHours(23, 59, 59, 999);
        return d;
      })();

    if (await accountingReportService.hasAccountingData(req.tenantId)) {
      const data = await accountingReportService.getFinancialPositionFromAccounting(req.tenantId, asAtEnd);
      return res.status(200).json({ success: true, data, source: 'accounting' });
    }

    // Debtors (trade receivables): outstanding invoice balance – customers with pending invoices; 0 when none
    const debtors = await Invoice.sum('balance', {
      where: scopedReportWhere(req, {
        status: { [Op.in]: ['sent', 'partial', 'overdue'] },
        balance: { [Op.gt]: 0 },
        invoiceDate: { [Op.lte]: asAtEnd }
      })
    }) || 0;
    const debtorsNum = parseFloat(debtors);

    // Product inventory: stock value of goods for sale (Product model)
    const productStockResult = await Product.findAll({
      attributes: [
        [sequelize.literal('COALESCE(SUM("Product"."quantityOnHand" * "Product"."costPrice"), 0)'), 'totalStockValue']
      ],
      where: scopedRetailWhere(req, {}),
      raw: true
    });
    const productInventoryValue = parseFloat(productStockResult[0]?.totalStockValue || 0);

    // Materials: stock value of supplies (MaterialItem model)
    const materialsResult = await MaterialItem.findAll({
      attributes: [
        [sequelize.literal('COALESCE(SUM("MaterialItem"."quantityOnHand" * "MaterialItem"."unitCost"), 0)'), 'totalValue']
      ],
      where: scopedReportWhere(req, {}),
      raw: true
    });
    const materialsValue = parseFloat(materialsResult[0]?.totalValue || 0);

    const totalAssets = debtorsNum + productInventoryValue + materialsValue;

    // Retained earnings: cumulative profit (revenue - expenses) up to end date
    const revToDate = await Invoice.sum('amountPaid', {
      where: {
        ...scopedReportWhere(req, {
          status: { [Op.ne]: 'cancelled' },
          amountPaid: { [Op.gt]: 0 }
        }),
        [Op.and]: [
          sequelize.where(invoicePaidAtExpr(), { [Op.lte]: asAtEnd })
        ]
      }
    }) || 0;
    const expToDate = await Expense.sum('amount', {
      where: scopedReportWhere(req, {
        approvalStatus: 'approved',
        isArchived: false,
        expenseDate: { [Op.lte]: asAtEnd }
      })
    }) || 0;
    const retainedEarnings = parseFloat(revToDate) - parseFloat(expToDate);

    // Simplified: no separate liabilities tracking; equity = retained earnings; balance with "other" if needed
    const totalLiabilities = 0;
    const totalEquity = retainedEarnings;

    res.status(200).json({
      success: true,
      data: {
        asAtDate: asAtEnd.toISOString().split('T')[0],
        assets: {
          debtors: debtorsNum,
          receivables: debtorsNum,
          productInventory: productInventoryValue,
          materials: materialsValue,
          total: totalAssets
        },
        liabilities: {
          total: totalLiabilities
        },
        equity: {
          retainedEarnings,
          total: totalEquity
        },
        totalAssets,
        totalLiabilitiesAndEquity: totalLiabilities + totalEquity
      }
    });
  } catch (error) {
    logReportError('Error in getFinancialPositionReport:', error);
    next(error);
  }
};

/**
 * Cash collected from customers for the period.
 * Prefers the Payment ledger (each row has its own paymentDate + amount, so partial payments
 * spread across periods are attributed correctly) over Invoice.amountPaid / Sale.amountPaid,
 * which are running totals that mis-state per-period cash when installments span months.
 * Falls back when the tenant has no income Payment rows.
 * @param {import('express').Request} req
 * @param {Object} dateFilter
 * @param {Object} revWhere - unused (kept for call-site compatibility)
 */
const getStudioCashCollected = async (req, dateFilter, revWhere) => {
  return collectedRevenueService.sumCollectedRevenue(req, dateFilter, { mode: 'studio' });
};

// @desc    Get cash flow statement (simplified: operating only)
// @route   GET /api/reports/cashflow
// @access  Private
exports.getCashFlowReport = async (req, res, next) => {
  try {
    const { startDate, endDate, basis } = req.query;
    const dateFilter = resolveDateFilterFromQuery(req.query);

    const revWhere = buildCollectedRevenueWhere(req, dateFilter);
    const expenseWhere = scopedReportWhere(req, {
      approvalStatus: 'approved',
      isArchived: false,
      ...(hasDateFilter(dateFilter) && { expenseDate: dateFilter })
    });

    const [cashFromCustomers, cashPaidExpenses] = await Promise.all([
      isRetailBusiness(req)
        ? collectedRevenueService.sumCollectedRevenue(req, dateFilter, {
            mode: 'retail',
            fallbackField: 'amountPaid',
          })
        : getStudioCashCollected(req, dateFilter, revWhere),
      Expense.sum('amount', { where: expenseWhere }) || 0
    ]);

    const operatingIn = parseFloat(cashFromCustomers || 0);
    const operatingOut = parseFloat(cashPaidExpenses || 0);
    const netCashFromOperating = operatingIn - operatingOut;

    const operationalData = {
      operating: {
        cashReceivedFromCustomers: operatingIn,
        cashPaidToSuppliersAndExpenses: operatingOut,
        netCashFromOperatingActivities: netCashFromOperating
      },
      investing: {
        netCashUsedInInvestingActivities: 0
      },
      financing: {
        netCashFromFinancingActivities: 0
      },
      netChangeInCash: netCashFromOperating
    };

    // Default to operational cash (invoice/sale collections + approved expenses).
    // Accounting auto-switch previously used P&L account balances, which mis-stated
    // cash when revenue was recognized on invoice date and COGS hit expense accounts.
    if (
      basis === 'accounting'
      && startDate
      && endDate
      && (await accountingReportService.hasAccountingData(req.tenantId))
    ) {
      const data = await accountingReportService.getCashFlowFromAccounting(req.tenantId, startDate, endDate);
      return res.status(200).json({ success: true, data, source: 'accounting' });
    }

    res.status(200).json({
      success: true,
      data: operationalData,
      source: 'operational'
    });
  } catch (error) {
    logReportError('Error in getCashFlowReport:', error);
    next(error);
  }
};

exports.getKpiSummary = async (req, res, next) => {
  try {
    const dateFilter = resolveDateFilterFromQuery(req.query);

    const [totalRevenue, operatingExpenses, cogs, activeCustomers, pendingInvoices] = await Promise.all([
      resolveOverviewRevenueTotal(req, dateFilter),
      Expense.sum('amount', {
        where: scopedReportWhere(req, {
          approvalStatus: 'approved',
          isArchived: false,
          ...(hasDateFilter(dateFilter) && { expenseDate: dateFilter }),
        }),
      }) || 0,
      getRetailCogsTotal(req, dateFilter),
      Customer.count({
        where: scopedReportWhere(req, { isActive: true }),
      }),
      Invoice.sum('balance', {
        where: buildOutstandingInvoiceWhere(req, dateFilter),
      }) || 0,
    ]);

    const revenue = parseFloat(totalRevenue) || 0;
    const opEx = parseFloat(operatingExpenses || 0);
    const cogsTotal = parseFloat(cogs || 0);
    // grossProfit = revenue - COGS; netProfit = grossProfit - operating expenses.
    // Previously this endpoint returned (revenue - operatingExpenses) mislabeled as "grossProfit",
    // which both ignored COGS and confused gross vs net profit for consumers.
    const grossProfit = revenue - cogsTotal;
    const netProfit = grossProfit - opEx;

    res.status(200).json({
      success: true,
      data: {
        totalRevenue: revenue,
        totalExpenses: opEx + cogsTotal,
        operatingExpenses: opEx,
        cogs: cogsTotal,
        grossProfit: parseFloat(grossProfit.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2)),
        activeCustomers,
        pendingInvoices: parseFloat(pendingInvoices),
      },
    });
  } catch (error) {
    logReportError('Error in getKpiSummary:', error);
    next(error);
  }
};

exports.getTopCustomers = async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 5 } = req.query;

    const dateFilter = resolveDateFilterFromQuery(req.query);

    if (isRetailBusiness(req)) {
      const customers = await Sale.findAll({
        attributes: [
          'customerId',
          [sequelize.fn('SUM', sequelize.col('Sale.total')), 'totalRevenue'],
          [sequelize.fn('COUNT', sequelize.col('Sale.id')), 'paymentCount']
        ],
        where: scopedSaleWhere(req, dateFilter),
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'name', 'company', 'email'],
            required: false
          }
        ],
        group: ['Sale.customerId', 'customer.id'],
        order: [[sequelize.fn('SUM', sequelize.col('Sale.total')), 'DESC']],
        limit: Number(limit),
        subQuery: false
      });

      return res.status(200).json({
        success: true,
        data: customers.filter((row) => row.customerId)
      });
    }

    const customers = await Invoice.findAll({
      attributes: [
        'customerId',
        [sequelize.fn('SUM', sequelize.literal('"Invoice"."amountPaid"')), 'totalRevenue'],
        [sequelize.fn('COUNT', sequelize.literal('"Invoice"."id"')), 'paymentCount']
      ],
      where: buildCollectedRevenueWhere(req, dateFilter),
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'company', 'email']
        }
      ],
      group: ['customerId', 'customer.id'],
      order: [[sequelize.fn('SUM', sequelize.literal('"Invoice"."amountPaid"')), 'DESC']],
      limit: Number(limit)
    });

    res.status(200).json({
      success: true,
      data: customers
    });
  } catch (error) {
    logReportError('Error in getRevenueReport:', error);
    next(error);
  }
};

exports.getPipelineSummary = async (req, res, next) => {
  try {
    const dateFilter = resolveDateFilterFromQuery(req.query);
    const hasPeriod = hasDateFilter(dateFilter);

    let activeJobs = 0;
    let openLeads = 0;
    let pendingInvoices = 0;
    let jobsCreatedInPeriod = 0;
    let leadsCreatedInPeriod = 0;
    let invoicesIssuedInPeriod = 0;

    try {
      activeJobs = await Job.count({
        where: scopedReportWhere(req, {
          status: { [Op.notIn]: ['completed', 'cancelled'] },
        })
      });
      if (hasPeriod) {
        jobsCreatedInPeriod = await Job.count({
          where: scopedReportWhere(req, { createdAt: dateFilter })
        });
      }
    } catch (e) {
      logReportError('getPipelineSummary activeJobs:', e);
    }

    try {
      // Lead model uses status: new, contacted, qualified, lost, converted (not closed_won/closed_lost)
      openLeads = await Lead.count({
        where: scopedReportWhere(req, {
          status: { [Op.notIn]: ['lost', 'converted'] },
          isActive: true
        })
      });
      if (hasPeriod) {
        leadsCreatedInPeriod = await Lead.count({
          where: scopedReportWhere(req, { createdAt: dateFilter })
        });
      }
    } catch (e) {
      logReportError('getPipelineSummary openLeads:', e);
    }

    try {
      pendingInvoices = await Invoice.count({
        where: scopedReportWhere(req, {
          status: { [Op.in]: ['sent', 'partial'] },
          balance: { [Op.gt]: 0 }
        })
      });
      if (hasPeriod) {
        invoicesIssuedInPeriod = await Invoice.count({
          where: scopedReportWhere(req, { invoiceDate: dateFilter })
        });
      }
    } catch (e) {
      logReportError('getPipelineSummary pendingInvoices:', e);
    }

    res.status(200).json({
      success: true,
      data: {
        activeJobs,
        openLeads,
        pendingInvoices,
        jobsCreatedInPeriod,
        leadsCreatedInPeriod,
        invoicesIssuedInPeriod,
        isSnapshot: true,
        snapshotLabel: 'Current open pipeline (not limited to selected period)',
        periodMetrics: hasPeriod
          ? { jobsCreatedInPeriod, leadsCreatedInPeriod, invoicesIssuedInPeriod }
          : null,
      }
    });
  } catch (error) {
    logReportError('Error in getPipelineSummary:', error);
    next(error);
  }
};

// @desc    Get service analytics report (by category from JobItems)
// @route   GET /api/reports/service-analytics
// @access  Private
exports.getServiceAnalyticsReport = async (req, res, next) => {
  try {
    logReport('[Service Analytics] Starting service analytics report generation');
    logReport('[Service Analytics] Tenant ID:', req.tenantId);
    const { startDate, endDate } = req.query;
    logReport('[Service Analytics] Query params:', { startDate, endDate });
    
    const dateFilter = resolveDateFilterFromQuery(req.query);
    const jobFrag = jobScopeSqlFragment(req);
    if (hasDateFilter(dateFilter)) {
      const [start, end] = dateFilter[Op.between];
      logReport('[Service Analytics] Date filter applied:', { start, end });
    } else {
      logReport('[Service Analytics] No date filter - fetching all data');
    }

    // Service analytics by category from JobItems
    logReport('[Service Analytics] Fetching service analytics by category');
    let serviceAnalytics = [];
    try {
      if (hasDateFilter(dateFilter)) {
        logReport('[Service Analytics] Using date filter for category query');
        serviceAnalytics = await sequelize.query(`
          SELECT 
            "JobItem"."category",
            SUM("JobItem"."totalPrice") as "totalRevenue",
            SUM("JobItem"."quantity") as "totalQuantity",
            COUNT("JobItem"."id") as "itemCount",
            AVG("JobItem"."unitPrice") as "averagePrice",
            MIN("JobItem"."unitPrice") as "minPrice",
            MAX("JobItem"."unitPrice") as "maxPrice"
          FROM "job_items" AS "JobItem"
          INNER JOIN "jobs" AS "job" ON "JobItem"."jobId" = "job"."id"
          WHERE "JobItem"."tenantId" = :tenantId
            AND "job"."createdAt" BETWEEN :startDate AND :endDate${jobFrag.sql}
          GROUP BY "JobItem"."category"
          ORDER BY SUM("JobItem"."totalPrice") DESC
        `, {
          replacements: {
            tenantId: req.tenantId,
            startDate: dateFilter[Op.between][0],
            endDate: dateFilter[Op.between][1],
            ...jobFrag.replacements,
          },
          type: sequelize.QueryTypes.SELECT
        });
      } else {
        logReport('[Service Analytics] No date filter for category query');
        serviceAnalytics = await sequelize.query(`
          SELECT 
            "JobItem"."category",
            SUM("JobItem"."totalPrice") as "totalRevenue",
            SUM("JobItem"."quantity") as "totalQuantity",
            COUNT("JobItem"."id") as "itemCount",
            AVG("JobItem"."unitPrice") as "averagePrice",
            MIN("JobItem"."unitPrice") as "minPrice",
            MAX("JobItem"."unitPrice") as "maxPrice"
          FROM "job_items" AS "JobItem"
          INNER JOIN "jobs" AS "job" ON "JobItem"."jobId" = "job"."id"
          WHERE "JobItem"."tenantId" = :tenantId${jobFrag.sql}
          GROUP BY "JobItem"."category"
          ORDER BY SUM("JobItem"."totalPrice") DESC
        `, {
          replacements: {
            tenantId: req.tenantId,
            ...jobFrag.replacements,
          },
          type: sequelize.QueryTypes.SELECT
        });
      }
      logReport('[Service Analytics] Service analytics by category fetched:', serviceAnalytics.length, 'categories');
      } catch (categoryError) {
      logReportError('[Service Analytics] Error fetching service analytics by category:', categoryError);
      throw categoryError;
    }

    // Service analytics by date - using raw SQL for better performance
    logReport('[Service Analytics] Fetching service analytics by date');
    let serviceByDate = [];
    try {
      if (hasDateFilter(dateFilter)) {
        serviceByDate = await sequelize.query(`
          SELECT 
            CAST("job"."createdAt" AS DATE) as "date",
            SUM("JobItem"."totalPrice") as "totalRevenue",
            SUM("JobItem"."quantity") as "totalQuantity",
            COUNT("JobItem"."id") as "itemCount"
          FROM "job_items" AS "JobItem"
          INNER JOIN "jobs" AS "job" ON "JobItem"."jobId" = "job"."id"
          WHERE "JobItem"."tenantId" = :tenantId
            AND "job"."createdAt" BETWEEN :startDate AND :endDate${jobFrag.sql}
          GROUP BY CAST("job"."createdAt" AS DATE)
          ORDER BY CAST("job"."createdAt" AS DATE) ASC
        `, {
          replacements: {
            tenantId: req.tenantId,
            startDate: dateFilter[Op.between][0],
            endDate: dateFilter[Op.between][1],
            ...jobFrag.replacements,
          },
          type: sequelize.QueryTypes.SELECT
        });
      } else {
        serviceByDate = await sequelize.query(`
          SELECT 
            CAST("job"."createdAt" AS DATE) as "date",
            SUM("JobItem"."totalPrice") as "totalRevenue",
            SUM("JobItem"."quantity") as "totalQuantity",
            COUNT("JobItem"."id") as "itemCount"
          FROM "job_items" AS "JobItem"
          INNER JOIN "jobs" AS "job" ON "JobItem"."jobId" = "job"."id"
          WHERE "JobItem"."tenantId" = :tenantId${jobFrag.sql}
          GROUP BY CAST("job"."createdAt" AS DATE)
          ORDER BY CAST("job"."createdAt" AS DATE) ASC
        `, {
          replacements: {
            tenantId: req.tenantId,
            ...jobFrag.replacements,
          },
          type: sequelize.QueryTypes.SELECT
        });
      }
      logReport('[Service Analytics] Service analytics by date fetched:', serviceByDate.length, 'dates');
      } catch (dateError) {
      logReportError('[Service Analytics] Error fetching service analytics by date:', dateError);
      // Don't throw - make it optional
      serviceByDate = [];
    }

    // Service analytics by customer - using raw SQL for better performance
    logReport('[Service Analytics] Fetching service analytics by customer');
    let serviceByCustomer = [];
    try {
      if (hasDateFilter(dateFilter)) {
        serviceByCustomer = await sequelize.query(`
          SELECT 
            "job"."customerId",
            SUM("JobItem"."totalPrice") as "totalRevenue",
            SUM("JobItem"."quantity") as "totalQuantity",
            COUNT("JobItem"."id") as "itemCount",
            "customer"."id" as "customer.id",
            "customer"."name" as "customer.name",
            "customer"."company" as "customer.company",
            "customer"."email" as "customer.email"
          FROM "job_items" AS "JobItem"
          INNER JOIN "jobs" AS "job" ON "JobItem"."jobId" = "job"."id"
          LEFT JOIN "customers" AS "customer" ON "job"."customerId" = "customer"."id"
          WHERE "JobItem"."tenantId" = :tenantId
            AND "job"."createdAt" BETWEEN :startDate AND :endDate${jobFrag.sql}
          GROUP BY "job"."customerId", "customer"."id", "customer"."name", "customer"."company", "customer"."email"
          ORDER BY SUM("JobItem"."totalPrice") DESC
          LIMIT 20
        `, {
          replacements: {
            tenantId: req.tenantId,
            startDate: dateFilter[Op.between][0],
            endDate: dateFilter[Op.between][1],
            ...jobFrag.replacements,
          },
          type: sequelize.QueryTypes.SELECT
        });
      } else {
        serviceByCustomer = await sequelize.query(`
          SELECT 
            "job"."customerId",
            SUM("JobItem"."totalPrice") as "totalRevenue",
            SUM("JobItem"."quantity") as "totalQuantity",
            COUNT("JobItem"."id") as "itemCount",
            "customer"."id" as "customer.id",
            "customer"."name" as "customer.name",
            "customer"."company" as "customer.company",
            "customer"."email" as "customer.email"
          FROM "job_items" AS "JobItem"
          INNER JOIN "jobs" AS "job" ON "JobItem"."jobId" = "job"."id"
          LEFT JOIN "customers" AS "customer" ON "job"."customerId" = "customer"."id"
          WHERE "JobItem"."tenantId" = :tenantId${jobFrag.sql}
          GROUP BY "job"."customerId", "customer"."id", "customer"."name", "customer"."company", "customer"."email"
          ORDER BY SUM("JobItem"."totalPrice") DESC
          LIMIT 20
        `, {
          replacements: {
            tenantId: req.tenantId,
            ...jobFrag.replacements,
          },
          type: sequelize.QueryTypes.SELECT
        });
      }
      // Map the raw SQL results to match expected format
      serviceByCustomer = serviceByCustomer.map(item => ({
        totalRevenue: parseFloat(item.totalRevenue || 0),
        totalQuantity: parseFloat(item.totalQuantity || 0),
        itemCount: parseInt(item.itemCount || 0),
        job: {
          customerId: item.customerId,
          customer: item['customer.id'] ? {
            id: item['customer.id'],
            name: item['customer.name'],
            company: item['customer.company'],
            email: item['customer.email']
          } : null
        }
      }));
      logReport('[Service Analytics] Service analytics by customer fetched:', serviceByCustomer.length, 'customers');
      } catch (customerError) {
      logReportError('[Service Analytics] Error fetching service analytics by customer:', customerError);
      // Don't throw - make it optional
      serviceByCustomer = [];
    }

    // Total revenue from services
    logReport('[Service Analytics] Calculating total revenue and quantity');
    let totalRevenue = 0;
    let totalQuantity = 0;
    try {
      if (hasDateFilter(dateFilter)) {
        const totalResult = await sequelize.query(`
          SELECT 
            SUM("JobItem"."totalPrice") as "totalRevenue",
            SUM("JobItem"."quantity") as "totalQuantity"
          FROM "job_items" AS "JobItem"
          INNER JOIN "jobs" AS "job" ON "JobItem"."jobId" = "job"."id"
          WHERE "JobItem"."tenantId" = :tenantId
            AND "job"."createdAt" BETWEEN :startDate AND :endDate${jobFrag.sql}
        `, {
          replacements: {
            tenantId: req.tenantId,
            startDate: dateFilter[Op.between][0],
            endDate: dateFilter[Op.between][1],
            ...jobFrag.replacements,
          },
          type: sequelize.QueryTypes.SELECT
        });
        totalRevenue = parseFloat(totalResult[0]?.totalRevenue || 0);
        totalQuantity = parseFloat(totalResult[0]?.totalQuantity || 0);
      } else {
        const totalResult = await sequelize.query(`
          SELECT 
            SUM("JobItem"."totalPrice") as "totalRevenue",
            SUM("JobItem"."quantity") as "totalQuantity"
          FROM "job_items" AS "JobItem"
          INNER JOIN "jobs" AS "job" ON "JobItem"."jobId" = "job"."id"
          WHERE "JobItem"."tenantId" = :tenantId${jobFrag.sql}
        `, {
          replacements: {
            tenantId: req.tenantId,
            ...jobFrag.replacements,
          },
          type: sequelize.QueryTypes.SELECT
        });
        totalRevenue = parseFloat(totalResult[0]?.totalRevenue || 0);
        totalQuantity = parseFloat(totalResult[0]?.totalQuantity || 0);
      }
      logReport('[Service Analytics] Total revenue:', totalRevenue, 'Total quantity:', totalQuantity);
      } catch (totalError) {
      logReportError('[Service Analytics] Error calculating totals:', totalError);
      // Use defaults (0)
    }

    const responseData = {
      totalRevenue: totalRevenue,
      totalQuantity: totalQuantity,
      byCategory: serviceAnalytics.map(item => ({
        category: item.category,
        totalRevenue: parseFloat(item.totalRevenue || 0),
        totalQuantity: parseFloat(item.totalQuantity || 0),
        itemCount: parseInt(item.itemCount || 0),
        averagePrice: parseFloat(item.averagePrice || 0),
        minPrice: parseFloat(item.minPrice || 0),
        maxPrice: parseFloat(item.maxPrice || 0)
      })),
      byDate: serviceByDate || [],
      byCustomer: serviceByCustomer || []
    };
    
    logReport('[Service Analytics] Response data summary:', {
      totalRevenue: responseData.totalRevenue,
      totalQuantity: responseData.totalQuantity,
      byCategoryCount: responseData.byCategory.length,
      byDateCount: responseData.byDate.length,
      byCustomerCount: responseData.byCustomer.length
    });

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    logReportError('[Service Analytics] ERROR:', error.message);
    logReportError('[Service Analytics] Stack:', error.stack);
    logReportError('[Service Analytics] Full error:', error);
    next(error);
  }
};

// @desc    Generate AI-powered report analysis
// @route   POST /api/reports/ai-analysis
// @access  Private
exports.generateAIAnalysis = async (req, res, next) => {
  try {
    const openaiService = require('../services/openaiService');
    const { reportData, options = {} } = req.body;

    if (!reportData) {
      return res.status(400).json({
        success: false,
        error: 'Report data is required'
      });
    }

    const tenant = req.tenant || {};
    const businessType = options.businessType ?? tenant.businessType ?? 'printing_press';
    const studioType = options.studioType ?? tenant.metadata?.studioType ?? (['printing_press', 'mechanic', 'barber', 'salon'].includes(businessType) ? businessType : null);

    const analysis = await openaiService.analyzeReportData(reportData, {
      businessType,
      studioType,
      period: options.period,
      startDate: options.startDate,
      endDate: options.endDate,
      ...options,
      tenantId: req.tenantId
    });

    res.status(200).json({
      success: true,
      data: analysis.analysis
    });
  } catch (error) {
    const classified = classifyAiProviderError(error);
    if (classified || error.aiProviderError) {
      const errorCode = classified?.errorCode || error.errorCode || error.code;
      const message = classified?.message || error.message;
      const statusCode = classified?.statusCode || error.statusCode || 503;

      if (errorCode === 'OPENAI_NOT_CONFIGURED') {
        return res.status(200).json({
          success: true,
          data: {
            keyFindings: [
              'Revenue and expense data has been analyzed.',
              'Smart Report generated without AI because no AI key is configured.',
              AI_PROVIDER_USER_MESSAGES.OPENAI_NOT_CONFIGURED,
            ],
            performanceAnalysis: 'The report was generated from business data. AI-powered narrative analysis is disabled until an AI key is configured.',
            recommendations: [],
            riskAssessment: [],
            growthOpportunities: [],
            strategicSuggestions: [
              'Review the financial, sales, expenses, cash flow, and inventory tabs for detailed performance signals.',
            ],
            aiConfigured: false,
            aiUnavailableReason: message,
          },
        });
      }

      if (errorCode === 'AI_PROVIDER_BILLING_REQUIRED') {
        return res.status(200).json({
          success: true,
          data: {
            keyFindings: [
              'Revenue and expense data has been analyzed.',
              message,
            ],
            performanceAnalysis: 'The report was generated from business data. AI insights are unavailable until platform AI credit is restored or a workspace AI key is added.',
            recommendations: [],
            riskAssessment: [],
            growthOpportunities: [],
            strategicSuggestions: [
              'Review the financial, sales, expenses, cash flow, and inventory tabs for detailed performance signals.',
            ],
            aiConfigured: false,
            aiUnavailableReason: message,
          },
        });
      }

      return res.status(statusCode).json({
        success: false,
        error: message,
        errorCode,
        code: errorCode,
      });
    }

    logReportError('Error generating AI analysis:', error);
    // Return a fallback response if OpenAI fails for other reasons
    res.status(200).json({
      success: true,
      data: {
        keyFindings: [
          'Revenue and expense data has been analyzed.',
          'Profit margins indicate business health.',
          'Continue monitoring key performance indicators.'
        ],
        performanceAnalysis: 'The report data shows business performance metrics. Review the detailed sections for specific insights.',
        recommendations: [],
        riskAssessment: [],
        growthOpportunities: [],
        strategicSuggestions: [
          'Continue tracking revenue and expense trends.',
          'Monitor profit margins for optimization opportunities.'
        ],
      }
    });
  }
};

// @desc    Get product sales report (for shop/pharmacy)
// @route   GET /api/reports/product-sales
// @access  Private
exports.getProductSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const saleDateFilter = resolveDateFilterFromQuery(req.query);
    const saleWhere = scopedSaleWhere(req, saleDateFilter);

    // Aggregate sales by product: quantity sold and revenue per product
    const salesByProduct = await SaleItem.findAll({
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('SaleItem.quantity')), 'quantitySold'],
        [sequelize.fn('SUM', sequelize.col('SaleItem.total')), 'revenue']
      ],
      include: [{
        model: Sale,
        as: 'sale',
        attributes: [],
        required: true,
        where: saleWhere
      }],
      group: ['SaleItem.productId'],
      raw: true
    });

    if (!salesByProduct || salesByProduct.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          products: [],
          totalProducts: 0,
          totalRevenue: 0,
          totalQuantitySold: 0,
          totalCost: 0,
          totalGrossProfit: 0
        }
      });
    }

    const productIds = [...new Set(salesByProduct.map((r) => r.productId || r.productid).filter(Boolean))];
    const products = await Product.findAll({
      where: scopedRetailWhere(req, { id: { [Op.in]: productIds } }),
      attributes: ['id', 'name', 'sku', 'unit', 'quantityOnHand', 'reorderLevel'],
      raw: true
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Cost per product (qty sold × unit cost, variant cost preferred over product cost),
    // excluding trackStock=false items to match getRetailCogsTotal / dashboard COGS rule.
    const hasSaleDate = hasDateFilter(saleDateFilter);
    const shopFrag = getShopSqlFragment(req, 's');
    const costRows = await sequelize.query(`
      SELECT si."productId" as "productId",
        SUM(si.quantity * COALESCE(pv."costPrice", p."costPrice", 0)) as "cost"
      FROM sale_items si
      INNER JOIN sales s ON s.id = si."saleId"
      LEFT JOIN products p ON p.id = si."productId"
      LEFT JOIN product_variants pv ON pv.id = si."productVariantId"
      WHERE s."tenantId" = :tenantId AND s.status = 'completed' AND s."deletedAt" IS NULL
        AND COALESCE(p."trackStock", true) != false
        ${hasSaleDate ? 'AND s."createdAt" BETWEEN :startDate AND :endDate' : ''}${shopFrag.sql}
      GROUP BY si."productId"
    `, {
      replacements: {
        tenantId: req.tenantId,
        ...(hasSaleDate && {
          startDate: saleDateFilter[Op.between][0],
          endDate: saleDateFilter[Op.between][1]
        }),
        ...shopFrag.replacements
      },
      type: sequelize.QueryTypes.SELECT
    });
    const costMap = new Map(
      costRows.map((r) => [r.productId || r.productid, parseFloat(r.cost || 0) || 0])
    );

    let totalRevenue = 0;
    let totalQuantitySold = 0;
    let totalCost = 0;
    const productsList = salesByProduct.map((row) => {
      const pid = row.productId || row.productid;
      const product = productMap.get(pid);
      const quantitySold = Number(parseFloat(row.quantitySold || 0)) || 0;
      const revenue = Number(parseFloat(row.revenue || 0)) || 0;
      const cost = Number(costMap.get(pid) || 0);
      const grossProfit = revenue - cost;
      const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      totalRevenue += revenue;
      totalQuantitySold += quantitySold;
      totalCost += cost;

      const currentStock = Number(parseFloat(product?.quantityOnHand || 0)) || 0;
      const safetyStock = Number(parseFloat(product?.reorderLevel || 0)) || 0;
      const stockPercentage = safetyStock > 0 ? Math.min(100, (currentStock / safetyStock) * 100) : 100;
      const isLowStock = safetyStock > 0 && currentStock <= safetyStock;
      const isHighRisk = safetyStock > 0 && currentStock > safetyStock * 3;

      return {
        productName: product?.name || 'Unknown',
        quantitySold,
        revenue,
        cost,
        grossProfit,
        margin: Math.round(margin * 10) / 10,
        currentStock,
        safetyStock,
        unit: product?.unit || 'pcs',
        sku: product?.sku || null,
        isLowStock: Boolean(isLowStock),
        isHighRisk: Boolean(isHighRisk),
        stockPercentage: Math.round(stockPercentage * 10) / 10
      };
    });

    // Sort by revenue descending
    productsList.sort((a, b) => b.revenue - a.revenue);

    res.status(200).json({
      success: true,
      data: {
        products: productsList,
        totalProducts: productsList.length,
        totalRevenue,
        totalQuantitySold,
        totalCost,
        totalGrossProfit: totalRevenue - totalCost
      }
    });
  } catch (error) {
    logReportError('Error getting product sales report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get product sales report'
    });
  }
};

// @desc    Get prescription report (pharmacy)
// @route   GET /api/reports/prescription-report
// @access  Private
exports.getPrescriptionReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = resolveDateFilterFromQuery(req.query);

    const prescWhere = applyTenantFilter(req.tenantId, {
      ...(hasDateFilter(dateFilter) && { prescriptionDate: dateFilter })
    });

    // Count by status
    const byStatus = await Prescription.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: prescWhere,
      group: ['status'],
      raw: true
    });

    const statusCounts = { pending: 0, filled: 0, partially_filled: 0, cancelled: 0, expired: 0 };
    byStatus.forEach((row) => {
      const status = (row.status || '').replace(/-/g, '_');
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status] = parseInt(row.count, 10) || 0;
      }
    });

    const totalPrescriptions = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);

    // Revenue from prescription invoices (paid invoices with sourceType prescription)
    const prescriptionRevenue = await Invoice.sum('amountPaid', {
      where: {
        ...buildCollectedRevenueWhere(req, dateFilter),
        sourceType: 'prescription'
      }
    }) || 0;

    // Fulfillment rate: filled / (filled + partially_filled + pending)
    const filled = statusCounts.filled;
    const partial = statusCounts.partially_filled;
    const pending = statusCounts.pending;
    const fulfillDenom = filled + partial + pending;
    const fulfillmentRate = fulfillDenom > 0 ? ((filled + partial * 0.5) / fulfillDenom) * 100 : 0;

    // Top drugs by quantity filled (PrescriptionItem.quantityFilled)
    let topDrugs = [];
    if (hasDateFilter(dateFilter)) {
      const items = await PrescriptionItem.findAll({
        attributes: [
          'drugId',
          [sequelize.fn('SUM', sequelize.col('quantityFilled')), 'quantityFilled'],
          [sequelize.fn('COUNT', sequelize.col('prescriptionId')), 'prescriptionCount']
        ],
        include: [{
          model: Prescription,
          as: 'prescription',
          attributes: [],
          required: true,
          where: prescWhere
        }],
        group: ['drugId'],
        order: [[sequelize.fn('SUM', sequelize.col('quantityFilled')), 'DESC']],
        limit: 10,
        raw: true
      });

      const drugIds = [...new Set(items.map((i) => i.drugId).filter(Boolean))];
      const drugs = await Drug.findAll({
        where: applyTenantFilter(req.tenantId, { id: { [Op.in]: drugIds } }),
        attributes: ['id', 'name', 'genericName'],
        raw: true
      });
      const drugMap = new Map(drugs.map((d) => [d.id, d]));

      topDrugs = items.map((row) => ({
        drugId: row.drugId,
        drugName: drugMap.get(row.drugId)?.name || 'Unknown',
        quantityFilled: parseFloat(row.quantityFilled || 0),
        prescriptionCount: parseInt(row.prescriptionCount, 10) || 0
      }));
    }

    res.status(200).json({
      success: true,
      data: {
        byStatus: statusCounts,
        totalPrescriptions,
        prescriptionRevenue: parseFloat(prescriptionRevenue),
        fulfillmentRate: Math.round(fulfillmentRate * 10) / 10,
        topDrugs
      }
    });
  } catch (error) {
    logReportError('Error getting prescription report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get prescription report'
    });
  }
};

// @desc    Get product stock summary (Product model - goods for sale)
// @route   GET /api/reports/product-stock-summary
// @access  Private
exports.getProductStockSummary = async (req, res, next) => {
  try {
    const productWhere = scopedRetailWhere(req, {});
    const totalProducts = await Product.count({ where: productWhere });
    const inStockCount = await Product.count({
      where: { ...productWhere, quantityOnHand: { [Op.gt]: 0 } }
    });
    const stockValueResult = await Product.findAll({
      attributes: [
        [sequelize.literal('COALESCE(SUM("Product"."quantityOnHand" * "Product"."costPrice"), 0)'), 'totalStockValue']
      ],
      where: productWhere,
      raw: true
    });
    const totalStockValue = parseFloat(stockValueResult[0]?.totalStockValue || 0);
    const stockAvailabilityRate = totalProducts > 0 ? Math.round((inStockCount / totalProducts) * 1000) / 10 : 0;

    res.status(200).json({
      success: true,
      data: {
        totalStocks: totalProducts,
        totalStockValue,
        stockAvailabilityRate,
        inStockCount,
        isSnapshot: true,
        snapshotLabel: 'Current stock levels (as of today)',
      }
    });
  } catch (error) {
    logReportError('Error getting product stock summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get product stock summary'
    });
  }
};

// @desc    Get materials summary (MaterialItem - supplies used by the business)
// @route   GET /api/reports/materials-summary
// @access  Private
exports.getMaterialsSummary = async (req, res, next) => {
  try {
    const where = scopedReportWhere(req, {});
    const [totals] = await MaterialItem.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('MaterialItem.id')), 'totalItems'],
        [sequelize.fn('SUM', sequelize.col('MaterialItem.quantityOnHand')), 'totalQuantity'],
        [sequelize.fn('SUM', sequelize.literal('"MaterialItem"."quantityOnHand" * "MaterialItem"."unitCost"')), 'materialsValue'],
        [sequelize.fn('SUM', sequelize.literal(`CASE WHEN "MaterialItem"."quantityOnHand" <= "MaterialItem"."reorderLevel" THEN 1 ELSE 0 END`)), 'lowStockCount'],
        [sequelize.fn('SUM', sequelize.literal(`CASE WHEN "MaterialItem"."quantityOnHand" > 0 AND "MaterialItem"."quantityOnHand" > "MaterialItem"."reorderLevel" THEN 1 ELSE 0 END`)), 'inStockCount'],
        [sequelize.fn('SUM', sequelize.literal(`CASE WHEN "MaterialItem"."quantityOnHand" <= 0 THEN 1 ELSE 0 END`)), 'outOfStockCount']
      ],
      where,
      raw: true
    });
    const totalItems = totals ? parseInt(totals.totalItems || 0, 10) : 0;
    const totalStockValue = parseFloat(totals?.materialsValue || 0);
    const inStockCount = totals ? parseInt(totals.inStockCount || 0, 10) : 0;
    const stockAvailabilityRate = totalItems > 0 ? Math.round((inStockCount / totalItems) * 1000) / 10 : 0;

    res.status(200).json({
      success: true,
      data: {
        totalStocks: totalItems,
        totalStockValue,
        stockAvailabilityRate,
        inStockCount: inStockCount || 0,
        isSnapshot: true,
        snapshotLabel: 'Current materials on hand (as of today)',
      }
    });
  } catch (error) {
    logReportError('Error getting materials summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get materials summary'
    });
  }
};

// @desc    Get materials movements (MaterialItem/MaterialMovement)
// @route   GET /api/reports/materials-movements
// @access  Private
exports.getMaterialsMovements = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = resolveDateFilterFromQuery(req.query);

    const movementWhere = scopedReportWhere(req, {
      ...(hasDateFilter(dateFilter) && { occurredAt: dateFilter })
    });

    const movements = await MaterialMovement.findAll({
      where: movementWhere,
      include: [{
        model: MaterialItem,
        as: 'item',
        attributes: ['id', 'name', 'sku', 'unit']
      }],
      order: [['occurredAt', 'DESC']],
      limit: 100,
      raw: false
    });

    const data = movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantityDelta: parseFloat(m.quantityDelta),
      previousQuantity: parseFloat(m.previousQuantity),
      newQuantity: parseFloat(m.newQuantity),
      occurredAt: m.occurredAt,
      itemName: m.item?.name || 'Unknown',
      itemSku: m.item?.sku,
      unit: m.item?.unit || 'pcs'
    }));

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logReportError('Error getting materials movements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get materials movements'
    });
  }
};

// @desc    Get fastest moving items (by quantity sold in date range)
// @route   GET /api/reports/fastest-moving-items
// @access  Private
exports.getFastestMovingItems = async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 5 } = req.query;

    const saleDateFilter = resolveDateFilterFromQuery(req.query);

    const saleWhere = scopedSaleWhere(req, saleDateFilter);

    const items = await SaleItem.findAll({
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('SaleItem.quantity')), 'quantitySold']
      ],
      include: [{
        model: Sale,
        as: 'sale',
        attributes: [],
        required: true,
        where: saleWhere
      }],
      group: ['SaleItem.productId'],
      order: [[sequelize.literal('SUM("SaleItem"."quantity")'), 'DESC']],
      limit: Math.min(Number(limit) || 5, 50),
      raw: true
    });

    if (!items || items.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const productIds = [...new Set(items.map((r) => r.productId || r.productid).filter(Boolean))];
    const products = await Product.findAll({
      where: applyTenantFilter(req.tenantId, { id: { [Op.in]: productIds } }),
      attributes: ['id', 'name', 'sku', 'unit'],
      raw: true
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const data = items.map((row) => {
      const pid = row.productId || row.productid;
      const product = productMap.get(pid);
      return {
        productId: pid,
        productName: product?.name || 'Unknown',
        quantitySold: parseFloat(row.quantitySold || 0),
        unit: product?.unit || 'pcs'
      };
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logReportError('Error getting fastest moving items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get fastest moving items'
    });
  }
};

// @desc    Get revenue by channel (payment method)
// @route   GET /api/reports/revenue-by-channel
// @access  Private
exports.getRevenueByChannel = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = resolveDateFilterFromQuery(req.query);

    const channelMap = new Map();

    // Income payments (invoice/job payments) by payment method — studio types only
    if (!isRetailBusiness(req)) {
      const paymentWhere = applyTenantFilter(req.tenantId, {
        type: 'income',
        status: 'completed',
        ...(hasDateFilter(dateFilter) && { paymentDate: dateFilter })
      });
      const byPayment = await Payment.findAll({
        attributes: [
          'paymentMethod',
          [sequelize.fn('SUM', sequelize.col('amount')), 'total']
        ],
        where: paymentWhere,
        group: ['paymentMethod'],
        raw: true
      });
      byPayment.forEach((row) => {
        const method = (row.paymentMethod || 'other').toString();
        const rev = parseFloat(row.total || 0);
        channelMap.set(method, (channelMap.get(method) || 0) + rev);
      });
    }

    // Completed sales by payment method (shop/pharmacy)
    const saleWhere = scopedSaleWhere(req, dateFilter);
    const bySale = await Sale.findAll({
      attributes: [
        'paymentMethod',
        [sequelize.fn('SUM', sequelize.col('total')), 'total']
      ],
      where: saleWhere,
      group: ['paymentMethod'],
      raw: true
    });
    bySale.forEach((row) => {
      const method = (row.paymentMethod || 'other').toString();
      const rev = parseFloat(row.total || 0);
      channelMap.set(method, (channelMap.get(method) || 0) + rev);
    });

    const labels = { cash: 'Cash', mobile_money: 'MoMo', card: 'Card', credit_card: 'Card', check: 'Check', bank_transfer: 'Bank Transfer', credit: 'Credit', other: 'Other' };
    const data = [...channelMap.entries()]
      .map(([channel, revenue]) => ({ channel: labels[channel] || channel, revenue }))
      .filter((d) => d.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logReportError('Error getting revenue by channel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get revenue by channel'
    });
  }
};

// --- Batched overview endpoints (fewer round trips for Reports page) ---

/**
 * Run a report handler with a mock res that captures the JSON body.
 * @param {Function} handler - getRevenueReport, getExpenseReport, etc.
 * @param {object} req - Express req (tenantId, query)
 * @returns {Promise<{ success: boolean, data?: any }>} Resolves with the body the handler passed to res.json()
 */
function runReportHandler(handler, req) {
  return new Promise((resolve, reject) => {
    const noop = () => {};
    const res = {
      status(code) {
        return { json: (body) => { resolve(body); return res; } };
      },
      json(body) {
        resolve(body);
      }
    };
    const next = (err) => { if (err) reject(err); };
    Promise.resolve(handler(req, res, next)).catch(reject);
  });
}

/**
 * @desc    Get VAT/Tax report - summary of VAT collected from invoices and sales
 * @route   GET /api/reports/vat
 * @access  Private
 */
exports.getVatReport = async (req, res, next) => {
  try {
    logReport('[VAT Report] Starting VAT report generation');
    logReport('[VAT Report] Tenant ID:', req.tenantId);
    const { startDate, endDate, groupBy = 'month' } = req.query;
    logReport('[VAT Report] Query params:', { startDate, endDate, groupBy });

    const dateFilter = resolveDateFilterFromQuery(req.query);
    const invoiceDateFilter = hasDateFilter(dateFilter) ? { invoiceDate: dateFilter } : {};
    const saleDateFilter = hasDateFilter(dateFilter) ? { createdAt: dateFilter } : {};
    if (hasDateFilter(dateFilter)) {
      const [start, end] = dateFilter[Op.between];
      logReport('[VAT Report] Date filter applied:', { start, end });
    }

    // Get VAT from invoices — exclude drafts (not yet issued, no VAT liability) and
    // cancelled invoices (voided, no VAT collected) so this report doesn't overstate VAT owed.
    const invoiceVatWhere = scopedReportWhere(req, {
      status: { [Op.notIn]: ['draft', 'cancelled'] },
      ...invoiceDateFilter
    });

    const invoiceVatTotal = await Invoice.findOne({
      attributes: [
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('taxAmount')), 0), 'totalVat'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('subtotal')), 0), 'totalSubtotal'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount']
      ],
      where: invoiceVatWhere,
      raw: true
    });

    // Get VAT from sales (POS) — exclude cancelled/refunded sales (no VAT owed on voided or
    // fully-refunded transactions) and soft-deleted sales; pending/partially_paid sales still
    // owe VAT since the sale itself is finalized even if payment is outstanding.
    const saleVatWhere = scopedRetailWhere(req, {
      status: { [Op.notIn]: ['cancelled', 'refunded'] },
      deletedAt: null,
      ...saleDateFilter
    });

    const saleVatTotal = await Sale.findOne({
      attributes: [
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('tax')), 0), 'totalVat'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('subtotal')), 0), 'totalSubtotal'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'saleCount']
      ],
      where: saleVatWhere,
      raw: true
    });

    // Get VAT breakdown by period (invoices)
    let invoiceVatByPeriod = [];
    if (groupBy === 'month') {
      invoiceVatByPeriod = await Invoice.findAll({
        attributes: [
          [sequelize.fn('EXTRACT', sequelize.literal('MONTH FROM "invoiceDate"')), 'month'],
          [sequelize.fn('EXTRACT', sequelize.literal('YEAR FROM "invoiceDate"')), 'year'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('taxAmount')), 0), 'vatAmount'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('subtotal')), 0), 'subtotal'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: invoiceVatWhere,
        group: [
          sequelize.fn('EXTRACT', sequelize.literal('YEAR FROM "invoiceDate"')),
          sequelize.fn('EXTRACT', sequelize.literal('MONTH FROM "invoiceDate"'))
        ],
        order: [
          [sequelize.fn('EXTRACT', sequelize.literal('YEAR FROM "invoiceDate"')), 'ASC'],
          [sequelize.fn('EXTRACT', sequelize.literal('MONTH FROM "invoiceDate"')), 'ASC']
        ],
        raw: true
      });
    } else {
      invoiceVatByPeriod = await Invoice.findAll({
        attributes: [
          [sequelize.literal('CAST("invoiceDate" AS DATE)'), 'date'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('taxAmount')), 0), 'vatAmount'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('subtotal')), 0), 'subtotal'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: invoiceVatWhere,
        group: [sequelize.literal('CAST("invoiceDate" AS DATE)')],
        order: [[sequelize.literal('CAST("invoiceDate" AS DATE)'), 'ASC']],
        raw: true
      });
    }

    // Get VAT breakdown by period (sales)
    let saleVatByPeriod = [];
    if (groupBy === 'month') {
      saleVatByPeriod = await Sale.findAll({
        attributes: [
          [sequelize.fn('EXTRACT', sequelize.literal('MONTH FROM "createdAt"')), 'month'],
          [sequelize.fn('EXTRACT', sequelize.literal('YEAR FROM "createdAt"')), 'year'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('tax')), 0), 'vatAmount'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('subtotal')), 0), 'subtotal'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: saleVatWhere,
        group: [
          sequelize.fn('EXTRACT', sequelize.literal('YEAR FROM "createdAt"')),
          sequelize.fn('EXTRACT', sequelize.literal('MONTH FROM "createdAt"'))
        ],
        order: [
          [sequelize.fn('EXTRACT', sequelize.literal('YEAR FROM "createdAt"')), 'ASC'],
          [sequelize.fn('EXTRACT', sequelize.literal('MONTH FROM "createdAt"')), 'ASC']
        ],
        raw: true
      });
    } else {
      saleVatByPeriod = await Sale.findAll({
        attributes: [
          [sequelize.literal('CAST("createdAt" AS DATE)'), 'date'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('tax')), 0), 'vatAmount'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('subtotal')), 0), 'subtotal'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: saleVatWhere,
        group: [sequelize.literal('CAST("createdAt" AS DATE)')],
        order: [[sequelize.literal('CAST("createdAt" AS DATE)'), 'ASC']],
        raw: true
      });
    }

    // Combine and calculate totals
    const invoiceVat = parseFloat(invoiceVatTotal?.totalVat || 0);
    const saleVat = parseFloat(saleVatTotal?.totalVat || 0);
    const totalVatCollected = invoiceVat + saleVat;
    
    const invoiceSubtotal = parseFloat(invoiceVatTotal?.totalSubtotal || 0);
    const saleSubtotal = parseFloat(saleVatTotal?.totalSubtotal || 0);
    const totalTaxableAmount = invoiceSubtotal + saleSubtotal;

    // Merge period data
    const periodMap = new Map();
    
    const formatPeriodKey = (item) => {
      if (groupBy === 'month') {
        return `${item.year}-${String(item.month).padStart(2, '0')}`;
      }
      return item.date;
    };

    invoiceVatByPeriod.forEach(item => {
      const key = formatPeriodKey(item);
      const existing = periodMap.get(key) || { 
        period: key, 
        invoiceVat: 0, 
        saleVat: 0, 
        totalVat: 0,
        invoiceSubtotal: 0,
        saleSubtotal: 0,
        totalTaxable: 0,
        invoiceCount: 0,
        saleCount: 0
      };
      existing.invoiceVat = parseFloat(item.vatAmount || 0);
      existing.invoiceSubtotal = parseFloat(item.subtotal || 0);
      existing.invoiceCount = parseInt(item.count || 0);
      existing.totalVat = existing.invoiceVat + existing.saleVat;
      existing.totalTaxable = existing.invoiceSubtotal + existing.saleSubtotal;
      periodMap.set(key, existing);
    });

    saleVatByPeriod.forEach(item => {
      const key = formatPeriodKey(item);
      const existing = periodMap.get(key) || { 
        period: key, 
        invoiceVat: 0, 
        saleVat: 0, 
        totalVat: 0,
        invoiceSubtotal: 0,
        saleSubtotal: 0,
        totalTaxable: 0,
        invoiceCount: 0,
        saleCount: 0
      };
      existing.saleVat = parseFloat(item.vatAmount || 0);
      existing.saleSubtotal = parseFloat(item.subtotal || 0);
      existing.saleCount = parseInt(item.count || 0);
      existing.totalVat = existing.invoiceVat + existing.saleVat;
      existing.totalTaxable = existing.invoiceSubtotal + existing.saleSubtotal;
      periodMap.set(key, existing);
    });

    const byPeriod = Array.from(periodMap.values()).sort((a, b) => 
      a.period.localeCompare(b.period)
    );

    // Calculate effective tax rate
    const effectiveTaxRate = totalTaxableAmount > 0 
      ? ((totalVatCollected / totalTaxableAmount) * 100).toFixed(2)
      : '0.00';

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalVatCollected,
          totalTaxableAmount,
          effectiveTaxRate: parseFloat(effectiveTaxRate),
          invoiceVat,
          saleVat,
          invoiceCount: parseInt(invoiceVatTotal?.invoiceCount || 0),
          saleCount: parseInt(saleVatTotal?.saleCount || 0)
        },
        byPeriod,
        dateRange: startDate && endDate ? { startDate, endDate } : null
      }
    });
  } catch (error) {
    logReportError('[VAT Report] Error:', error);
    next(error);
  }
};

/**
 * @desc    Batched overview phase 1 (revenue, expenses, outstanding, sales, serviceAnalytics, productSales)
 * @route   GET /api/reports/overview/phase1
 * @access  Private
 */
exports.getOverviewPhase1 = async (req, res, next) => {
  try {
    const includeProductSales = req.query.includeProductSales === 'true' || isRetailBusiness(req);
    const slimOutstandingHandler = (innerReq, innerRes, innerNext) =>
      exports.getOutstandingPaymentsReport(
        {
          ...innerReq,
          query: { ...(innerReq.query || {}), slim: 'true', overview: 'true' },
        },
        innerRes,
        innerNext
      );
    const handlers = [
      exports.getRevenueReport,
      exports.getExpenseReport,
      slimOutstandingHandler,
      exports.getSalesReport,
    ];
    if (!isRetailBusiness(req)) {
      handlers.push(exports.getServiceAnalyticsReport);
    }
    if (includeProductSales) {
      handlers.push(exports.getProductSalesReport);
    }
    const results = await Promise.all(
      handlers.map((handler) =>
        runReportHandler(handler, req).catch((err) => {
          logReportError('[Overview Phase1] Handler error:', err?.message || err);
          return { success: false, data: null };
        })
      )
    );
    const retail = isRetailBusiness(req);
    const revenue = results[0];
    const expenses = results[1];
    const outstanding = results[2];
    const sales = results[3];
    const serviceAnalytics = retail ? null : results[4];
    const productSalesData = retail
      ? (includeProductSales ? results[4] : null)
      : (includeProductSales ? results[5] : null);
    const data = {
      revenue: revenue?.success ? revenue.data : { totalRevenue: 0, byPeriod: [], byCustomer: [] },
      expenses: expenses?.success ? expenses.data : { totalExpenses: 0, byCategory: [] },
      outstanding: outstanding?.success ? outstanding.data : { totalOutstanding: 0 },
      sales: sales?.success ? sales.data : { totalJobs: 0, totalSales: 0, byCustomer: [], byStatus: [], byDate: [], byJobType: [] },
      serviceAnalytics: serviceAnalytics?.success ? serviceAnalytics.data : { totalRevenue: 0, byCategory: [], byDate: [], byCustomer: [] },
      productSales: productSalesData?.success ? productSalesData.data : { products: [], totalRevenue: 0, totalQuantitySold: 0 },
      businessType: resolveBusinessType(req.tenant?.businessType)
    };
    res.status(200).json({ success: true, data });
  } catch (error) {
    logReportError('Error in getOverviewPhase1:', error);
    next(error);
  }
};

/**
 * @desc    Batched overview phase 2 (product stock, materials, KPI, top customers, pipeline, revenue by channel)
 * @route   GET /api/reports/overview/phase2
 * @access  Private
 */
exports.getOverviewPhase2 = async (req, res, next) => {
  try {
    const retail = isRetailBusiness(req);
    const studio = isStudioBusiness(req);
    const dateFilter = resolveDateFilterFromQuery(req.query);

    const handlerEntries = [
      ...(retail ? [
        ['productStockSummary', exports.getProductStockSummary],
        ['fastestMovingItems', exports.getFastestMovingItems],
      ] : []),
      ...(!retail ? [
        ['materialsSummary', exports.getMaterialsSummary],
        ['materialsMovements', exports.getMaterialsMovements],
      ] : []),
      ['revenueByChannel', exports.getRevenueByChannel],
      ['topCustomers', exports.getTopCustomers],
      ...(studio ? [['pipelineSummary', exports.getPipelineSummary]] : []),
    ];

    const [
      revenueResult,
      expenseResult,
      cogs,
      activeCustomers,
      pendingInvoicesRaw,
      ...handlerResults
    ] = await Promise.all([
      runReportHandler(exports.getRevenueReport, req).catch((err) => {
        logReportError('[Overview Phase2] Revenue error:', err?.message || err);
        return { success: false, data: null };
      }),
      runReportHandler(exports.getExpenseReport, req).catch((err) => {
        logReportError('[Overview Phase2] Expense error:', err?.message || err);
        return { success: false, data: null };
      }),
      getRetailCogsTotal(req, dateFilter),
      Customer.count({
        where: scopedReportWhere(req, { isActive: true }),
      }),
      Invoice.sum('balance', {
        where: buildOutstandingInvoiceWhere(req, dateFilter),
      }),
      ...handlerEntries.map(([, handler]) =>
        runReportHandler(handler, req).catch((err) => {
          logReportError('[Overview Phase2] Handler error:', err?.message || err);
          return { success: false, data: null };
        })
      ),
    ]);

    const totalRevenue = parseFloat(revenueResult?.data?.totalRevenue || 0);
    const operatingExpenses = parseFloat(expenseResult?.data?.totalExpenses || 0);
    const cogsTotal = parseFloat(cogs || 0);
    const grossProfit = totalRevenue - cogsTotal;
    const netProfit = grossProfit - operatingExpenses;

    const defaults = {
      productStockSummary: { totalStocks: 0, totalStockValue: 0, stockAvailabilityRate: 0 },
      materialsSummary: { totalStocks: 0, totalStockValue: 0, stockAvailabilityRate: 0 },
      materialsMovements: [],
      fastestMovingItems: [],
      revenueByChannel: [],
      kpiSummary: {
        totalRevenue,
        totalExpenses: operatingExpenses + cogsTotal,
        operatingExpenses,
        cogs: cogsTotal,
        // grossProfit = revenue - COGS; netProfit = grossProfit - operating expenses.
        grossProfit: parseFloat(grossProfit.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2)),
        activeCustomers: Number(activeCustomers || 0),
        pendingInvoices: parseFloat(pendingInvoicesRaw || 0),
      },
      topCustomers: [],
      pipelineSummary: { activeJobs: 0, openLeads: 0, pendingInvoices: 0 },
    };

    const data = { ...defaults, businessType: resolveBusinessType(req.tenant?.businessType) };
    handlerEntries.forEach(([key], index) => {
      const result = handlerResults[index];
      data[key] = result?.success ? result.data : defaults[key];
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    logReportError('Error in getOverviewPhase2:', error);
    next(error);
  }
};

/**
 * Compute overview KPI metrics for a date range.
 * @param {import('express').Request} req
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @returns {Promise<Object>}
 */
async function computeOverviewPeriodMetrics(req, rangeStart, rangeEnd) {
  const dateFilter = { [Op.between]: [rangeStart, rangeEnd] };
  const endOfRange = new Date(rangeEnd);

  const customerScopeAtEnd = scopedReportWhere(req, {
    isActive: true,
    createdAt: { [Op.lte]: endOfRange }
  });

  const invoicePeriodWhere = scopedReportWhere(req, {
    status: { [Op.ne]: 'cancelled' },
    invoiceDate: dateFilter
  });

  const expenseWhere = scopedReportWhere(req, {
    approvalStatus: 'approved',
    isArchived: false,
    expenseDate: dateFilter
  });

  const [
    totalRevenueRaw,
    totalExpenses,
    totalCogs,
    newCustomers,
    activeCustomers,
    invoiceAggregates,
    outstandingInPeriod,
    totalOutstandingAll,
    retailSaleCount,
    retailSalePaid
  ] = await Promise.all([
    resolveOverviewRevenueTotal(req, dateFilter),
    Expense.sum('amount', { where: expenseWhere }) || 0,
    getRetailCogsTotal(req, dateFilter),
    Customer.count({
      where: scopedReportWhere(req, {
        isActive: true,
        createdAt: dateFilter
      })
    }),
    Customer.count({ where: customerScopeAtEnd }),
    isRetailBusiness(req)
      ? Promise.resolve(null)
      : Invoice.findOne({
          attributes: [
            [sequelize.fn('SUM', sequelize.col('total')), 'totalInvoiced'],
            [sequelize.fn('SUM', sequelize.col('amountPaid')), 'totalCollected'],
            [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount']
          ],
          where: invoicePeriodWhere,
          raw: true
        }),
    Invoice.sum('balance', {
      where: scopedReportWhere(req, {
        status: { [Op.in]: ['sent', 'partial', 'overdue'] },
        balance: { [Op.gt]: 0 },
        invoiceDate: dateFilter
      })
    }) || 0,
    Invoice.sum('balance', {
      where: scopedReportWhere(req, {
        status: { [Op.in]: ['sent', 'partial', 'overdue'] },
        balance: { [Op.gt]: 0 }
      })
    }) || 0,
    isRetailBusiness(req)
      ? Sale.count({ where: scopedSaleWhere(req, dateFilter) })
      : Promise.resolve(0),
    isRetailBusiness(req)
      ? collectedRevenueService.sumCollectedRevenue(req, dateFilter, {
          mode: 'retail',
          fallbackField: 'amountPaid',
        })
      : Promise.resolve(0)
  ]);

  const revenue = parseFloat(totalRevenueRaw || 0);
  const operatingExpenses = parseFloat(totalExpenses || 0);
  const cogs = parseFloat(totalCogs || 0);
  const expenses = operatingExpenses + cogs;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - operatingExpenses;
  const grossProfitMargin = revenue > 0 ? parseFloat(((grossProfit / revenue) * 100).toFixed(2)) : 0;
  const netProfitMargin = revenue > 0 ? parseFloat(((netProfit / revenue) * 100).toFixed(2)) : 0;

  let averageInvoiceValue = 0;
  let collectionRate = 0;

  if (isRetailBusiness(req)) {
    const saleCount = parseInt(retailSaleCount || 0, 10);
    averageInvoiceValue = saleCount > 0 ? parseFloat((revenue / saleCount).toFixed(2)) : 0;
    const salePaid = parseFloat(retailSalePaid || 0);
    // With payment-ledger revenue, salePaid and revenue are both collections — rate ~100%.
    collectionRate = revenue > 0 ? parseFloat(((Math.min(salePaid, revenue) / revenue) * 100).toFixed(2)) : 100;
  } else {
    const totalInvoiced = parseFloat(invoiceAggregates?.totalInvoiced || 0);
    const totalCollected = parseFloat(invoiceAggregates?.totalCollected || 0);
    const invoiceCount = parseInt(invoiceAggregates?.invoiceCount || 0, 10);
    averageInvoiceValue = invoiceCount > 0 ? parseFloat((totalInvoiced / invoiceCount).toFixed(2)) : 0;
    collectionRate = totalInvoiced > 0
      ? parseFloat(((totalCollected / totalInvoiced) * 100).toFixed(2))
      : 0;
  }

  return {
    totalRevenue: revenue,
    // totalExpenses is a COMBINED subtotal (operatingExpenses + cogs) kept for backward
    // compatibility with older consumers. UI surfaces must NOT label this "Total Expenses"
    // on its own — always show operatingExpenses and cogs as separate cards/lines so cost of
    // goods sold is never mistaken for (or lumped into) the Expenses table/page totals.
    totalExpenses: expenses,
    operatingExpenses: parseFloat(operatingExpenses.toFixed(2)),
    cogs: parseFloat(cogs.toFixed(2)),
    netProfit: parseFloat(netProfit.toFixed(2)),
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    grossProfitMargin,
    netProfitMargin,
    newCustomers: newCustomers || 0,
    activeCustomers: activeCustomers || 0,
    averageInvoiceValue,
    collectionRate,
    outstandingAmount: parseFloat(outstandingInPeriod || 0),
    totalOutstanding: parseFloat(totalOutstandingAll || 0),
    revenueSource: 'payments',
    averageMetricLabel: isRetailBusiness(req) ? 'averageSaleValue' : 'averageInvoiceValue'
  };
}

/**
 * @desc    Extended overview KPIs with previous-period comparison
 * @route   GET /api/reports/overview/extended-kpis
 * @access  Private
 */
exports.getOverviewExtendedKpis = async (req, res, next) => {
  try {
    const { startDate, endDate, compareStartDate, compareEndDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const currentRange = parseReportDateRange(startDate, endDate);
    if (!currentRange) {
      return res.status(400).json({
        success: false,
        error: 'Invalid startDate or endDate'
      });
    }
    const [rangeStart, rangeEnd] = currentRange[Op.between];

    const current = await computeOverviewPeriodMetrics(req, rangeStart, rangeEnd);

    let previous = null;
    let comparisonLabel = 'vs previous period';
    if (compareStartDate && compareEndDate) {
      const prevRange = parseReportDateRange(compareStartDate, compareEndDate);
      if (prevRange) {
        const [prevStart, prevEnd] = prevRange[Op.between];
        previous = await computeOverviewPeriodMetrics(req, prevStart, prevEnd);
      }
    }

    const pctChange = (curr, prev) => {
      const c = Number(curr) || 0;
      const p = Number(prev) || 0;
      if (p > 0) return parseFloat((((c - p) / p) * 100).toFixed(2));
      if (c > 0 && p <= 0) return 100;
      if (c <= 0 && p > 0) return -100;
      return 0;
    };

    const comparison = previous
      ? {
          label: comparisonLabel,
          totalRevenue: pctChange(current.totalRevenue, previous.totalRevenue),
          totalExpenses: pctChange(current.totalExpenses, previous.totalExpenses),
          operatingExpenses: pctChange(current.operatingExpenses, previous.operatingExpenses),
          cogs: pctChange(current.cogs, previous.cogs),
          netProfit: pctChange(current.netProfit, previous.netProfit),
          grossProfitMargin: pctChange(current.grossProfitMargin, previous.grossProfitMargin),
          netProfitMargin: pctChange(current.netProfitMargin, previous.netProfitMargin),
          newCustomers: pctChange(current.newCustomers, previous.newCustomers),
          activeCustomers: pctChange(current.activeCustomers, previous.activeCustomers),
          averageInvoiceValue: pctChange(current.averageInvoiceValue, previous.averageInvoiceValue),
          collectionRate: pctChange(current.collectionRate, previous.collectionRate),
          outstandingAmount: pctChange(current.outstandingAmount, previous.outstandingAmount)
        }
      : null;

    res.status(200).json({
      success: true,
      data: {
        current,
        previous,
        comparison,
        businessType: resolveBusinessType(req.tenant?.businessType)
      }
    });
  } catch (error) {
    logReportError('Error in getOverviewExtendedKpis:', error);
    next(error);
  }
};