const { Op } = require('sequelize');
const {
  PartnerReferral,
  Partnership,
  Customer,
  Job,
  PartnerProgramSettings,
  Tenant,
} = require('../models');
const { normalizePhoneForLookup } = require('../utils/customerUniquenessUtils');

const normalizeEmail = (email) => {
  const value = String(email || '').trim().toLowerCase();
  return value || null;
};

const normalizePhone = (phone) => normalizePhoneForLookup(phone);

/**
 * Find a customer in tenant by normalized email or phone.
 * @param {string} tenantId
 * @param {{ emailNormalized?: string|null, phoneNormalized?: string|null }} identity
 */
const findMatchingCustomer = async (tenantId, { emailNormalized, phoneNormalized }) => {
  const or = [];
  if (emailNormalized) {
    or.push({ email: { [Op.iLike]: emailNormalized } });
  }
  if (phoneNormalized) {
    or.push({ phone: phoneNormalized });
    // Also try raw variants stored without E.164
    const digits = phoneNormalized.replace(/\D/g, '');
    if (digits.length >= 9) {
      or.push({ phone: { [Op.like]: `%${digits.slice(-9)}` } });
    }
  }
  if (!or.length) return null;

  return Customer.findOne({
    where: { tenantId, [Op.or]: or },
    order: [['createdAt', 'ASC']],
  });
};

/**
 * Apply first-touch attribution from a referral to a customer.
 * @returns {'matched'|'conflict'}
 */
const attributeCustomerFromReferral = async (referral, customer, matchedBy) => {
  const alreadyAttributed =
    customer.partnershipId && customer.partnerMarketerId
    && (customer.partnershipId !== referral.partnershipId
      || customer.partnerMarketerId !== referral.marketerId);

  if (alreadyAttributed) {
    await referral.update({
      status: 'conflict',
      customerId: customer.id,
      matchedAt: new Date(),
      matchedBy,
      metadata: {
        ...(referral.metadata || {}),
        conflictReason: 'customer_already_attributed',
        existingPartnershipId: customer.partnershipId,
        existingMarketerId: customer.partnerMarketerId,
      },
    });
    return 'conflict';
  }

  if (!customer.partnershipId || !customer.partnerMarketerId) {
    await customer.update({
      partnershipId: referral.partnershipId,
      partnerMarketerId: referral.marketerId,
      howDidYouHear: customer.howDidYouHear || 'Sabito Partner',
      referralName: customer.referralName || referral.clientName,
    });
  }

  await referral.update({
    status: 'matched',
    customerId: customer.id,
    matchedAt: new Date(),
    matchedBy,
  });
  return 'matched';
};

/**
 * Try to match a referral to an existing customer.
 */
const tryMatchReferral = async (referral, matchedBy = 'create') => {
  if (!referral || ['matched', 'closed'].includes(referral.status)) {
    return referral;
  }

  const customer = await findMatchingCustomer(referral.tenantId, {
    emailNormalized: referral.emailNormalized,
    phoneNormalized: referral.phoneNormalized,
  });
  if (!customer) return referral;

  await attributeCustomerFromReferral(referral, customer, matchedBy);
  await referral.reload();
  return referral;
};

/**
 * When a customer is created/updated, attach pending referrals that match.
 */
const matchPendingReferralsForCustomer = async (customer) => {
  if (!customer?.tenantId || (!customer.email && !customer.phone)) return [];

  const emailNormalized = normalizeEmail(customer.email);
  const phoneNormalized = normalizePhone(customer.phone);
  if (!emailNormalized && !phoneNormalized) return [];

  const or = [];
  if (emailNormalized) or.push({ emailNormalized });
  if (phoneNormalized) or.push({ phoneNormalized });

  const pending = await PartnerReferral.findAll({
    where: {
      tenantId: customer.tenantId,
      status: 'pending',
      [Op.or]: or,
    },
    order: [['createdAt', 'ASC']],
  });

  const results = [];
  for (const referral of pending) {
    const outcome = await attributeCustomerFromReferral(referral, customer, 'customer_upsert');
    results.push({ referralId: referral.id, outcome });
    // First matching pending referral that successfully attributes wins; others may conflict
    if (outcome === 'matched') {
      await customer.reload();
    }
  }
  return results;
};

/**
 * Create a marketer referral and attempt immediate match.
 */
const createReferral = async ({
  marketerId,
  partnershipId,
  clientName,
  clientEmail,
  clientPhone,
  location = null,
  note = null,
}) => {
  const name = String(clientName || '').trim();
  const emailNormalized = normalizeEmail(clientEmail);
  const phoneNormalized = normalizePhone(clientPhone);
  const email = clientEmail ? String(clientEmail).trim() : null;
  const phone = clientPhone ? String(clientPhone).trim() : null;

  if (!name || name.length < 2) {
    const err = new Error('Client name is required.');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    throw err;
  }
  if (!emailNormalized && !phoneNormalized) {
    const err = new Error('Client email or phone is required.');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    throw err;
  }

  const partnership = await Partnership.findOne({
    where: { id: partnershipId, marketerId, status: 'active' },
  });
  if (!partnership) {
    const err = new Error('You must have an active partnership with this business.');
    err.statusCode = 403;
    err.errorCode = 'PARTNERSHIP_REQUIRED';
    throw err;
  }

  const duplicateWhere = {
    marketerId,
    tenantId: partnership.tenantId,
    status: { [Op.in]: ['pending', 'matched', 'conflict'] },
    [Op.or]: [
      ...(emailNormalized ? [{ emailNormalized }] : []),
      ...(phoneNormalized ? [{ phoneNormalized }] : []),
    ],
  };

  const duplicate = await PartnerReferral.findOne({ where: duplicateWhere });
  if (duplicate) {
    const err = new Error('You already have a referral with this email or phone for this business.');
    err.statusCode = 409;
    err.errorCode = 'REFERRAL_DUPLICATE';
    throw err;
  }

  let referral;
  try {
    referral = await PartnerReferral.create({
      tenantId: partnership.tenantId,
      marketerId,
      partnershipId: partnership.id,
      clientName: name.slice(0, 160),
      email,
      phone,
      emailNormalized,
      phoneNormalized,
      location: location ? String(location).trim().slice(0, 160) : null,
      note: note ? String(note).trim() : null,
      status: 'pending',
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError' || error.code === '23505') {
      const err = new Error('You already have a referral with this email or phone for this business.');
      err.statusCode = 409;
      err.errorCode = 'REFERRAL_DUPLICATE';
      throw err;
    }
    throw error;
  }

  return tryMatchReferral(referral, 'create');
};

const listReferralsForMarketer = async (marketerId) =>
  PartnerReferral.findAll({
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
            attributes: ['slug', 'displayName', 'logoUrl'],
          },
        ],
      },
      { association: 'partnership', attributes: ['id', 'referralCode', 'status'] },
      { association: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
    ],
    order: [['createdAt', 'DESC']],
  });

const getReferralForMarketer = async (marketerId, referralId) => {
  const referral = await PartnerReferral.findOne({
    where: { id: referralId, marketerId },
    include: [
      { association: 'tenant', attributes: ['id', 'name'] },
      { association: 'partnership', attributes: ['id', 'referralCode', 'status'] },
      { association: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
    ],
  });

  if (!referral) return null;
  const result = referral.toJSON();
  result.jobs = [];
  if (referral.status === 'matched' && referral.customerId && referral.matchedAt) {
    result.jobs = await Job.findAll({
      where: {
        tenantId: referral.tenantId, customerId: referral.customerId,
        [Op.or]: [
          { partnershipId: referral.partnershipId, partnerMarketerId: marketerId },
          { partnershipId: null, partnerMarketerId: null, createdAt: { [Op.gte]: referral.matchedAt } },
        ],
      },
      attributes: ['id', 'jobNumber', 'title', 'status', 'dueDate', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']],
    });
  }
  return result;
};

const listReferralsForTenant = async (tenantId, { status } = {}) => {
  const where = { tenantId };
  if (status) where.status = status;
  return PartnerReferral.findAll({
    where,
    include: [
      { association: 'marketer', attributes: ['id', 'name', 'email', 'phone', 'momoNumber'] },
      { association: 'partnership', attributes: ['id', 'referralCode'] },
      { association: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
    ],
    order: [['createdAt', 'DESC']],
  });
};

module.exports = {
  normalizeEmail,
  normalizePhone,
  findMatchingCustomer,
  createReferral,
  tryMatchReferral,
  matchPendingReferralsForCustomer,
  listReferralsForMarketer,
  getReferralForMarketer,
  listReferralsForTenant,
};
