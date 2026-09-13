const { Op } = require('sequelize');
const {
  PartnerCommission,
  PartnerReferral,
  Partnership,
  Customer,
  Sale,
  Invoice,
  Job,
} = require('../models');
const { money } = require('./partnerProgramService');
const sabitoAppPlatformService = require('./sabitoAppPlatformService');

const splitCommission = (commissionAmount, feePercent) => {
  const amount = money(commissionAmount);
  const percent = money(feePercent);
  const platformFeeAmount = money((amount * percent) / 100);
  const marketerShareAmount = money(amount - platformFeeAmount);
  return { amount, platformFeePercent: percent, platformFeeAmount, marketerShareAmount };
};

/**
 * Resolve partnership attribution from sale / invoice / job / customer.
 */
const resolveAttribution = async ({ tenantId, saleId, invoiceId, customerId, jobId }) => {
  let partnershipId = null;
  let marketerId = null;
  let resolvedCustomerId = customerId || null;
  let resolvedSaleId = saleId || null;
  let resolvedInvoiceId = invoiceId || null;
  let resolvedJobId = jobId || null;

  if (saleId) {
    const sale = await Sale.findOne({ where: { id: saleId, tenantId } });
    if (sale) {
      partnershipId = sale.partnershipId || null;
      marketerId = sale.partnerMarketerId || null;
      resolvedCustomerId = resolvedCustomerId || sale.customerId;
      resolvedSaleId = sale.id;
      resolvedInvoiceId = resolvedInvoiceId || sale.invoiceId;
    }
  }

  if ((!partnershipId || !marketerId) && invoiceId) {
    const invoice = await Invoice.findOne({ where: { id: invoiceId, tenantId } });
    if (invoice) {
      resolvedCustomerId = resolvedCustomerId || invoice.customerId;
      resolvedInvoiceId = invoice.id;
      resolvedJobId = resolvedJobId || invoice.jobId;
      if (invoice.saleId && !resolvedSaleId) {
        const sale = await Sale.findOne({ where: { id: invoice.saleId, tenantId } });
        if (sale) {
          partnershipId = partnershipId || sale.partnershipId;
          marketerId = marketerId || sale.partnerMarketerId;
          resolvedSaleId = sale.id;
        }
      }
    }
  }

  if ((!partnershipId || !marketerId) && resolvedJobId) {
    const job = await Job.findOne({ where: { id: resolvedJobId, tenantId } });
    if (job) {
      partnershipId = partnershipId || job.partnershipId;
      marketerId = marketerId || job.partnerMarketerId;
      resolvedCustomerId = resolvedCustomerId || job.customerId;
    }
  }

  if ((!partnershipId || !marketerId) && resolvedCustomerId) {
    const customer = await Customer.findOne({ where: { id: resolvedCustomerId, tenantId } });
    if (customer) {
      partnershipId = partnershipId || customer.partnershipId;
      marketerId = marketerId || customer.partnerMarketerId;
    }
  }

  if (!partnershipId || !marketerId) return null;

  const partnership = await Partnership.findOne({
    where: { id: partnershipId, tenantId, marketerId, status: 'active' },
  });
  if (!partnership) return null;

  return {
    partnership,
    customerId: resolvedCustomerId,
    saleId: resolvedSaleId,
    invoiceId: resolvedInvoiceId,
  };
};

/**
 * Determine first vs returning rate for this marketer+customer+business.
 * First = no prior partner_commission for this pair; else returning if within attribution window.
 */
const resolveRate = async (partnership, customerId) => {
  const firstRate = money(partnership.firstClientRatePercent);
  const returningRate = money(partnership.returningClientRatePercent);

  if (!customerId) {
    return { rateType: 'first', ratePercent: firstRate };
  }

  const prior = await PartnerCommission.findOne({
    where: {
      partnershipId: partnership.id,
      customerId,
      status: { [Op.in]: ['due', 'paid'] },
    },
    order: [['createdAt', 'ASC']],
  });

  if (!prior) {
    return { rateType: 'first', ratePercent: firstRate };
  }

  const months = Number(partnership.attributionMonths) || 12;
  const windowStart = new Date(prior.createdAt);
  windowStart.setMonth(windowStart.getMonth() + months);
  if (new Date() <= windowStart) {
    return { rateType: 'returning', ratePercent: returningRate };
  }

  // Outside window — treat as first again
  return { rateType: 'first', ratePercent: firstRate };
};

/**
 * Accrue commission when a customer payment is collected.
 * Safe to call multiple times for same paymentId (unique constraint).
 *
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {number} params.paymentAmount - Amount just collected
 * @param {string} [params.paymentId]
 * @param {string} [params.saleId]
 * @param {string} [params.invoiceId]
 * @param {string} [params.customerId]
 */
const maybeCreateCommissionForPayment = async ({
  tenantId,
  paymentAmount,
  paymentId = null,
  saleId = null,
  invoiceId = null,
  customerId = null,
  jobId = null,
  collectedAt = null,
}) => {
  const amountCollected = money(paymentAmount);
  if (!tenantId || amountCollected <= 0) return null;

  if (paymentId) {
    const existing = await PartnerCommission.findOne({ where: { paymentId } });
    if (existing) return existing;
  }

  const attribution = await resolveAttribution({
    tenantId,
    saleId,
    invoiceId,
    customerId,
    jobId,
  });
  if (!attribution) return null;

  const { partnership, customerId: cid, saleId: sid, invoiceId: iid } = attribution;
  // Recovery/reconciliation must never attribute payments collected before this referral existed.
  if (collectedAt) {
    const paidAt = new Date(collectedAt);
    if (partnership.activatedAt && paidAt < new Date(partnership.activatedAt)) return null;
    if (cid) {
      const referral = await PartnerReferral.findOne({ where: {
        tenantId, partnershipId: partnership.id, marketerId: partnership.marketerId,
        customerId: cid, status: 'matched',
      } });
      if (referral?.matchedAt && paidAt < new Date(referral.matchedAt)) return null;
    }
  }
  const { rateType, ratePercent } = await resolveRate(partnership, cid);
  const commissionAmount = money((amountCollected * ratePercent) / 100);
  if (commissionAmount <= 0) return null;
  const feePercent = await sabitoAppPlatformService.getPlatformFeePercent();
  const split = splitCommission(commissionAmount, feePercent);

  try {
    return await PartnerCommission.create({
      tenantId,
      partnershipId: partnership.id,
      marketerId: partnership.marketerId,
      customerId: cid,
      saleId: sid,
      invoiceId: iid,
      paymentId,
      rateType,
      ratePercent,
      paymentAmount: amountCollected,
      amount: split.amount,
      platformFeePercent: split.platformFeePercent,
      platformFeeAmount: split.platformFeeAmount,
      marketerShareAmount: split.marketerShareAmount,
      remittanceStatus: 'owed',
      currency: 'GHS',
      status: 'due',
    });
  } catch (error) {
    // Unique paymentId race
    if (paymentId && (error.name === 'SequelizeUniqueConstraintError' || error.code === '23505')) {
      return PartnerCommission.findOne({ where: { paymentId } });
    }
    throw error;
  }
};

const listCommissionsForTenant = async (tenantId, { status, marketerId, month, year, remittanceStatus } = {}) => {
  const where = { tenantId };
  if (status) where.status = status;
  if (marketerId) where.marketerId = marketerId;
  if (remittanceStatus) where.remittanceStatus = remittanceStatus;

  if (month && year) {
    const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const end = new Date(Date.UTC(Number(year), Number(month), 1));
    where.createdAt = { [Op.gte]: start, [Op.lt]: end };
  }

  return PartnerCommission.findAll({
    where,
    include: [
      { association: 'marketer', attributes: ['id', 'name', 'email', 'phone', 'momoNumber', 'bankDetails'] },
      { association: 'customer', attributes: ['id', 'name', 'phone'] },
      { association: 'partnership', attributes: ['id', 'referralCode'] },
    ],
    order: [['createdAt', 'DESC']],
  });
};

const listCommissionsForMarketer = async (marketerId, { status } = {}) => {
  const where = { marketerId };
  if (status) where.status = status;
  return PartnerCommission.findAll({
    where,
    include: [
      { association: 'partnership', attributes: ['id', 'referralCode', 'tenantId'] },
      { association: 'tenant', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
  });
};

const markCommissionsPaid = async ({
  tenantId,
  commissionIds = [],
  paidBy = null,
  paidNote = null,
}) => {
  const ids = (commissionIds || []).filter(Boolean);
  if (!ids.length) {
    const err = new Error('Select at least one commission to mark paid.');
    err.statusCode = 400;
    throw err;
  }

  const [count] = await PartnerCommission.update(
    {
      status: 'paid',
      paidAt: new Date(),
      paidBy,
      paidNote: paidNote ? String(paidNote).trim() : null,
    },
    {
      where: {
        tenantId,
        id: { [Op.in]: ids },
        status: 'due',
      },
    }
  );

  return {
    updated: count,
    commissions: await PartnerCommission.findAll({
      where: { tenantId, id: { [Op.in]: ids } },
    }),
  };
};

module.exports = {
  maybeCreateCommissionForPayment,
  listCommissionsForTenant,
  listCommissionsForMarketer,
  markCommissionsPaid,
  resolveAttribution,
  resolveRate,
  splitCommission,
};
