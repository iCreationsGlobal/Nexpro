const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { PartnerRemittance, PartnerCommission, Tenant } = require('../models');
const { money } = require('./partnerProgramService');

const remittanceInclude = [
  { model: Tenant, as: 'tenant', attributes: ['id', 'name'] },
  {
    association: 'commissions',
    attributes: [
      'id',
      'amount',
      'platformFeeAmount',
      'marketerShareAmount',
      'status',
      'remittanceStatus',
      'marketerId',
    ],
  },
];

const getRemittanceById = async (id, { transaction } = {}) =>
  PartnerRemittance.findByPk(id, { include: remittanceInclude, transaction });

/**
 * Business remits the full marketer commission to ABS. Marks those commissions collected.
 */
const createRemittance = async ({
  tenantId,
  commissionIds = [],
  paidByUserId = null,
  recordedByUserId = null,
  payoutReference = null,
  notes = null,
}) => {
  const ids = [...new Set((commissionIds || []).filter(Boolean))];
  if (!tenantId) {
    const err = new Error('Business is required.');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    throw err;
  }
  if (!ids.length) {
    const err = new Error('Select at least one commission to pay Sabito.');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    throw err;
  }

  return sequelize.transaction(async (transaction) => {
    const commissions = await PartnerCommission.findAll({
      where: {
        id: { [Op.in]: ids },
        tenantId,
        remittanceStatus: 'owed',
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (commissions.length !== ids.length) {
      const err = new Error('One or more commissions are already remitted or not found.');
      err.statusCode = 409;
      err.errorCode = 'COMMISSION_NOT_AVAILABLE';
      throw err;
    }

    const amount = money(commissions.reduce((sum, row) => sum + money(row.amount), 0));
    const platformFeeAmount = money(
      commissions.reduce((sum, row) => sum + money(row.platformFeeAmount), 0)
    );
    const marketerShareAmount = money(
      commissions.reduce((sum, row) => sum + money(row.marketerShareAmount ?? row.amount), 0)
    );
    if (amount <= 0) {
      const err = new Error('Remittance amount must be greater than zero.');
      err.statusCode = 400;
      err.errorCode = 'VALIDATION_ERROR';
      throw err;
    }

    const remittance = await PartnerRemittance.create(
      {
        tenantId,
        amount,
        platformFeeAmount,
        marketerShareAmount,
        currency: 'GHS',
        status: 'paid',
        paidAt: new Date(),
        paidByUserId,
        recordedByUserId,
        payoutReference: payoutReference ? String(payoutReference).trim().slice(0, 160) : null,
        notes: notes ? String(notes).trim() : null,
        metadata: { commissionIds: commissions.map((c) => c.id) },
      },
      { transaction }
    );

    await PartnerCommission.update(
      {
        remittanceStatus: 'collected',
        remittanceId: remittance.id,
      },
      {
        where: { id: { [Op.in]: commissions.map((c) => c.id) } },
        transaction,
      }
    );

    return getRemittanceById(remittance.id, { transaction });
  });
};

const listRemittancesForTenant = async (tenantId) =>
  PartnerRemittance.findAll({
    where: { tenantId },
    include: remittanceInclude,
    order: [['createdAt', 'DESC']],
  });

const listRemittancesAdmin = async ({ status, search, limit = 20, offset = 0 } = {}) => {
  const where = {};
  if (status) where.status = status;
  const tenantWhere = search
    ? { name: { [Op.iLike]: `%${String(search).trim()}%` } }
    : undefined;

  const { rows, count } = await PartnerRemittance.findAndCountAll({
    where,
    include: [
      {
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name'],
        where: tenantWhere,
        required: Boolean(tenantWhere),
      },
      remittanceInclude[1],
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { rows, count };
};

module.exports = {
  createRemittance,
  listRemittancesForTenant,
  listRemittancesAdmin,
  getRemittanceById,
};
