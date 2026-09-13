const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  PartnerCashoutRequest,
  PartnerCommission,
  Marketer,
  Tenant,
  PartnerProgramSettings,
} = require('../models');
const { money } = require('./partnerProgramService');

const share = row => money(row.marketerShareAmount ?? row.amount);

const OPEN_CASHOUT_STATUSES = ['pending', 'approved'];

/**
 * Available balance = sum of due commissions not locked in a cashout.
 */
const getAvailableBalance = async (marketerId, tenantId = null) => {
  const where = { marketerId, status: 'due', remittanceStatus: 'collected', cashoutRequestId: null };
  if (tenantId) where.tenantId = tenantId;
  const rows = await PartnerCommission.findAll({
    where,
    attributes: ['amount', 'marketerShareAmount', 'remittanceStatus'],
  });
  return money(rows.reduce((sum, row) => sum + share(row), 0));
};

/**
 * Create cashout locking selected due commissions (server recomputes amount).
 */
const createCashout = async ({ marketerId, commissionIds = [], notes = null }) => {
  const ids = [...new Set((commissionIds || []).filter(Boolean))];
  if (!ids.length) {
    const err = new Error('Select at least one commission to cash out.');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    throw err;
  }

  const marketer = await Marketer.findByPk(marketerId);
  if (!marketer?.momoNumber && !marketer?.bankDetails) {
    const err = new Error('Add a MoMo number or bank details in your profile before requesting a cashout.');
    err.statusCode = 400;
    err.errorCode = 'PAYOUT_METHOD_REQUIRED';
    throw err;
  }

  return sequelize.transaction(async (transaction) => {
    const commissions = await PartnerCommission.findAll({
      where: {
        id: { [Op.in]: ids },
        marketerId,
        status: 'due',
        remittanceStatus: 'collected',
        cashoutRequestId: null,
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (commissions.length !== ids.length) {
      const err = new Error('One or more commissions are unavailable for cashout.');
      err.statusCode = 409;
      err.errorCode = 'COMMISSION_NOT_AVAILABLE';
      throw err;
    }

    const tenantIds = [...new Set(commissions.map((c) => c.tenantId))];
    if (tenantIds.length !== 1) {
      const err = new Error('Cash out commissions for one business at a time.');
      err.statusCode = 400;
      err.errorCode = 'SINGLE_TENANT_REQUIRED';
      throw err;
    }

    const tenantId = tenantIds[0];
    const amount = money(commissions.reduce((sum, row) => sum + share(row), 0));
    if (amount <= 0) {
      const err = new Error('Cashout amount must be greater than zero.');
      err.statusCode = 400;
      err.errorCode = 'VALIDATION_ERROR';
      throw err;
    }

    const cashout = await PartnerCashoutRequest.create(
      {
        tenantId,
        marketerId,
        amount,
        currency: 'GHS',
        status: 'pending',
        notes: notes ? String(notes).trim() : null,
        metadata: {
          commissionIds: commissions.map((c) => c.id),
          momoNumber: marketer.momoNumber || null,
          bankDetails: marketer.bankDetails || null,
        },
      },
      { transaction }
    );

    await PartnerCommission.update(
      {
        status: 'cashout_pending',
        cashoutRequestId: cashout.id,
      },
      {
        where: { id: { [Op.in]: commissions.map((c) => c.id) } },
        transaction,
      }
    );

    return getCashoutById(cashout.id, { transaction });
  });
};

const getCashoutById = async (id, { transaction } = {}) =>
  PartnerCashoutRequest.findByPk(id, {
    include: [
      { association: 'marketer', attributes: ['id', 'name', 'email', 'phone', 'momoNumber', 'bankDetails'] },
      { association: 'tenant', attributes: ['id', 'name'] },
      {
        association: 'commissions',
        attributes: ['id', 'amount', 'status', 'rateType', 'ratePercent', 'paymentAmount', 'createdAt'],
      },
    ],
    transaction,
  });

const listCashoutsForMarketer = async (marketerId) =>
  PartnerCashoutRequest.findAll({
    where: { marketerId },
    include: [
      {
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name'],
        include: [
          {
            model: PartnerProgramSettings,
            as: 'partnerProgramSettings',
            attributes: ['slug', 'displayName'],
          },
        ],
      },
      {
        association: 'commissions',
        attributes: ['id', 'amount', 'status'],
      },
    ],
    order: [['createdAt', 'DESC']],
  });

const listCashoutsForTenant = async (tenantId, { status } = {}) => {
  const where = { tenantId };
  if (status) where.status = status;
  return PartnerCashoutRequest.findAll({
    where,
    include: [
      { association: 'marketer', attributes: ['id', 'name', 'email', 'phone', 'momoNumber', 'bankDetails'] },
      {
        association: 'commissions',
        attributes: ['id', 'amount', 'status', 'customerId', 'createdAt'],
      },
    ],
    order: [['createdAt', 'DESC']],
  });
};

const assertTenantCashout = async (tenantId, cashoutId, transaction) => {
  const cashout = await PartnerCashoutRequest.findOne({
    where: { id: cashoutId, ...(tenantId ? { tenantId } : {}) },
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
    transaction,
  });
  if (!cashout) {
    const err = new Error('Cashout request not found.');
    err.statusCode = 404;
    err.errorCode = 'CASHOUT_NOT_FOUND';
    throw err;
  }
  return cashout;
};

const approveCashout = async ({ tenantId, cashoutId, processedByUserId = null }) =>
  sequelize.transaction(async (transaction) => {
    const cashout = await assertTenantCashout(tenantId, cashoutId, transaction);
    if (cashout.status !== 'pending') {
      const err = new Error('Only pending cashouts can be approved.');
      err.statusCode = 409;
      err.errorCode = 'INVALID_CASHOUT_STATE';
      throw err;
    }
    await cashout.update(
      {
        status: 'approved',
        processedByUserId,
      },
      { transaction }
    );
    return getCashoutById(cashout.id, { transaction });
  });

const rejectCashout = async ({ tenantId, cashoutId, processedByUserId = null, notes = null }) =>
  sequelize.transaction(async (transaction) => {
    const cashout = await assertTenantCashout(tenantId, cashoutId, transaction);
    if (!OPEN_CASHOUT_STATUSES.includes(cashout.status)) {
      const err = new Error('Only pending or approved cashouts can be rejected.');
      err.statusCode = 409;
      err.errorCode = 'INVALID_CASHOUT_STATE';
      throw err;
    }

    await PartnerCommission.update(
      {
        status: 'due',
        cashoutRequestId: null,
      },
      {
        where: { cashoutRequestId: cashout.id, status: 'cashout_pending' },
        transaction,
      }
    );

    await cashout.update(
      {
        status: 'rejected',
        processedAt: new Date(),
        processedByUserId,
        notes: notes != null ? String(notes).trim() : cashout.notes,
      },
      { transaction }
    );
    return getCashoutById(cashout.id, { transaction });
  });

const markCashoutPaid = async ({
  tenantId,
  cashoutId,
  processedByUserId = null,
  notes = null,
  payoutReference = null,
}) =>
  sequelize.transaction(async (transaction) => {
    const cashout = await assertTenantCashout(tenantId, cashoutId, transaction);
    if (cashout.status === 'paid') {
      return getCashoutById(cashout.id, { transaction });
    }
    if (!['pending', 'approved'].includes(cashout.status)) {
      const err = new Error('Only pending or approved cashouts can be marked paid.');
      err.statusCode = 409;
      err.errorCode = 'INVALID_CASHOUT_STATE';
      throw err;
    }

    await PartnerCommission.update(
      {
        status: 'paid',
        paidAt: new Date(),
        paidBy: processedByUserId,
        paidNote: notes ? String(notes).trim() : null,
      },
      {
        where: { cashoutRequestId: cashout.id, status: 'cashout_pending' },
        transaction,
      }
    );

    await cashout.update(
      {
        status: 'paid',
        processedAt: new Date(),
        processedByUserId,
        payoutReference: payoutReference ? String(payoutReference).trim().slice(0, 160) : cashout.payoutReference,
        notes: notes != null ? String(notes).trim() : cashout.notes,
      },
      { transaction }
    );
    return getCashoutById(cashout.id, { transaction });
  });

const getMarketerDashboard = async (marketerId) => {
  const { PartnerReferral, Partnership } = require('../models');

  const [dueRows, cashoutPendingRows, paidRows, openCashouts, partnerships, pendingRefs, matchedRefs, conflictRefs, totalRefs] =
    await Promise.all([
      PartnerCommission.findAll({
        where: { marketerId, status: 'due', cashoutRequestId: null },
        attributes: ['amount', 'marketerShareAmount', 'remittanceStatus'],
      }),
      PartnerCommission.findAll({
        where: { marketerId, status: 'cashout_pending' },
        attributes: ['amount', 'marketerShareAmount', 'remittanceStatus'],
      }),
      PartnerCommission.findAll({
        where: { marketerId, status: 'paid' },
        attributes: ['amount', 'marketerShareAmount', 'remittanceStatus'],
      }),
      PartnerCashoutRequest.count({
        where: { marketerId, status: { [Op.in]: OPEN_CASHOUT_STATUSES } },
      }),
      Partnership.count({ where: { marketerId, status: 'active' } }),
      PartnerReferral.count({ where: { marketerId, status: 'pending' } }),
      PartnerReferral.count({ where: { marketerId, status: 'matched' } }),
      PartnerReferral.count({ where: { marketerId, status: 'conflict' } }),
      PartnerReferral.count({ where: { marketerId } }),
    ]);

  const availableBalance = money(dueRows.filter(r => r.remittanceStatus === 'collected').reduce((s, r) => s + share(r), 0));
  const pendingCashoutAmount = money(cashoutPendingRows.reduce((s, r) => s + share(r), 0));
  const totalEarned = money(
    dueRows.reduce((s, r) => s + share(r), 0)
    + pendingCashoutAmount
    + paidRows.reduce((s, r) => s + share(r), 0)
  );

  return {
    availableBalance,
    awaitingCollectionAmount: money(dueRows.filter(r => r.remittanceStatus !== 'collected').reduce((s, r) => s + share(r), 0)),
    pendingCashoutAmount,
    totalEarned,
    pendingCommissionsCount: dueRows.length,
    openCashoutsCount: openCashouts,
    activePartnershipsCount: partnerships,
    referrals: {
      total: totalRefs,
      pending: pendingRefs,
      matched: matchedRefs,
      conflict: conflictRefs,
    },
  };
};

const listCashoutsAdmin = async ({ status, search, limit = 20, offset = 0 } = {}) => {
  const where = status ? { status } : {};
  return PartnerCashoutRequest.findAndCountAll({ where, limit, offset, distinct: true,
    include: [
      { association: 'marketer', attributes: ['id', 'name', 'email', 'momoNumber', 'bankDetails'],
        ...(search ? { where: { name: { [Op.iLike]: `%${String(search).trim()}%` } }, required: true } : {}) },
      { association: 'tenant', attributes: ['id', 'name'] },
    ], order: [['createdAt', 'DESC']],
  });
};

module.exports = {
  listCashoutsAdmin,
  getAvailableBalance,
  createCashout,
  getCashoutById,
  listCashoutsForMarketer,
  listCashoutsForTenant,
  approveCashout,
  rejectCashout,
  markCashoutPaid,
  getMarketerDashboard,
};
