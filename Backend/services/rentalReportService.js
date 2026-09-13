const { Op } = require('sequelize');
const {
  sequelize,
  Rental,
  RentalItem,
  LateCharge,
  DamageReport,
  Product,
  ProductCategory,
  Shop,
  Customer,
  Sale,
} = require('../models');
const { parseReportDateRange } = require('../utils/reportDateFilter');

const ACTIVE_REVENUE_STATUSES = ['confirmed', 'active', 'overdue', 'returned', 'completed'];
const LATE_CHARGE_ACTIVE_STATUSES = ['pending', 'paid'];
const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  mobile_money: 'MoMo',
  bank_transfer: 'Bank',
  card: 'Card',
  credit: 'Credit',
  other: 'Other',
};

/**
 * Display label for a stored payment method.
 * @param {string} method
 * @returns {string}
 */
const paymentMethodLabel = (method) => PAYMENT_METHOD_LABELS[method] || 'Other';

/**
 * Low-stock status for a rentable product.
 * @param {number} quantityOnHand
 * @param {number} reorderLevel
 * @returns {'out_of_stock'|'critical_low'|null}
 */
const stockAlertStatus = (quantityOnHand, reorderLevel) => {
  const qty = toNumber(quantityOnHand);
  const reorder = toNumber(reorderLevel);
  if (qty <= 0) return 'out_of_stock';
  if (qty <= Math.max(reorder, 1)) return 'critical_low';
  return null;
};

const buildProductShopWhere = (req) => {
  if (req.shopFilterId) return { shopId: req.shopFilterId };
  if (req.shopScoped && !req.canAccessAllShops && req.allowedShopIds?.length) {
    return { shopId: { [Op.in]: req.allowedShopIds } };
  }
  return {};
};

const toNumber = (value) => Number(parseFloat(value) || 0);

/**
 * Branch scope for rental queries (branchId maps to shop).
 * @param {object} req
 * @returns {object}
 */
const buildBranchWhere = (req) => {
  if (req.shopFilterId) {
    return { branchId: req.shopFilterId };
  }
  if (req.shopScoped && !req.canAccessAllShops && req.allowedShopIds?.length) {
    return { branchId: { [Op.in]: req.allowedShopIds } };
  }
  return {};
};

/**
 * Inclusive day count between two YYYY-MM-DD strings.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {number}
 */
const countDaysInclusive = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return 0;
  }
  return Math.floor((end - start) / 86400000) + 1;
};

/**
 * Overlapping rental days within a reporting period.
 * @param {string} rentalStart
 * @param {string} rentalEnd
 * @param {string} periodStart
 * @param {string} periodEnd
 * @returns {number}
 */
const overlapDays = (rentalStart, rentalEnd, periodStart, periodEnd) => {
  const start = rentalStart > periodStart ? rentalStart : periodStart;
  const end = rentalEnd < periodEnd ? rentalEnd : periodEnd;
  if (start > end) return 0;
  return countDaysInclusive(start, end);
};

/**
 * Period bucket key for grouping rental revenue.
 * @param {string} dateStr
 * @param {string} groupBy
 * @returns {string}
 */
const bucketKeyForDate = (dateStr, groupBy) => {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (groupBy === 'month') return `${year}-${month}`;
  if (groupBy === 'week') {
    const jan1 = new Date(year, 0, 1);
    const week = Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  return `${year}-${month}-${day}`;
};

/**
 * Rentals overlapping the reporting window.
 * @param {object} req
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<object[]>}
 */
const fetchOverlappingRentals = async (req, startDate, endDate) => {
  const tenantId = req.tenantId;
  const branchWhere = buildBranchWhere(req);

  return Rental.findAll({
    where: {
      tenantId,
      status: { [Op.in]: ACTIVE_REVENUE_STATUSES },
      startDate: { [Op.lte]: endDate },
      endDate: { [Op.gte]: startDate },
      ...branchWhere,
    },
    include: [
      {
        model: RentalItem,
        as: 'items',
        include: [{
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'sku', 'rentalRatePerDay', 'costPrice', 'quantityOnHand', 'categoryId', 'shopId'],
          include: [
            { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
            { model: Shop, as: 'shop', attributes: ['id', 'name'] },
          ],
        }],
      },
      { model: Customer, as: 'customer', attributes: ['id', 'name'] },
      { model: Shop, as: 'branch', attributes: ['id', 'name'] },
    ],
    order: [['startDate', 'ASC']],
  });
};

/**
 * Rental revenue by period, branch, and product.
 * @param {object} req
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} [groupBy='day']
 */
const getRentalRevenueReport = async (req, startDate, endDate, groupBy = 'day') => {
  const rentals = await fetchOverlappingRentals(req, startDate, endDate);

  const byPeriodMap = new Map();
  const byBranchMap = new Map();
  const byProductMap = new Map();
  let totalRentalAmount = 0;
  let rentalCount = 0;

  rentals.forEach((rental) => {
    const plain = rental.get({ plain: true });
    const amount = toNumber(plain.amount);
    totalRentalAmount += amount;
    rentalCount += 1;

    const bucket = bucketKeyForDate(plain.startDate, groupBy);
    const periodRow = byPeriodMap.get(bucket) || { period: bucket, rentalRevenue: 0, rentalCount: 0 };
    periodRow.rentalRevenue += amount;
    periodRow.rentalCount += 1;
    byPeriodMap.set(bucket, periodRow);

    const branchId = plain.branchId || 'unassigned';
    const branchName = plain.branch?.name || 'Unassigned';
    const branchRow = byBranchMap.get(branchId) || { branchId, branchName, revenue: 0, rentalCount: 0 };
    branchRow.revenue += amount;
    branchRow.rentalCount += 1;
    byBranchMap.set(branchId, branchRow);

    (plain.items || []).forEach((item) => {
      const productId = item.productId;
      const productName = item.product?.name || 'Unknown product';
      const sku = item.product?.sku || null;
      const itemRevenue = toNumber(item.subtotal);
      const quantity = toNumber(item.quantity);
      const days = overlapDays(plain.startDate, plain.endDate, startDate, endDate);
      const ratePerDay = toNumber(item.rentalRatePerDay ?? item.product?.rentalRatePerDay);
      const productRow = byProductMap.get(productId) || {
        productId,
        productName,
        sku,
        categoryName: item.product?.category?.name || 'Uncategorized',
        branchName: plain.branch?.name || item.product?.shop?.name || 'Unassigned',
        ratePerDay,
        revenue: 0,
        quantityRented: 0,
        rentalCount: 0,
        daysRented: 0,
      };
      productRow.revenue += itemRevenue;
      productRow.quantityRented += quantity;
      productRow.rentalCount += 1;
      productRow.daysRented += days;
      if (ratePerDay > 0) productRow.ratePerDay = ratePerDay;
      if (item.product?.category?.name) productRow.categoryName = item.product.category.name;
      byProductMap.set(productId, productRow);
    });
  });

  const branchWhere = buildBranchWhere(req);
  const lateChargeDateFilter = parseReportDateRange(startDate, endDate);

  const lateCharges = await LateCharge.findAll({
    where: {
      ...branchWhere,
      status: { [Op.in]: LATE_CHARGE_ACTIVE_STATUSES },
      ...(lateChargeDateFilter ? { createdAt: lateChargeDateFilter } : {}),
    },
    include: [{
      model: Rental,
      as: 'rental',
      required: true,
      where: { tenantId: req.tenantId },
      attributes: [],
    }],
    attributes: ['totalCharge'],
    raw: true,
  });
  const totalLateCharges = lateCharges.reduce((sum, row) => sum + toNumber(row.totalCharge), 0);

  const byPeriod = Array.from(byPeriodMap.values()).sort((a, b) => a.period.localeCompare(b.period));
  const byBranch = Array.from(byBranchMap.values()).sort((a, b) => b.revenue - a.revenue);
  const byProduct = Array.from(byProductMap.values()).sort((a, b) => b.revenue - a.revenue);

  return {
    totalRevenue: totalRentalAmount + totalLateCharges,
    totalRentalAmount,
    totalLateCharges,
    rentalCount,
    byPeriod,
    byBranch,
    byProduct,
  };
};

/**
 * Late returns and late charge summary for the period.
 * @param {object} req
 * @param {string} startDate
 * @param {string} endDate
 */
const getLateReturnsReport = async (req, startDate, endDate) => {
  const tenantId = req.tenantId;
  const branchWhere = buildBranchWhere(req);
  const dateFilter = parseReportDateRange(startDate, endDate);

  const lateReturnWhere = {
    tenantId,
    status: { [Op.in]: ['returned', 'completed', 'overdue'] },
    ...branchWhere,
    actualReturnDate: dateFilter
      ? { [Op.and]: [{ [Op.ne]: null }, dateFilter] }
      : { [Op.ne]: null },
    [Op.and]: [
      sequelize.literal('"Rental"."actualReturnDate" > "Rental"."endDate"'),
    ],
  };

  const lateReturnRentals = await Rental.findAll({
    where: lateReturnWhere,
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name'] },
      { model: Shop, as: 'branch', attributes: ['id', 'name'] },
      { model: LateCharge, as: 'lateCharges' },
    ],
    order: [['actualReturnDate', 'DESC']],
    limit: 100,
  });

  const lateCharges = await LateCharge.findAll({
    where: {
      ...branchWhere,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    include: [
      {
        model: Rental,
        as: 'rental',
        required: true,
        where: { tenantId },
        attributes: ['id', 'startDate', 'endDate', 'actualReturnDate'],
      },
      { model: Customer, as: 'customer', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
  });

  const summary = {
    lateReturnCount: lateReturnRentals.length,
    totalLateCharges: 0,
    pendingLateCharges: 0,
    paidLateCharges: 0,
    waivedLateCharges: 0,
    totalDaysLate: 0,
  };

  lateCharges.forEach((charge) => {
    const plain = charge.get({ plain: true });
    const total = toNumber(plain.totalCharge);
    const daysLate = toNumber(plain.daysLate);
    summary.totalDaysLate += daysLate;

    if (plain.status === 'waived' || plain.status === 'cancelled') {
      summary.waivedLateCharges += total;
      return;
    }
    if (plain.status === 'paid') {
      summary.paidLateCharges += total;
    } else if (plain.status === 'pending') {
      summary.pendingLateCharges += total;
    }
    summary.totalLateCharges += total;
  });

  const incidents = lateReturnRentals.map((rental) => {
    const plain = rental.get({ plain: true });
    const daysLate = countDaysInclusive(plain.endDate, plain.actualReturnDate) - 1;
    const chargeTotal = (plain.lateCharges || [])
      .filter((c) => c.status !== 'waived' && c.status !== 'cancelled')
      .reduce((sum, c) => sum + toNumber(c.totalCharge), 0);

    return {
      rentalId: plain.id,
      customerName: plain.customer?.name || 'Unknown',
      branchName: plain.branch?.name || 'Unassigned',
      scheduledEndDate: plain.endDate,
      actualReturnDate: plain.actualReturnDate,
      daysLate: Math.max(0, daysLate),
      lateChargeAmount: chargeTotal,
    };
  });

  return { summary, incidents };
};

/**
 * Simplified utilization: rented item-days / available item-days in period.
 * @param {object} req
 * @param {string} startDate
 * @param {string} endDate
 */
const getUtilizationReport = async (req, startDate, endDate) => {
  const tenantId = req.tenantId;
  const branchWhere = buildBranchWhere(req);
  const periodDays = countDaysInclusive(startDate, endDate);

  const productWhere = {
    tenantId,
    isRentable: true,
    isActive: true,
  };
  if (req.shopFilterId) {
    productWhere.shopId = req.shopFilterId;
  } else if (req.shopScoped && !req.canAccessAllShops && req.allowedShopIds?.length) {
    productWhere.shopId = { [Op.in]: req.allowedShopIds };
  }

  const products = await Product.findAll({
    where: productWhere,
    attributes: ['id', 'name', 'sku', 'quantityOnHand', 'shopId'],
    raw: true,
  });

  const rentals = await Rental.findAll({
    where: {
      tenantId,
      status: { [Op.in]: ACTIVE_REVENUE_STATUSES },
      startDate: { [Op.lte]: endDate },
      endDate: { [Op.gte]: startDate },
      ...branchWhere,
    },
    include: [{ model: RentalItem, as: 'items', attributes: ['productId', 'quantity', 'rentalId'] }],
  });

  const rentedDaysByProduct = new Map();
  rentals.forEach((rental) => {
    const plain = rental.get({ plain: true });
    const days = overlapDays(plain.startDate, plain.endDate, startDate, endDate);
    if (days <= 0) return;

    (plain.items || []).forEach((item) => {
      const key = item.productId;
      const qty = Math.max(1, toNumber(item.quantity));
      const current = rentedDaysByProduct.get(key) || 0;
      rentedDaysByProduct.set(key, current + (days * qty));
    });
  });

  let totalAvailableDays = 0;
  let totalRentedDays = 0;

  const byProduct = products.map((product) => {
    const units = Math.max(1, toNumber(product.quantityOnHand) || 1);
    const availableDays = periodDays * units;
    const rentedDays = rentedDaysByProduct.get(product.id) || 0;
    const utilizationRate = availableDays > 0
      ? Math.min(100, parseFloat(((rentedDays / availableDays) * 100).toFixed(1)))
      : 0;

    totalAvailableDays += availableDays;
    totalRentedDays += rentedDays;

    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      units,
      availableDays,
      rentedDays,
      utilizationRate,
    };
  }).sort((a, b) => b.utilizationRate - a.utilizationRate);

  const overallUtilizationRate = totalAvailableDays > 0
    ? parseFloat(((totalRentedDays / totalAvailableDays) * 100).toFixed(1))
    : 0;

  return {
    periodDays,
    totalAvailableDays,
    totalRentedDays,
    overallUtilizationRate,
    byProduct,
  };
};

/**
 * Damage cost trends grouped by period and damage type.
 * @param {object} req
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} [groupBy='month']
 */
const getDamageTrendsReport = async (req, startDate, endDate, groupBy = 'month') => {
  const tenantId = req.tenantId;
  const branchWhere = buildBranchWhere(req);
  const dateFilter = parseReportDateRange(startDate, endDate);

  const damageReports = await DamageReport.findAll({
    where: {
      ...(dateFilter ? { inspectionDate: dateFilter } : {}),
    },
    include: [
      {
        model: Rental,
        as: 'rental',
        required: true,
        where: { tenantId, ...branchWhere },
        attributes: ['id', 'branchId'],
        include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
      },
      { model: Product, as: 'product', attributes: ['id', 'name'] },
    ],
    order: [['inspectionDate', 'ASC']],
  });

  const byPeriodMap = new Map();
  const byTypeMap = new Map();
  let totalEstimatedCost = 0;
  let totalActualCost = 0;
  let reportCount = 0;

  damageReports.forEach((report) => {
    const plain = report.get({ plain: true });
    reportCount += 1;
    const estimated = toNumber(plain.estimatedRepairCost);
    const actual = toNumber(plain.actualRepairCost);
    const cost = actual > 0 ? actual : estimated;
    totalEstimatedCost += estimated;
    totalActualCost += actual;

    const dateKey = plain.inspectionDate
      ? new Date(plain.inspectionDate).toISOString().slice(0, 10)
      : startDate;
    const bucket = bucketKeyForDate(dateKey, groupBy);
    const periodRow = byPeriodMap.get(bucket) || {
      period: bucket,
      reportCount: 0,
      estimatedCost: 0,
      actualCost: 0,
      totalCost: 0,
    };
    periodRow.reportCount += 1;
    periodRow.estimatedCost += estimated;
    periodRow.actualCost += actual;
    periodRow.totalCost += cost;
    byPeriodMap.set(bucket, periodRow);

    const damageType = plain.damageType || 'other';
    const typeRow = byTypeMap.get(damageType) || {
      damageType,
      reportCount: 0,
      totalCost: 0,
    };
    typeRow.reportCount += 1;
    typeRow.totalCost += cost;
    byTypeMap.set(damageType, typeRow);
  });

  const incidents = damageReports.slice(0, 50).map((report) => {
    const plain = report.get({ plain: true });
    const estimated = toNumber(plain.estimatedRepairCost);
    const actual = toNumber(plain.actualRepairCost);
    return {
      id: plain.id,
      productName: plain.product?.name || 'Unknown product',
      customerName: plain.rental?.customer?.name || 'Unknown',
      damageType: plain.damageType || 'other',
      severity: plain.severity || 'minor',
      status: plain.status,
      cost: actual > 0 ? actual : estimated,
      inspectionDate: plain.inspectionDate,
    };
  });

  return {
    reportCount,
    totalEstimatedCost,
    totalActualCost,
    totalCost: totalActualCost > 0 ? totalActualCost : totalEstimatedCost,
    byPeriod: Array.from(byPeriodMap.values()).sort((a, b) => a.period.localeCompare(b.period)),
    byType: Array.from(byTypeMap.values()).sort((a, b) => b.totalCost - a.totalCost),
    incidents,
  };
};

/**
 * Product rental history for the selected period.
 * @param {object} req
 * @param {string} startDate
 * @param {string} endDate
 */
const getRentalProductHistoryReport = async (req, startDate, endDate) => {
  const rentals = await fetchOverlappingRentals(req, startDate, endDate);
  const byProduct = new Map();

  rentals.forEach((rental) => {
    const plain = rental.get({ plain: true });
    const lastDate = plain.startDate || plain.createdAt;
    (plain.items || []).forEach((item) => {
      const productId = item.productId;
      const row = byProduct.get(productId) || {
        productId,
        productName: item.product?.name || 'Unknown product',
        sku: item.product?.sku || null,
        categoryName: item.product?.category?.name || 'Uncategorized',
        ratePerDay: toNumber(item.rentalRatePerDay ?? item.product?.rentalRatePerDay),
        timesRented: 0,
        totalQuantity: 0,
        totalRevenue: 0,
        lastRented: null,
      };
      row.timesRented += 1;
      row.totalQuantity += toNumber(item.quantity);
      row.totalRevenue += toNumber(item.subtotal);
      if (item.product?.category?.name) row.categoryName = item.product.category.name;
      if (!row.lastRented || String(lastDate) > String(row.lastRented)) {
        row.lastRented = lastDate;
      }
      byProduct.set(productId, row);
    });
  });

  return Array.from(byProduct.values())
    .map((row) => ({
      ...row,
      avgPerRental: row.timesRented > 0
        ? parseFloat((row.totalRevenue / row.timesRented).toFixed(2))
        : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
};

/**
 * Category performance from overlapping rentals.
 * @param {object} req
 * @param {string} startDate
 * @param {string} endDate
 */
const getRentalCategoryPerformance = async (req, startDate, endDate) => {
  const rentals = await fetchOverlappingRentals(req, startDate, endDate);
  const byCategory = new Map();

  rentals.forEach((rental) => {
    const plain = rental.get({ plain: true });
    (plain.items || []).forEach((item) => {
      const categoryName = item.product?.category?.name || 'Uncategorized';
      const row = byCategory.get(categoryName) || {
        categoryName,
        productIds: new Set(),
        revenue: 0,
        rentedQuantity: 0,
        soldQuantity: 0,
      };
      if (item.productId) row.productIds.add(item.productId);
      row.revenue += toNumber(item.subtotal);
      row.rentedQuantity += toNumber(item.quantity);
      byCategory.set(categoryName, row);
    });
  });

  return Array.from(byCategory.values())
    .map((row) => ({
      categoryName: row.categoryName,
      itemCount: row.productIds.size,
      revenue: row.revenue,
      rentedQuantity: row.rentedQuantity,
      soldQuantity: 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
};

/**
 * Payment method breakdown from rental records in the period.
 * @param {object} req
 * @param {string} startDate
 * @param {string} endDate
 */
const getRentalPaymentMethodStats = async (req, startDate, endDate) => {
  const rentals = await fetchOverlappingRentals(req, startDate, endDate);
  const byMethod = new Map();

  rentals.forEach((rental) => {
    const plain = rental.get({ plain: true });
    const method = plain.paymentMethod || 'other';
    const row = byMethod.get(method) || {
      method,
      label: paymentMethodLabel(method),
      amount: 0,
      transactionCount: 0,
    };
    row.amount += toNumber(plain.amount);
    row.transactionCount += 1;
    byMethod.set(method, row);
  });

  const methods = Array.from(byMethod.values()).sort((a, b) => b.amount - a.amount);
  const totalAmount = methods.reduce((sum, row) => sum + row.amount, 0);
  const totalTransactions = methods.reduce((sum, row) => sum + row.transactionCount, 0);

  return {
    methods: methods.map((row) => ({
      ...row,
      percentage: totalAmount > 0 ? parseFloat(((row.amount / totalAmount) * 100).toFixed(2)) : 0,
    })),
    totalAmount,
    totalTransactions,
  };
};

/**
 * Product sales vs hire booked for rental workspaces.
 * @param {object} req
 * @param {string} startDate
 * @param {string} endDate
 * @param {number} rentalRevenue
 */
const getRentalSalesSplit = async (req, startDate, endDate, rentalRevenue = 0) => {
  const dateFilter = parseReportDateRange(startDate, endDate);
  const shopWhere = buildProductShopWhere(req);
  const saleWhere = {
    tenantId: req.tenantId,
    status: { [Op.notIn]: ['cancelled', 'refunded'] },
    ...(dateFilter ? { createdAt: dateFilter } : {}),
    ...(shopWhere.shopId ? { shopId: shopWhere.shopId } : {}),
  };

  const salesRevenue = toNumber(await Sale.sum('total', { where: saleWhere }));
  const rental = toNumber(rentalRevenue);
  const total = salesRevenue + rental;

  return {
    salesRevenue,
    rentalRevenue: rental,
    totalRevenue: total,
    salesShare: total > 0 ? parseFloat(((salesRevenue / total) * 100).toFixed(1)) : 0,
    rentalShare: total > 0 ? parseFloat(((rental / total) * 100).toFixed(1)) : 0,
  };
};

/**
 * Low / out-of-stock rentable products.
 * @param {object} req
 */
const getRentalLowStockAlerts = async (req) => {
  const products = await Product.findAll({
    where: {
      tenantId: req.tenantId,
      isRentable: true,
      isActive: true,
      ...buildProductShopWhere(req),
    },
    include: [
      { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
      { model: Shop, as: 'shop', attributes: ['id', 'name'] },
    ],
    attributes: ['id', 'name', 'sku', 'quantityOnHand', 'reorderLevel', 'shopId', 'categoryId'],
    order: [['quantityOnHand', 'ASC'], ['name', 'ASC']],
  });

  return products
    .map((product) => {
      const plain = product.get({ plain: true });
      const status = stockAlertStatus(plain.quantityOnHand, plain.reorderLevel);
      if (!status) return null;
      return {
        productId: plain.id,
        productName: plain.name,
        sku: plain.sku,
        categoryName: plain.category?.name || 'Uncategorized',
        branchName: plain.shop?.name || 'Unassigned',
        quantityOnHand: toNumber(plain.quantityOnHand),
        reorderLevel: toNumber(plain.reorderLevel),
        status,
        statusLabel: status === 'out_of_stock' ? 'Out of Stock' : 'Critical Low',
      };
    })
    .filter(Boolean);
};

/**
 * Fleet inventory value by branch (cost × quantity) plus rental activity.
 * @param {object} req
 * @param {Array<{ branchId: string, branchName: string, rentalCount: number }>} rentalByBranch
 */
const getRentalInventoryByBranch = async (req, rentalByBranch = []) => {
  const products = await Product.findAll({
    where: {
      tenantId: req.tenantId,
      isRentable: true,
      isActive: true,
      ...buildProductShopWhere(req),
    },
    include: [{ model: Shop, as: 'shop', attributes: ['id', 'name'] }],
    attributes: ['id', 'shopId', 'costPrice', 'quantityOnHand'],
  });

  const byBranch = new Map();
  products.forEach((product) => {
    const plain = product.get({ plain: true });
    const branchId = plain.shopId || 'unassigned';
    const row = byBranch.get(branchId) || {
      branchId,
      branchName: plain.shop?.name || 'Unassigned',
      itemCount: 0,
      inventoryValue: 0,
      rentalCount: 0,
      salesCount: 0,
    };
    row.itemCount += 1;
    row.inventoryValue += toNumber(plain.costPrice) * toNumber(plain.quantityOnHand);
    byBranch.set(branchId, row);
  });

  rentalByBranch.forEach((branch) => {
    const row = byBranch.get(branch.branchId) || {
      branchId: branch.branchId,
      branchName: branch.branchName,
      itemCount: 0,
      inventoryValue: 0,
      rentalCount: 0,
      salesCount: 0,
    };
    row.rentalCount = toNumber(branch.rentalCount);
    if (branch.branchName) row.branchName = branch.branchName;
    byBranch.set(branch.branchId, row);
  });

  const rows = Array.from(byBranch.values()).sort((a, b) => b.inventoryValue - a.inventoryValue);
  const totalValue = rows.reduce((sum, row) => sum + row.inventoryValue, 0);
  return rows.map((row) => ({
    ...row,
    percentage: totalValue > 0 ? parseFloat(((row.inventoryValue / totalValue) * 100).toFixed(1)) : 0,
  }));
};

/**
 * Combined rental reports payload for the Reports overview page.
 * @param {object} req
 * @param {object} query
 */
const getRentalReportsOverview = async (req, query = {}) => {
  const { startDate, endDate, groupBy = 'day' } = query;
  if (!startDate || !endDate) {
    const error = new Error('startDate and endDate are required');
    error.statusCode = 400;
    throw error;
  }

  const [revenue, lateReturns, utilization, damageTrends] = await Promise.all([
    getRentalRevenueReport(req, startDate, endDate, groupBy),
    getLateReturnsReport(req, startDate, endDate),
    getUtilizationReport(req, startDate, endDate),
    getDamageTrendsReport(req, startDate, endDate, groupBy === 'day' ? 'week' : groupBy),
  ]);

  return {
    revenue,
    lateReturns,
    utilization,
    damageTrends,
    period: { startDate, endDate, groupBy },
  };
};

/**
 * Full rental Smart Business Report payload.
 * @param {object} req
 * @param {object} query
 */
const getRentalSmartReport = async (req, query = {}) => {
  const overview = await getRentalReportsOverview(req, query);
  const { startDate, endDate } = overview.period;
  const hireBooked = toNumber(overview.revenue?.totalRevenue);

  const [productHistory, categoryPerformance, paymentMethods, salesSplit, lowStockAlerts, inventoryByBranch] = await Promise.all([
    getRentalProductHistoryReport(req, startDate, endDate),
    getRentalCategoryPerformance(req, startDate, endDate),
    getRentalPaymentMethodStats(req, startDate, endDate),
    getRentalSalesSplit(req, startDate, endDate, hireBooked),
    getRentalLowStockAlerts(req),
    getRentalInventoryByBranch(req, overview.revenue?.byBranch || []),
  ]);

  return {
    ...overview,
    productHistory,
    categoryPerformance,
    paymentMethods,
    salesSplit,
    lowStockAlerts,
    inventoryByBranch,
  };
};

module.exports = {
  getRentalRevenueReport,
  getLateReturnsReport,
  getUtilizationReport,
  getDamageTrendsReport,
  getRentalReportsOverview,
  getRentalProductHistoryReport,
  getRentalCategoryPerformance,
  getRentalPaymentMethodStats,
  getRentalSalesSplit,
  getRentalLowStockAlerts,
  getRentalInventoryByBranch,
  getRentalSmartReport,
  overlapDays,
  countDaysInclusive,
  paymentMethodLabel,
  stockAlertStatus,
};
