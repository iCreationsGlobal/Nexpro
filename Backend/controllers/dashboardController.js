const { sequelize } = require('../config/database');
const { Job, Expense, Customer, Vendor, Invoice, Tenant, Sale, SaleItem, InventoryItem, Product } = require('../models');
const { Op } = require('sequelize');
const config = require('../config/config');
const { getPagination } = require('../utils/paginationUtils');
const { getPreviousPeriodDates, calculateComparison } = require('../utils/periodComparison');
const { applyShopFilter, getShopSqlFragment } = require('../utils/shopUtils');
const { applyStudioLocationFilter, getStudioLocationSqlFragment } = require('../utils/studioLocationUtils');
const { applyTenantFilter } = require('../utils/tenantUtils');
const { resolveBusinessType } = require('../config/businessTypes');
const { normalizeTenantClassification } = require('../utils/tenantClassification');

const logDashboardDebug = (...args) => {
  if (config.nodeEnv === 'development') {
    console.log('[DashboardController]', ...args);
  }
};

/** SQL fragment for rental branch scoping (branchId maps to shop scope). */
const getBranchSqlFragment = (req, tableAlias = '') => {
  const col = tableAlias ? `${tableAlias}."branchId"` : '"branchId"';
  if (!req.shopScoped) {
    return { sql: '', replacements: {} };
  }
  if (req.shopFilterId) {
    return {
      sql: ` AND (${col} = :shopFilterId OR ${col} IS NULL)`,
      replacements: { shopFilterId: req.shopFilterId },
    };
  }
  if (!req.canAccessAllShops && req.allowedShopIds?.length) {
    return {
      sql: ` AND (${col} IN (:allowedShopIds) OR ${col} IS NULL)`,
      replacements: { allowedShopIds: req.allowedShopIds },
    };
  }
  return { sql: '', replacements: {} };
};

// Simple in-memory cache for dashboard data
// TTL: 30 seconds - dashboard data doesn't need real-time updates
const dashboardCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

function getCacheKey(tenantId, startDate, endDate, filterType, scope = '') {
  return `${tenantId}:${scope || 'none'}:${startDate || 'default'}:${endDate || 'default'}:${filterType || 'none'}`;
}

function getDashboardScopeKey(req) {
  const shopScope = req.shopScoped
    ? (req.shopFilterId || (req.canAccessAllShops ? 'all-shops' : 'assigned-shops'))
    : 'no-shop';
  const studioScope = req.studioLocationScoped
    ? (req.studioLocationFilterId || (req.canAccessAllStudioLocations ? 'all-studios' : 'assigned-studios'))
    : 'no-studio';
  return `${shopScope}:${studioScope}`;
}

function getCachedDashboard(cacheKey) {
  const cached = dashboardCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logDashboardDebug('Cache hit for', cacheKey);
    return cached.data;
  }
  if (cached) {
    dashboardCache.delete(cacheKey);
  }
  return null;
}

function setCachedDashboard(cacheKey, data) {
  // Limit cache size to prevent memory leaks
  if (dashboardCache.size > 100) {
    const oldestKey = dashboardCache.keys().next().value;
    dashboardCache.delete(oldestKey);
  }
  dashboardCache.set(cacheKey, { data, timestamp: Date.now() });
}

// Clear cache for a specific tenant (call after mutations)
function invalidateTenantCache(tenantId) {
  for (const key of dashboardCache.keys()) {
    if (key.startsWith(tenantId)) {
      dashboardCache.delete(key);
    }
  }
}

// Export for use in other controllers
exports.invalidateTenantCache = invalidateTenantCache;

/**
 * Build a safe empty dashboard payload (for first-time users or when queries fail).
 * Ensures GET /dashboard/overview never returns 500 for "no data" or transient errors.
 */
function buildEmptyOverviewPayload(tenantId, businessType = 'shop', startDate = null, endDate = null) {
  const now = new Date();
  const rangeStart = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
  const rangeEnd = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  rangeEnd.setHours(23, 59, 59, 999);

  const emptySummary = {
    totalCustomers: 0,
    totalVendors: 0,
    totalJobs: 0,
    newJobs: 0,
    pendingJobs: 0,
    inProgressJobs: 0,
    onHoldJobs: 0,
    cancelledJobs: 0,
    completedJobs: 0,
    outstandingBalance: 0,
    newCustomers: 0
  };

  const emptyMonth = {
    jobs: 0,
    revenue: 0,
    expenses: 0,
    profit: 0,
    range: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() }
  };

  const payload = {
    summary: emptySummary,
    currentMonth: emptyMonth,
    thisMonth: emptyMonth,
    allTime: { revenue: 0, expenses: 0, profit: 0 },
    recentJobs: [],
    shopData: null,
    rentalData: businessType === 'rental'
      ? { activeRentals: 0, overdueRentals: 0, dueBackToday: 0, upcomingPreBookings: 0 }
      : null,
    businessType
  };

  if (startDate && endDate) {
    payload.filteredPeriod = {
      jobs: 0,
      revenue: 0,
      expenses: 0,
      profit: 0,
      range: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() }
    };
    payload.thisMonth = payload.filteredPeriod;
  }

  return payload;
}

// @desc    Get dashboard overview
// @route   GET /api/dashboard/overview
// @access  Private
exports.getDashboardOverview = async (req, res, next) => {
  // Ensure tenantId is available (set by tenantContext middleware)
  if (!req.tenantId) {
    return res.status(400).json({
      success: false,
      message: 'Tenant context is required'
    });
  }

  const { startDate, endDate, filterType } = req.query;
  const tenantId = req.tenantId;
  logDashboardDebug('Received overview request', { startDate, endDate, tenantId });

  // Check cache first
  const cacheKey = getCacheKey(tenantId, startDate, endDate, filterType, getDashboardScopeKey(req));
  const cachedData = getCachedDashboard(cacheKey);
  if (cachedData) {
    return res.status(200).json({
      success: true,
      data: cachedData,
      cached: true
    });
  }

  let businessType = 'shop';
  try {
    // Get tenant business type (non-throwing: use default on failure)
    const tenant = normalizeTenantClassification(await Tenant.findByPk(tenantId, {
      attributes: ['id', 'businessType', 'name', 'metadata']
    }));
    businessType = tenant?.businessType || 'shop';
  } catch (err) {
    if (config.nodeEnv === 'development') console.warn('[Dashboard] Tenant lookup failed:', err?.message);
  }

  const isRetailWorkspace = businessType === 'shop' || businessType === 'pharmacy';
  const isRentalWorkspace = businessType === 'rental';

  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDayOfMonth.setHours(0, 0, 0, 0);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    lastDayOfMonth.setHours(23, 59, 59, 999);

    // Set date range for filtering
    let dateFilter = null;
    let filterStart = null;
    let filterEnd = null;
    const hasDateFilter = Boolean(startDate && endDate);
    
    if (hasDateFilter) {
      filterStart = new Date(startDate);
      filterStart.setHours(0, 0, 0, 0);
      filterEnd = new Date(endDate);
      filterEnd.setHours(23, 59, 59, 999); // Include the entire end date
      dateFilter = {
        [Op.between]: [filterStart, filterEnd]
      };
      logDashboardDebug('Applied date filter', {
        start: filterStart.toISOString(),
        end: filterEnd.toISOString()
      });
    }

    // Build filter for Group 2 (use no-match range when no date filter)
    const g2Filter = hasDateFilter ? dateFilter : { [Op.between]: [new Date(0), new Date(0)] };
    const prevPeriod = (hasDateFilter && filterType) ? getPreviousPeriodDates(filterType, filterStart, filterEnd) : null;
    const prevDateFilter = prevPeriod ? { [Op.between]: [prevPeriod.start, prevPeriod.end] } : null;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date();
    weekEnd.setHours(23, 59, 59, 999);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    // Sale isn't paranoid — soft-deleted sales (deletedAt set) must be excluded explicitly here
    // and in every raw sales/sale_items query below, so dashboard totals match Reports.
    let recentSalesWhere = applyShopFilter(req, { tenantId, deletedAt: null });
    if (hasDateFilter) recentSalesWhere.createdAt = dateFilter;

    const customerShopFrag = getShopSqlFragment(req);
    const customerStudioFrag = getStudioLocationSqlFragment(req);
    const jobStudioFrag = getStudioLocationSqlFragment(req);
    const invoiceStudioFrag = getStudioLocationSqlFragment(req);
    const saleShopFrag = getShopSqlFragment(req);
    const saleCogsShopFrag = getShopSqlFragment(req, 's');
    const expenseShopFrag = getShopSqlFragment(req);
    const expenseStudioFrag = getStudioLocationSqlFragment(req);
    const rentalBranchFrag = getBranchSqlFragment(req);
    const preBookingBranchFrag = getBranchSqlFragment(req, 'pb');
    const todayDate = todayStart.toISOString().slice(0, 10);
    const customerCountSql = (baseWhere) =>
      `(SELECT COUNT(*) FROM customers WHERE "tenantId" = :tenantId${customerShopFrag.sql}${customerStudioFrag.sql} AND ${baseWhere})`;

    // Helper to safely run queries (catch missing tables / schema errors)
    const safeQuery = (p) => (p && typeof p.then === 'function' ? p.catch((err) => {
      if (config.nodeEnv === 'development') console.warn('[Dashboard] Query failed:', err?.message);
      return null;
    }) : p);

    // OPTIMIZATION: Use consolidated aggregate queries instead of many separate counts
    // This reduces ~25 COUNT queries to just 3-4 aggregate queries
    
    // 1. Consolidated job status counts (single query with CASE WHEN)
    const jobStatsQuery = safeQuery(sequelize.query(`
      SELECT 
        COUNT(*) as "totalJobs",
        COUNT(CASE WHEN status = 'new' THEN 1 END) as "newJobs",
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as "inProgressJobs",
        COUNT(CASE WHEN status = 'on_hold' THEN 1 END) as "onHoldJobs",
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as "cancelledJobs",
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as "completedJobs",
        COUNT(CASE WHEN "createdAt" BETWEEN :monthStart AND :monthEnd THEN 1 END) as "thisMonthJobs"
        ${hasDateFilter ? `,
        COUNT(CASE WHEN "createdAt" BETWEEN :filterStart AND :filterEnd THEN 1 END) as "filteredJobs",
        COUNT(CASE WHEN status = 'new' AND "createdAt" BETWEEN :filterStart AND :filterEnd THEN 1 END) as "filteredNewJobs",
        COUNT(CASE WHEN status = 'in_progress' AND "createdAt" BETWEEN :filterStart AND :filterEnd THEN 1 END) as "filteredInProgressJobs",
        COUNT(CASE WHEN status = 'on_hold' AND "createdAt" BETWEEN :filterStart AND :filterEnd THEN 1 END) as "filteredOnHoldJobs",
        COUNT(CASE WHEN status = 'cancelled' AND "createdAt" BETWEEN :filterStart AND :filterEnd THEN 1 END) as "filteredCancelledJobs",
        COUNT(CASE WHEN status = 'completed' AND "createdAt" BETWEEN :filterStart AND :filterEnd THEN 1 END) as "filteredCompletedJobs"` : ''}
      FROM jobs WHERE "tenantId" = :tenantId${jobStudioFrag.sql}
    `, {
      replacements: { 
        tenantId, 
        monthStart: firstDayOfMonth, 
        monthEnd: lastDayOfMonth,
        ...jobStudioFrag.replacements,
        ...(hasDateFilter ? { filterStart, filterEnd } : {})
      },
      type: sequelize.QueryTypes.SELECT
    }));

    // 2. Consolidated invoice sums (single query)
    const invoiceStatsQuery = safeQuery(sequelize.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN status != 'cancelled' AND "amountPaid" > 0 THEN "amountPaid" ELSE 0 END), 0) as "totalRevenue",
        COALESCE(SUM(CASE WHEN status != 'cancelled' AND "amountPaid" > 0 AND COALESCE("paidDate","updatedAt") BETWEEN :monthStart AND :monthEnd THEN "amountPaid" ELSE 0 END), 0) as "thisMonthRevenue",
        COALESCE(SUM(CASE WHEN status NOT IN ('paid', 'cancelled') AND balance > 0 THEN balance ELSE 0 END), 0) as "outstandingBalance"
        ${hasDateFilter ? `,COALESCE(SUM(CASE WHEN status != 'cancelled' AND "amountPaid" > 0 AND COALESCE("paidDate","updatedAt") BETWEEN :filterStart AND :filterEnd THEN "amountPaid" ELSE 0 END), 0) as "filteredRevenue"` : ''}
        ${prevPeriod ? `,COALESCE(SUM(CASE WHEN status != 'cancelled' AND "amountPaid" > 0 AND COALESCE("paidDate","updatedAt") BETWEEN :prevStart AND :prevEnd THEN "amountPaid" ELSE 0 END), 0) as "prevRevenue"` : ''}
      FROM invoices WHERE "tenantId" = :tenantId${invoiceStudioFrag.sql}
    `, {
      replacements: { 
        tenantId, 
        monthStart: firstDayOfMonth, 
        monthEnd: lastDayOfMonth,
        ...invoiceStudioFrag.replacements,
        ...(hasDateFilter ? { filterStart, filterEnd } : {}),
        ...(prevPeriod ? { prevStart: prevPeriod.start, prevEnd: prevPeriod.end } : {})
      },
      type: sequelize.QueryTypes.SELECT
    }));

    // 3. Consolidated expense sums (single query)
    const expenseStatsQuery = safeQuery(sequelize.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as "totalExpenses",
        COALESCE(SUM(CASE WHEN "expenseDate" BETWEEN :monthStart AND :monthEnd THEN amount ELSE 0 END), 0) as "thisMonthExpenses"
        ${hasDateFilter ? `,COALESCE(SUM(CASE WHEN "expenseDate" BETWEEN :filterStart AND :filterEnd THEN amount ELSE 0 END), 0) as "filteredExpenses"` : ''}
        ${prevPeriod ? `,COALESCE(SUM(CASE WHEN "expenseDate" BETWEEN :prevStart AND :prevEnd THEN amount ELSE 0 END), 0) as "prevExpenses"` : ''}
      FROM expenses 
      WHERE "tenantId" = :tenantId AND "approvalStatus" = 'approved' AND "isArchived" = false${expenseShopFrag.sql}${expenseStudioFrag.sql}
    `, {
      replacements: { 
        tenantId, 
        monthStart: firstDayOfMonth, 
        monthEnd: lastDayOfMonth,
        ...expenseShopFrag.replacements,
        ...expenseStudioFrag.replacements,
        ...(hasDateFilter ? { filterStart, filterEnd } : {}),
        ...(prevPeriod ? { prevStart: prevPeriod.start, prevEnd: prevPeriod.end } : {})
      },
      type: sequelize.QueryTypes.SELECT
    }));

    // 4. Consolidated customer/vendor counts (single query)
    const entityCountsQuery = safeQuery(sequelize.query(`
      SELECT 
        ${customerCountSql('"isActive" = true')} as "totalCustomers",
        (SELECT COUNT(*) FROM vendors WHERE "tenantId" = :tenantId AND "isActive" = true) as "totalVendors",
        ${customerCountSql('"isActive" = true AND "createdAt" BETWEEN :monthStart AND :monthEnd')} as "newCustomersThisMonth"
        ${hasDateFilter ? `,${customerCountSql('"isActive" = true AND "createdAt" BETWEEN :filterStart AND :filterEnd')} as "filteredNewCustomers"` : ''}
        ${prevPeriod ? `,${customerCountSql('"isActive" = true AND "createdAt" BETWEEN :prevStart AND :prevEnd')} as "prevNewCustomers"` : ''}
    `, {
      replacements: { 
        tenantId, 
        monthStart: firstDayOfMonth, 
        monthEnd: lastDayOfMonth,
        ...customerShopFrag.replacements,
        ...customerStudioFrag.replacements,
        ...(hasDateFilter ? { filterStart, filterEnd } : {}),
        ...(prevPeriod ? { prevStart: prevPeriod.start, prevEnd: prevPeriod.end } : {})
      },
      type: sequelize.QueryTypes.SELECT
    }));

    // Build batch with optimized queries
    const batch = [
      // Consolidated queries (4 queries instead of ~25)
      jobStatsQuery,
      invoiceStatsQuery,
      expenseStatsQuery,
      entityCountsQuery,
      // recentJobs (still needed as separate query with JOIN)
      safeQuery(Job.findAll({
        where: applyStudioLocationFilter(req, { tenantId, status: 'in_progress' }),
        attributes: ['id', 'title', 'status', 'dueDate', 'createdAt', 'jobNumber'],
        order: [['dueDate', 'ASC'], ['createdAt', 'DESC']],
        limit: 10,
        include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'company'] }]
      })),
      // monthSalesRevenue (shop/pharmacy) - consolidated with other shop queries below
      safeQuery((businessType === 'shop' || businessType === 'pharmacy') ? 
        sequelize.query(`
          SELECT 
            COALESCE(SUM(CASE WHEN "createdAt" BETWEEN :monthStart AND :monthEnd THEN total ELSE 0 END), 0) as "monthSalesRevenue",
            COALESCE(SUM(CASE WHEN "createdAt" BETWEEN :todayStart AND :todayEnd THEN total ELSE 0 END), 0) as "todaySales",
            COALESCE(SUM(CASE WHEN "createdAt" BETWEEN :weekStart AND :weekEnd THEN total ELSE 0 END), 0) as "weekSales",
            COUNT(CASE WHEN "createdAt" BETWEEN :todayStart AND :todayEnd THEN 1 END) as "todaySalesCount",
            COUNT(*) as "totalSales"
            ${hasDateFilter ? `,COALESCE(SUM(CASE WHEN "createdAt" BETWEEN :filterStart AND :filterEnd THEN total ELSE 0 END), 0) as "filteredSalesRevenue"` : ''}
            ${prevPeriod ? `,COALESCE(SUM(CASE WHEN "createdAt" BETWEEN :prevStart AND :prevEnd THEN total ELSE 0 END), 0) as "prevSalesRevenue"` : ''}
          FROM sales WHERE "tenantId" = :tenantId AND status = 'completed' AND "deletedAt" IS NULL${saleShopFrag.sql}
        `, {
          replacements: { 
            tenantId, 
            monthStart: firstDayOfMonth, 
            monthEnd: lastDayOfMonth,
            todayStart, todayEnd, weekStart, weekEnd,
            ...saleShopFrag.replacements,
            ...(hasDateFilter ? { filterStart, filterEnd } : {}),
            ...(prevPeriod ? { prevStart: prevPeriod.start, prevEnd: prevPeriod.end } : {})
          },
          type: sequelize.QueryTypes.SELECT
        }) : Promise.resolve([{}])),
      // Cost of goods sold (shop/pharmacy) — deduct product/variant cost from revenue so
      // "profit" reflects margin, not just top-line sales. Mirrors saleAccountingService COGS logic.
      safeQuery((businessType === 'shop' || businessType === 'pharmacy') ?
        sequelize.query(`
          SELECT
            COALESCE(SUM(CASE WHEN s."createdAt" BETWEEN :monthStart AND :monthEnd THEN si.quantity * COALESCE(pv."costPrice", p."costPrice", 0) ELSE 0 END), 0) as "monthCogs",
            COALESCE(SUM(CASE WHEN s."createdAt" BETWEEN :todayStart AND :todayEnd THEN si.quantity * COALESCE(pv."costPrice", p."costPrice", 0) ELSE 0 END), 0) as "todayCogs",
            COALESCE(SUM(si.quantity * COALESCE(pv."costPrice", p."costPrice", 0)), 0) as "totalCogs"
            ${hasDateFilter ? `,COALESCE(SUM(CASE WHEN s."createdAt" BETWEEN :filterStart AND :filterEnd THEN si.quantity * COALESCE(pv."costPrice", p."costPrice", 0) ELSE 0 END), 0) as "filteredCogs"` : ''}
            ${prevPeriod ? `,COALESCE(SUM(CASE WHEN s."createdAt" BETWEEN :prevStart AND :prevEnd THEN si.quantity * COALESCE(pv."costPrice", p."costPrice", 0) ELSE 0 END), 0) as "prevCogs"` : ''}
          FROM sale_items si
          INNER JOIN sales s ON s.id = si."saleId"
          LEFT JOIN products p ON p.id = si."productId"
          LEFT JOIN product_variants pv ON pv.id = si."productVariantId"
          WHERE s."tenantId" = :tenantId AND s.status = 'completed' AND s."deletedAt" IS NULL
            AND COALESCE(p."trackStock", true) != false${saleCogsShopFrag.sql}
        `, {
          replacements: {
            tenantId,
            monthStart: firstDayOfMonth,
            monthEnd: lastDayOfMonth,
            todayStart, todayEnd,
            ...saleCogsShopFrag.replacements,
            ...(hasDateFilter ? { filterStart, filterEnd } : {}),
            ...(prevPeriod ? { prevStart: prevPeriod.start, prevEnd: prevPeriod.end } : {})
          },
          type: sequelize.QueryTypes.SELECT
        }) : Promise.resolve([{}])),
      // Product inventory stats (shop/pharmacy — products table, scoped to active shop)
      safeQuery(isRetailWorkspace ? (async () => {
        const baseWhere = applyShopFilter(req, applyTenantFilter(tenantId, { isActive: true }));
        const totalInventoryItems = await Product.count({ where: baseWhere });
        const lowStockItems = await Product.count({
          where: {
            ...baseWhere,
            trackStock: true,
            [Op.and]: [
              sequelize.where(sequelize.col('quantityOnHand'), Op.lte, sequelize.col('reorderLevel')),
            ],
          },
        });
        return [{ totalInventoryItems, lowStockItems }];
      })() : Promise.resolve([{}])),
      // Recent sales (shop/pharmacy)
      safeQuery(isRetailWorkspace ? Sale.findAll({
        where: recentSalesWhere, 
        attributes: ['id', 'saleNumber', 'total', 'createdAt', 'paymentMethod'], 
        limit: 5, 
        order: [['createdAt', 'DESC']], 
        include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'], required: false }] 
      }) : Promise.resolve([])),
      // Top products (shop) — scoped to selected period when date filter is active
      safeQuery(isRetailWorkspace ? sequelize.query(`
        SELECT "SaleItem"."productId","SaleItem"."name" as "productName",
          SUM("SaleItem"."quantity") as "totalQuantity",
          SUM("SaleItem"."total") as "totalRevenue",
          COUNT(DISTINCT "SaleItem"."saleId") as "saleCount" 
        FROM "sale_items" AS "SaleItem" 
        INNER JOIN "sales" AS "Sale" ON "SaleItem"."saleId"="Sale"."id" 
        WHERE "Sale"."tenantId"=:tenantId AND "Sale"."status"='completed' AND "Sale"."deletedAt" IS NULL
          ${hasDateFilter ? 'AND "Sale"."createdAt" BETWEEN :filterStart AND :filterEnd' : 'AND "Sale"."createdAt">=:thirtyDaysAgo'}${saleShopFrag.sql.replace(/"shopId"/g, '"Sale"."shopId"')}
        GROUP BY "SaleItem"."productId","SaleItem"."name" 
        ORDER BY SUM("SaleItem"."total") DESC LIMIT 5
      `, {
        replacements: {
          tenantId,
          ...(hasDateFilter ? { filterStart, filterEnd } : { thirtyDaysAgo: thirtyDaysAgo.toISOString() }),
          ...saleShopFrag.replacements,
        },
        type: sequelize.QueryTypes.SELECT,
      }) : Promise.resolve([])),
      // Stock alerts for shop/pharmacy: low-stock and expiring products (from products table)
      safeQuery((businessType === 'shop' || businessType === 'pharmacy') ? Product.findAll({
        where: applyShopFilter(req, {
          tenantId,
          isActive: true,
          trackStock: true,
          [Op.and]: [
            sequelize.where(sequelize.col('quantityOnHand'), Op.lte, sequelize.col('reorderLevel')),
            sequelize.where(sequelize.col('quantityOnHand'), Op.gte, 0)
          ]
        }),
        attributes: ['id', 'name', 'quantityOnHand', 'reorderLevel', 'unit'],
        limit: 20,
        raw: true
      }) : Promise.resolve([])),
      safeQuery((businessType === 'shop' || businessType === 'pharmacy') ? sequelize.query(`
        SELECT id, name, unit, metadata->>'expiryDate' as "expiryDate"
        FROM products
        WHERE "tenantId" = :tenantId AND "isActive" = true
          AND metadata ? 'expiryDate'
          AND (metadata->>'expiryDate')::date IS NOT NULL
          AND (metadata->>'expiryDate')::date >= CURRENT_DATE
          AND (metadata->>'expiryDate')::date <= CURRENT_DATE + INTERVAL '30 days'
        ORDER BY (metadata->>'expiryDate')::date ASC
        LIMIT 20
      `, { replacements: { tenantId }, type: sequelize.QueryTypes.SELECT }) : Promise.resolve([])),
      // Rental revenue + operational KPIs (rental business type)
      safeQuery(isRentalWorkspace ? sequelize.query(`
        SELECT
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN amount ELSE 0 END), 0) as "totalRentalRevenue",
          COALESCE(SUM(CASE WHEN status != 'cancelled' AND "createdAt" BETWEEN :monthStart AND :monthEnd THEN amount ELSE 0 END), 0) as "monthRentalRevenue",
          COUNT(CASE WHEN status = 'active' THEN 1 END) as "activeRentals",
          COUNT(CASE WHEN status = 'overdue' THEN 1 END) as "overdueRentals",
          COUNT(CASE WHEN status IN ('active', 'confirmed', 'overdue') AND "endDate" = :todayDate THEN 1 END) as "dueBackToday"
          ${hasDateFilter ? `,COALESCE(SUM(CASE WHEN status != 'cancelled' AND "createdAt" BETWEEN :filterStart AND :filterEnd THEN amount ELSE 0 END), 0) as "filteredRentalRevenue"` : ''}
          ${prevPeriod ? `,COALESCE(SUM(CASE WHEN status != 'cancelled' AND "createdAt" BETWEEN :prevStart AND :prevEnd THEN amount ELSE 0 END), 0) as "prevRentalRevenue"` : ''},
          (
            SELECT COUNT(*)
            FROM pre_bookings pb
            WHERE pb."tenantId" = :tenantId AND pb.status = 'pending'${preBookingBranchFrag.sql}
          ) as "upcomingPreBookings"
        FROM rentals
        WHERE "tenantId" = :tenantId${rentalBranchFrag.sql}
      `, {
        replacements: {
          tenantId,
          monthStart: firstDayOfMonth,
          monthEnd: lastDayOfMonth,
          todayDate,
          ...rentalBranchFrag.replacements,
          ...preBookingBranchFrag.replacements,
          ...(hasDateFilter ? { filterStart, filterEnd } : {}),
          ...(prevPeriod ? { prevStart: prevPeriod.start, prevEnd: prevPeriod.end } : {}),
        },
        type: sequelize.QueryTypes.SELECT,
      }) : Promise.resolve([{}]))
    ];

    const results = await Promise.all(batch);

    // Extract results from consolidated queries
    const [
      jobStatsResult,
      invoiceStatsResult,
      expenseStatsResult,
      entityCountsResult,
      recentJobs,
      salesStatsResult,
      salesCogsStatsResult,
      inventoryStatsResult,
      recentSales,
      topProducts,
      lowStockProductsResult,
      expiringProductsResult,
      rentalStatsResult
    ] = results;

    // Parse consolidated results (handle array vs object)
    const jobStats = Array.isArray(jobStatsResult) ? jobStatsResult[0] : (jobStatsResult || {});
    const invoiceStats = Array.isArray(invoiceStatsResult) ? invoiceStatsResult[0] : (invoiceStatsResult || {});
    const expenseStats = Array.isArray(expenseStatsResult) ? expenseStatsResult[0] : (expenseStatsResult || {});
    const entityCounts = Array.isArray(entityCountsResult) ? entityCountsResult[0] : (entityCountsResult || {});
    const salesStats = Array.isArray(salesStatsResult) ? salesStatsResult[0] : (salesStatsResult || {});
    const salesCogsStats = Array.isArray(salesCogsStatsResult) ? salesCogsStatsResult[0] : (salesCogsStatsResult || {});
    const inventoryStats = Array.isArray(inventoryStatsResult) ? inventoryStatsResult[0] : (inventoryStatsResult || {});
    const rentalStats = Array.isArray(rentalStatsResult) ? rentalStatsResult[0] : (rentalStatsResult || {});

    // Map consolidated results to original variable names
    const totalCustomers = parseInt(entityCounts.totalCustomers) || 0;
    const totalVendors = parseInt(entityCounts.totalVendors) || 0;
    const totalJobs = parseInt(jobStats.totalJobs) || 0;
    const newJobs = parseInt(jobStats.newJobs) || 0;
    const inProgressJobs = parseInt(jobStats.inProgressJobs) || 0;
    const onHoldJobs = parseInt(jobStats.onHoldJobs) || 0;
    const cancelledJobs = parseInt(jobStats.cancelledJobs) || 0;
    const completedJobs = parseInt(jobStats.completedJobs) || 0;
    const thisMonthJobs = parseInt(jobStats.thisMonthJobs) || 0;
    const totalRevenue = parseFloat(invoiceStats.totalRevenue) || 0;
    const thisMonthRevenue = parseFloat(invoiceStats.thisMonthRevenue) || 0;
    const totalExpenses = parseFloat(expenseStats.totalExpenses) || 0;
    const thisMonthExpenses = parseFloat(expenseStats.thisMonthExpenses) || 0;
    const newCustomersThisMonth = parseInt(entityCounts.newCustomersThisMonth) || 0;
    const outstandingBalance = parseFloat(invoiceStats.outstandingBalance) || 0;

    // Filtered values (only present when hasDateFilter)
    const filteredJobs = hasDateFilter ? (parseInt(jobStats.filteredJobs) || 0) : 0;
    const filteredNewJobs = hasDateFilter ? (parseInt(jobStats.filteredNewJobs) || 0) : 0;
    const filteredInProgressJobs = hasDateFilter ? (parseInt(jobStats.filteredInProgressJobs) || 0) : 0;
    const filteredOnHoldJobs = hasDateFilter ? (parseInt(jobStats.filteredOnHoldJobs) || 0) : 0;
    const filteredCancelledJobs = hasDateFilter ? (parseInt(jobStats.filteredCancelledJobs) || 0) : 0;
    const filteredCompletedJobs = hasDateFilter ? (parseInt(jobStats.filteredCompletedJobs) || 0) : 0;
    const filteredRevenue = hasDateFilter ? (parseFloat(invoiceStats.filteredRevenue) || 0) : 0;
    const filteredExpenses = hasDateFilter ? (parseFloat(expenseStats.filteredExpenses) || 0) : 0;
    const filteredNewCustomers = hasDateFilter ? (parseInt(entityCounts.filteredNewCustomers) || 0) : 0;

    // Shop/Pharmacy sales data
    const monthSalesRevenue = parseFloat(salesStats.monthSalesRevenue) || 0;
    const todaySales = parseFloat(salesStats.todaySales) || 0;
    const weekSales = parseFloat(salesStats.weekSales) || 0;
    const monthSales = parseFloat(salesStats.monthSalesRevenue) || 0;
    const totalSales = parseInt(salesStats.totalSales) || 0;
    const todaySalesCount = parseInt(salesStats.todaySalesCount) || 0;
    const filteredSalesRevenue = hasDateFilter ? (parseFloat(salesStats.filteredSalesRevenue) || 0) : 0;

    const totalRentalRevenue = parseFloat(rentalStats.totalRentalRevenue) || 0;
    const monthRentalRevenue = parseFloat(rentalStats.monthRentalRevenue) || 0;
    const filteredRentalRevenue = hasDateFilter ? (parseFloat(rentalStats.filteredRentalRevenue) || 0) : 0;

    // Cost of goods sold for the same periods (0 for non-retail business types, no products/sale_items to cost).
    const monthCogs = parseFloat(salesCogsStats.monthCogs) || 0;
    const totalCogs = parseFloat(salesCogsStats.totalCogs) || 0;
    const filteredCogs = hasDateFilter ? (parseFloat(salesCogsStats.filteredCogs) || 0) : 0;

    // Inventory stats
    const lowStockItems = parseInt(inventoryStats.lowStockItems) || 0;
    const totalInventoryItems = parseInt(inventoryStats.totalInventoryItems) || 0;

    // Stock alerts for shop/pharmacy (from products table)
    let stockAlerts = null;
    if (businessType === 'shop' || businessType === 'pharmacy') {
      const lowStockList = Array.isArray(lowStockProductsResult) ? lowStockProductsResult : [];
      const lowStock = lowStockList.map(row => ({
        id: row.id,
        name: row.name,
        quantityOnHand: Number(parseFloat(row.quantityOnHand || 0)),
        reorderLevel: Number(parseFloat(row.reorderLevel || 0)),
        unit: row.unit || 'pcs'
      }));
      const expiringRaw = Array.isArray(expiringProductsResult) ? expiringProductsResult : [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiring = expiringRaw.map(row => {
        const expDate = row.expiryDate ? new Date(row.expiryDate) : null;
        const daysUntilExpiry = expDate ? Math.ceil((expDate - today) / (1000 * 60 * 60 * 24)) : 0;
        return {
          id: row.id,
          name: row.name,
          unit: row.unit || 'pcs',
          expiryDate: row.expiryDate,
          daysUntilExpiry
        };
      });
      stockAlerts = { lowStock, expiring };
    }

    // Previous period comparison values
    const prevRevenue = prevPeriod ? (
      isRetailWorkspace
        ? (parseFloat(salesStats.prevSalesRevenue) || 0)
        : isRentalWorkspace
          ? (parseFloat(rentalStats.prevRentalRevenue) || 0)
          : (parseFloat(invoiceStats.prevRevenue) || 0)
    ) : 0;
    const prevExpenses = prevPeriod ? (parseFloat(expenseStats.prevExpenses) || 0) : 0;
    const prevCogs = prevPeriod ? (parseFloat(salesCogsStats.prevCogs) || 0) : 0;
    const prevNewCustomers = prevPeriod ? (parseInt(entityCounts.prevNewCustomers) || 0) : 0;

    if (hasDateFilter) {
      logDashboardDebug('Filtered job counts', { filteredJobs, filteredNewJobs, filteredInProgressJobs, filteredOnHoldJobs, filteredCancelledJobs, filteredCompletedJobs });
      logDashboardDebug('Filtered revenue total', { filteredRevenue });
      logDashboardDebug('Filtered expense total', { filteredExpenses });
      logDashboardDebug('Filtered new customers', { filteredNewCustomers });
    }
    logDashboardDebug('In-progress jobs fetched', { count: recentJobs?.length ?? 0 });

    let currentMonthRevenueValue = isRetailWorkspace
      ? (monthSalesRevenue ?? 0)
      : isRentalWorkspace
        ? (monthRentalRevenue ?? 0)
        : (thisMonthRevenue ?? 0);
    
    const currentMonthSummary = {
      jobs: thisMonthJobs ?? 0,
      revenue: Number(parseFloat(currentMonthRevenueValue ?? 0).toFixed(2)),
      expenses: Number(parseFloat(thisMonthExpenses ?? 0).toFixed(2)),
      // Profit deducts cost of goods sold (product/variant cost) in addition to operating expenses,
      // so retail workspaces see revenue - COGS - expenses, not just revenue - expenses.
      profit: Number(parseFloat((currentMonthRevenueValue ?? 0) - (thisMonthExpenses ?? 0) - (monthCogs ?? 0)).toFixed(2)),
      range: {
        start: firstDayOfMonth.toISOString(),
        end: lastDayOfMonth.toISOString()
      }
    };

    const allTimeRevenueValue = isRentalWorkspace ? totalRentalRevenue : (totalRevenue ?? 0);
    const allTimeSummary = {
      revenue: Number(parseFloat(allTimeRevenueValue ?? 0).toFixed(2)),
      expenses: Number(parseFloat(totalExpenses ?? 0).toFixed(2)),
      profit: Number(parseFloat((allTimeRevenueValue ?? 0) - (totalExpenses ?? 0) - (totalCogs ?? 0)).toFixed(2))
    };

    // Shop-specific data (from batch)
    let shopData = null;
    if (isRetailWorkspace) {
      try {
        const salesList = Array.isArray(recentSales) ? recentSales : [];
        const productsList = Array.isArray(topProducts) ? topProducts : [];
        shopData = {
          activeShopId: req.shopFilterId || null,
          todaySales: Number(parseFloat(todaySales || 0).toFixed(2)),
          weekSales: Number(parseFloat(weekSales || 0).toFixed(2)),
          monthSales: Number(parseFloat(monthSales || 0).toFixed(2)),
          totalSales: totalSales ?? 0,
          todaySalesCount: todaySalesCount ?? 0,
          lowStockItems: lowStockItems ?? 0,
          totalInventoryItems: totalInventoryItems ?? 0,
          productCount: totalInventoryItems ?? 0,
          recentSales: salesList.map(sale => ({
            id: sale.id,
            saleNumber: sale.saleNumber,
            total: Number(parseFloat(sale.total).toFixed(2)),
            customer: sale.customer ? { name: sale.customer.name, phone: sale.customer.phone } : null,
            createdAt: sale.createdAt,
            paymentMethod: sale.paymentMethod
          })),
          topProducts: productsList.map(product => ({
            productId: product.productId,
            productName: product.productName,
            totalQuantity: Number(parseFloat(product.totalQuantity).toFixed(2)),
            totalRevenue: Number(parseFloat(product.totalRevenue).toFixed(2)),
            saleCount: parseInt(product.saleCount)
          })),
          shopBreakdown: [],
        };

        if (req.canAccessAllShops && !req.shopFilterId && resolveBusinessType(businessType) === 'shop') {
          try {
            const breakdownStart = hasDateFilter ? filterStart : firstDayOfMonth;
            const breakdownEnd = hasDateFilter ? filterEnd : lastDayOfMonth;
            const breakdownRows = await sequelize.query(
              `
              SELECT sh.id, sh.name,
                COALESCE(SUM(CASE WHEN s."createdAt" BETWEEN :periodStart AND :periodEnd THEN s.total ELSE 0 END), 0) AS "periodRevenue",
                COUNT(s.id) FILTER (WHERE s."createdAt" BETWEEN :periodStart AND :periodEnd) AS "periodSalesCount"
              FROM shops sh
              LEFT JOIN sales s ON s."shopId" = sh.id AND s."tenantId" = :tenantId AND s.status = 'completed' AND s."deletedAt" IS NULL
              WHERE sh."tenantId" = :tenantId AND sh."isActive" = true
              GROUP BY sh.id, sh.name
              ORDER BY "periodRevenue" DESC
              `,
              {
                replacements: {
                  tenantId,
                  periodStart: breakdownStart,
                  periodEnd: breakdownEnd,
                },
                type: sequelize.QueryTypes.SELECT,
              }
            );
            shopData.shopBreakdown = (breakdownRows || []).map((row) => ({
              id: row.id,
              name: row.name,
              monthRevenue: Number(parseFloat(row.periodRevenue || 0).toFixed(2)),
              monthSalesCount: parseInt(row.periodSalesCount, 10) || 0,
            }));
          } catch (breakdownErr) {
            logDashboardDebug('shopBreakdown query failed', breakdownErr?.message);
          }
        }
      } catch (error) {
        const isMissingTable = error?.name === 'SequelizeDatabaseError' && /relation ["']?\w+["']? does not exist/i.test(String(error?.parent?.message || ''));
        if (isMissingTable) {
          logDashboardDebug('Shop/sales tables not present, using empty shop data.');
        } else {
          logDashboardDebug('Error mapping shop data', error);
        }
        shopData = {
          todaySales: 0, weekSales: 0, monthSales: 0, totalSales: 0, todaySalesCount: 0,
          lowStockItems: 0, totalInventoryItems: 0, recentSales: [], topProducts: []
        };
      }
    }

    let rentalData = null;
    if (isRentalWorkspace) {
      rentalData = {
        activeRentals: parseInt(rentalStats.activeRentals, 10) || 0,
        overdueRentals: parseInt(rentalStats.overdueRentals, 10) || 0,
        dueBackToday: parseInt(rentalStats.dueBackToday, 10) || 0,
        upcomingPreBookings: parseInt(rentalStats.upcomingPreBookings, 10) || 0,
      };
    }

    const responseData = {
      summary: {
        totalCustomers: totalCustomers ?? 0,
        totalVendors: totalVendors ?? 0,
        totalJobs: totalJobs ?? 0,
        newJobs: newJobs ?? 0,
        pendingJobs: newJobs ?? 0,
        inProgressJobs: inProgressJobs ?? 0,
        onHoldJobs: onHoldJobs ?? 0,
        cancelledJobs: cancelledJobs ?? 0,
        completedJobs: completedJobs ?? 0,
        outstandingBalance: Number(parseFloat(outstandingBalance ?? 0).toFixed(2)),
        newCustomers: hasDateFilter ? (filteredNewCustomers ?? 0) : (newCustomersThisMonth ?? 0)
      },
      currentMonth: currentMonthSummary,
      thisMonth: currentMonthSummary,
      allTime: allTimeSummary,
      recentJobs: Array.isArray(recentJobs) ? recentJobs : [],
      shopData,
      rentalData,
      ...(stockAlerts ? { stockAlerts } : {})
    };

    // Add filtered period data if date filter is applied
    if (hasDateFilter) {
      const filteredRevenueValue = Number(parseFloat(
        isRetailWorkspace
          ? (filteredSalesRevenue || 0)
          : isRentalWorkspace
            ? (filteredRentalRevenue || 0)
            : (filteredRevenue || 0)
      ).toFixed(2));
      const filteredExpensesValue = Number(parseFloat(filteredExpenses || 0).toFixed(2));
      const filteredCogsValue = Number(parseFloat(filteredCogs || 0).toFixed(2));
      const filteredProfitValue = Number(parseFloat(filteredRevenueValue - filteredExpensesValue - filteredCogsValue).toFixed(2));

      responseData.filteredPeriod = {
        jobs: filteredJobs ?? 0,
        revenue: filteredRevenueValue,
        expenses: filteredExpensesValue,
        profit: filteredProfitValue,
        range: {
          start: filterStart.toISOString(),
          end: filterEnd.toISOString()
        },
        filterType: filterType || 'custom',
        periodLabel: filterType || 'custom',
      };
      responseData.thisMonth = responseData.filteredPeriod;

      if (filterType && prevPeriod) {
        const currRev = filteredRevenueValue;
        const currExp = filteredExpensesValue;
        const currProfit = currRev - currExp - filteredCogsValue;
        const prevProfit = (prevRevenue || 0) - (prevExpenses || 0) - (prevCogs || 0);
        const currNewCustomers = filteredNewCustomers ?? 0;
        const prevNewCustomersVal = prevNewCustomers ?? 0;
        responseData.comparison = {
          revenue: calculateComparison(currRev, prevRevenue || 0),
          expenses: calculateComparison(currExp, prevExpenses || 0),
          profit: calculateComparison(currProfit, prevProfit),
          newCustomers: calculateComparison(currNewCustomers, prevNewCustomersVal),
          label: prevPeriod.label,
          periodLabel: prevPeriod.label,
        };
      }

      // Override summary with filtered job status counts and new customers
      responseData.summary = {
        ...responseData.summary,
        totalJobs: filteredJobs ?? 0,
        newJobs: filteredNewJobs ?? 0,
        pendingJobs: filteredNewJobs ?? 0,
        inProgressJobs: filteredInProgressJobs ?? 0,
        onHoldJobs: filteredOnHoldJobs ?? 0,
        cancelledJobs: filteredCancelledJobs ?? 0,
        completedJobs: filteredCompletedJobs ?? 0,
        newCustomers: filteredNewCustomers
      };
      
      logDashboardDebug('Response with filtered period', responseData.filteredPeriod);
    }

    logDashboardDebug('Returning overview response', {
      thisMonth: responseData.thisMonth,
      allTime: responseData.allTime
    });

    const finalData = {
      ...responseData,
      businessType // Include business type in response
    };

    // Cache the response for future requests
    setCachedDashboard(cacheKey, finalData);

    res.status(200).json({
      success: true,
      data: finalData
    });
  } catch (error) {
    // Return 200 with empty data so first-time users / no-data never see "Failed to load"
    console.error('[Dashboard] Overview error (returning empty payload):', error?.message || error);
    const emptyPayload = buildEmptyOverviewPayload(tenantId, businessType, startDate, endDate);
    return res.status(200).json({
      success: true,
      data: emptyPayload
    });
  }
};

// @desc    Get revenue by month
// @route   GET /api/dashboard/revenue-by-month
// @access  Private
exports.getRevenueByMonth = async (req, res, next) => {
  try {
    // Ensure tenantId is available
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    const year = req.query.year || new Date().getFullYear();
    const tenantId = req.tenantId;

    const revenueByMonth = await Invoice.findAll({
      attributes: [
        [sequelize.fn('EXTRACT', sequelize.literal('MONTH FROM COALESCE("paidDate","updatedAt")')), 'month'],
        [sequelize.fn('SUM', sequelize.col('amountPaid')), 'totalRevenue']
      ],
      where: applyStudioLocationFilter(req, {
        tenantId,
        status: { [Op.ne]: 'cancelled' },
        amountPaid: { [Op.gt]: 0 },
        [Op.and]: [
          sequelize.where(
            sequelize.fn('COALESCE', sequelize.col('paidDate'), sequelize.col('updatedAt')),
            {
              [Op.between]: [
                new Date(`${year}-01-01`),
                new Date(`${year}-12-31`)
              ]
            }
          )
        ]
      }),
      group: [sequelize.fn('EXTRACT', sequelize.literal('MONTH FROM COALESCE("paidDate","updatedAt")'))],
      order: [[sequelize.fn('EXTRACT', sequelize.literal('MONTH FROM COALESCE("paidDate","updatedAt")')), 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: revenueByMonth
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get expenses by category
// @route   GET /api/dashboard/expenses-by-category
// @access  Private
exports.getExpensesByCategory = async (req, res, next) => {
  try {
    // Ensure tenantId is available
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    const tenantId = req.tenantId;

    const expensesByCategory = await Expense.findAll({
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
      ],
      where: applyShopFilter(req, applyStudioLocationFilter(req, applyTenantFilter(tenantId, {
        approvalStatus: 'approved',
        isArchived: false,
      }))),
      group: ['category'],
      order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: expensesByCategory
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get top customers
// @route   GET /api/dashboard/top-customers
// @access  Private
exports.getTopCustomers = async (req, res, next) => {
  try {
    // Ensure tenantId is available
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    const { limit } = getPagination(req, { defaultPageSize: 10 });
    const tenantId = req.tenantId;

    const topCustomers = await Invoice.findAll({
      attributes: [
        'customerId',
        [sequelize.fn('SUM', sequelize.col('amountPaid')), 'totalPaid'],
        [sequelize.fn('COUNT', sequelize.col('Invoice.id')), 'invoiceCount']
      ],
      where: applyStudioLocationFilter(req, {
        tenantId,
        status: { [Op.ne]: 'cancelled' },
        amountPaid: { [Op.gt]: 0 }
      }),
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['id', 'name', 'company', 'email']
      }],
      group: ['customerId', 'customer.id'],
      order: [[sequelize.fn('SUM', sequelize.col('amountPaid')), 'DESC']],
      limit
    });

    res.status(200).json({
      success: true,
      data: topCustomers
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get job status distribution
// @route   GET /api/dashboard/job-status-distribution
// @access  Private
exports.getJobStatusDistribution = async (req, res, next) => {
  try {
    // Ensure tenantId is available
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    const tenantId = req.tenantId;

    const distribution = await Job.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: applyStudioLocationFilter(req, { tenantId }),
      group: ['status']
    });

    res.status(200).json({
      success: true,
      data: distribution
    });
  } catch (error) {
    next(error);
  }
};


