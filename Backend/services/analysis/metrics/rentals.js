const { Op } = require('sequelize');
const { sequelize } = require('../../../config/database');
const {
  Rental,
  Customer,
  Product,
  DamageReport,
  PreBooking,
} = require('../../../models');
const { roundMoney } = require('../profitFormulas');
const { resolveAnalysisPeriod } = require('./dates');

const ACTIVE_REVENUE_STATUSES = ['confirmed', 'active', 'overdue', 'returned', 'completed'];
const DUE_BACK_STATUSES = ['active', 'confirmed', 'overdue'];

/**
 * @param {{ tenantId: string, shopFilterId?: string|null }} scope
 * @returns {object}
 */
function buildRentalWhere(scope) {
  const where = { tenantId: scope.tenantId };
  if (scope.shopFilterId) where.branchId = scope.shopFilterId;
  return where;
}

/**
 * Dashboard-style rental KPIs for assistant context and analysis.
 * @param {{ tenantId: string, shopFilterId?: string|null }} scope
 * @returns {Promise<object>}
 */
async function getRentalKpis(scope) {
  const todayDate = new Date().toISOString().slice(0, 10);
  const rentalWhere = buildRentalWhere(scope);

  const [
    activeRentals,
    overdueRentals,
    completedRentals,
    dueBackToday,
    upcomingPreBookings,
  ] = await Promise.all([
    Rental.count({ where: { ...rentalWhere, status: 'active' } }),
    Rental.count({ where: { ...rentalWhere, status: 'overdue' } }),
    Rental.count({ where: { ...rentalWhere, status: 'completed' } }),
    Rental.count({
      where: {
        ...rentalWhere,
        status: { [Op.in]: DUE_BACK_STATUSES },
        endDate: todayDate,
      },
    }),
    PreBooking.count({ where: { ...rentalWhere, status: 'pending' } }),
  ]);

  return {
    activeRentals: Number(activeRentals || 0),
    overdueRentals: Number(overdueRentals || 0),
    completedRentals: Number(completedRentals || 0),
    dueBackToday: Number(dueBackToday || 0),
    upcomingPreBookings: Number(upcomingPreBookings || 0),
    asOfDate: todayDate,
  };
}

/**
 * @param {{ tenantId: string, shopFilterId?: string|null }} scope
 * @param {number} [limit=5]
 */
async function getRentalsDueToday(scope, limit = 5) {
  const todayDate = new Date().toISOString().slice(0, 10);
  const where = {
    ...buildRentalWhere(scope),
    status: { [Op.in]: DUE_BACK_STATUSES },
    endDate: todayDate,
  };
  const [totalCount, rows] = await Promise.all([
    Rental.count({ where }),
    Rental.findAll({
      where,
      attributes: ['id', 'status', 'startDate', 'endDate', 'amount', 'totalDue', 'amountPaid'],
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'company'] }],
      order: [['endDate', 'ASC']],
      limit,
    }),
  ]);

  return {
    asOfDate: todayDate,
    count: Number(totalCount || 0),
    rentals: rows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      const customer = plain.customer || {};
      return {
        rentalId: plain.id,
        status: plain.status,
        customerName: customer.company || customer.name || 'Unknown customer',
        endDate: plain.endDate,
        amount: roundMoney(plain.amount),
        balanceDue: roundMoney(Math.max(0, Number(plain.totalDue || 0) - Number(plain.amountPaid || 0))),
      };
    }),
  };
}

/**
 * @param {{ tenantId: string, shopFilterId?: string|null }} scope
 * @param {number} [limit=5]
 */
async function getOverdueRentals(scope, limit = 5) {
  const where = {
    ...buildRentalWhere(scope),
    status: 'overdue',
  };
  const [totalCount, rows] = await Promise.all([
    Rental.count({ where }),
    Rental.findAll({
      where,
      attributes: ['id', 'status', 'startDate', 'endDate', 'amount', 'totalDue', 'amountPaid'],
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'company'] }],
      order: [['endDate', 'ASC']],
      limit,
    }),
  ]);

  return {
    count: Number(totalCount || 0),
    rentals: rows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      const customer = plain.customer || {};
      return {
        rentalId: plain.id,
        customerName: customer.company || customer.name || 'Unknown customer',
        endDate: plain.endDate,
        amount: roundMoney(plain.amount),
        balanceDue: roundMoney(Math.max(0, Number(plain.totalDue || 0) - Number(plain.amountPaid || 0))),
      };
    }),
  };
}

/**
 * Products with the most damage incidents.
 * @param {{ tenantId: string, shopFilterId?: string|null }} scope
 * @param {number} [limit=5]
 */
async function getTopDamageProducts(scope, limit = 5) {
  const rentalWhere = buildRentalWhere(scope);
  const rows = await DamageReport.findAll({
    attributes: [
      'productId',
      [sequelize.fn('COUNT', sequelize.col('DamageReport.id')), 'incidentCount'],
      [
        sequelize.fn(
          'SUM',
          sequelize.fn(
            'COALESCE',
            sequelize.col('DamageReport.actualRepairCost'),
            sequelize.col('DamageReport.estimatedRepairCost'),
            0
          )
        ),
        'totalRepairCost',
      ],
    ],
    include: [
      {
        model: Rental,
        as: 'rental',
        attributes: [],
        where: rentalWhere,
        required: true,
      },
      {
        model: Product,
        as: 'product',
        attributes: ['id', 'name'],
      },
    ],
    group: ['DamageReport.productId', 'product.id'],
    order: [[sequelize.literal('"incidentCount"'), 'DESC']],
    limit,
    subQuery: false,
  });

  return {
    products: rows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      return {
        productId: plain.productId,
        productName: plain.product?.name || 'Unknown item',
        incidentCount: Number(plain.incidentCount || plain.get?.('incidentCount') || 0),
        totalRepairCost: roundMoney(plain.totalRepairCost || plain.get?.('totalRepairCost') || 0),
      };
    }),
  };
}

/**
 * Rental revenue for rentals overlapping a date range (booked hire amounts).
 * @param {{ tenantId: string, shopFilterId?: string|null, startDate?: string, endDate?: string, period?: string, periodLabel?: string, now?: Date }} ctx
 */
async function getRentalRevenueForPeriod(ctx) {
  const resolved = resolveAnalysisPeriod(ctx, ctx.now);
  const startDate = resolved.startDate;
  const endDate = resolved.endDate;
  const rentalWhere = buildRentalWhere(ctx);

  const rentals = await Rental.findAll({
    where: {
      ...rentalWhere,
      status: { [Op.in]: ACTIVE_REVENUE_STATUSES },
      startDate: { [Op.lte]: endDate },
      endDate: { [Op.gte]: startDate },
    },
    attributes: ['id', 'amount', 'startDate', 'endDate', 'status'],
  });

  const revenue = rentals.reduce((sum, rental) => sum + Number(rental.amount || 0), 0);

  return {
    period: {
      label: resolved.label,
      startDate,
      endDate,
      revenue: roundMoney(revenue),
      rentalCount: rentals.length,
    },
    periodLabel: resolved.label,
  };
}

/**
 * Rental-focused performance snapshot.
 * @param {{ tenantId: string, shopFilterId?: string|null, startDate?: string, endDate?: string, period?: string, periodLabel?: string, now?: Date }} ctx
 */
async function getRentalPerformanceSummary(ctx) {
  const [kpis, dueToday, overdue, revenue, receivablesModule] = await Promise.all([
    getRentalKpis(ctx),
    getRentalsDueToday(ctx, 3),
    getOverdueRentals(ctx, 3),
    getRentalRevenueForPeriod(ctx),
    require('./receivables').getReceivables(ctx),
  ]);

  return {
    kpis,
    dueToday,
    overdue,
    revenue: revenue.period,
    receivables: receivablesModule,
  };
}

module.exports = {
  getRentalKpis,
  getRentalsDueToday,
  getOverdueRentals,
  getTopDamageProducts,
  getRentalRevenueForPeriod,
  getRentalPerformanceSummary,
  buildRentalWhere,
  ACTIVE_REVENUE_STATUSES,
};
