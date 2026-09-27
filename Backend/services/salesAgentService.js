const { validateCommissionPercent, getCommissionPercent, calculatePercentageCommission } = require('../utils/salesAgentCommissionRate');
const crypto = require('crypto');
const dayjs = require('dayjs');
const { Op } = require('sequelize');
const {
  SalesAgent,
  SalesAgentCode,
  SalesAgentCommission,
  Tenant,
  SubscriptionPayment,
  Setting,
} = require('../models');

const AGENT_FREE_MONTHS = 3;
const MAX_COMMISSIONS_PER_TENANT = 3;
const DEFAULT_COMMISSION_PESEWAS = Number(process.env.SALES_AGENT_DEFAULT_COMMISSION_PESEWAS) || 5000;
const AGENT_STATUSES = new Set(['pending', 'active', 'disabled']);
const CODE_STATUSES = new Set(['active', 'disabled']);
const COMMISSION_STATUSES = new Set(['due', 'paid']);

/**
 * Normalize a sales agent referral code for lookup/storage.
 * @param {unknown} raw
 * @returns {string|null}
 */
function normalizeAgentCode(raw) {
  if (raw == null) return null;
  const code = String(raw).trim().toUpperCase();
  if (!code) return null;
  if (code.length < 3 || code.length > 64) return null;
  if (!/^[A-Z0-9_-]+$/.test(code)) return null;
  return code;
}

/**
 * Generate a unique agent code (e.g. SA-AB12CD).
 * @returns {string}
 */
function generateAgentCodeValue() {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SA-${suffix}`;
}

/**
 * Resolve an active agent code to agent + code rows.
 * @param {string} rawCode
 * @returns {Promise<{ agent: object, codeRow: object }|null>}
 */
async function resolveActiveAgentCode(rawCode) {
  const code = normalizeAgentCode(rawCode);
  if (!code) return null;

  const codeRow = await SalesAgentCode.findOne({
    where: {
      code: { [Op.iLike]: code },
      status: 'active',
    },
    include: [
      {
        model: SalesAgent,
        as: 'agent',
        required: true,
        where: { status: 'active' },
      },
    ],
  });

  if (!codeRow || !codeRow.agent) return null;
  return { agent: codeRow.agent, codeRow };
}

/**
 * Validate a code for public/signup UX.
 * @param {string} rawCode
 * @returns {Promise<{ valid: boolean, code?: string, agentName?: string, freeMonths?: number, error?: string, errorCode?: string }>}
 */
async function validateAgentCode(rawCode) {
  const code = normalizeAgentCode(rawCode);
  if (!code) {
    return {
      valid: false,
      error: 'Enter a valid sales agent code',
      errorCode: 'INVALID_AGENT_CODE',
    };
  }

  const resolved = await resolveActiveAgentCode(code);
  if (!resolved) {
    return {
      valid: false,
      error: 'This sales agent code is invalid or inactive',
      errorCode: 'AGENT_CODE_NOT_FOUND',
    };
  }

  return {
    valid: true,
    code: resolved.codeRow.code,
    agentName: resolved.agent.name,
    freeMonths: AGENT_FREE_MONTHS,
  };
}

/**
 * Compute the 3-month free-window end date from a base time.
 * @param {Date|string|number} [from=new Date()]
 * @returns {Date}
 */
function computeAgentFreeTrialEndsAt(from = new Date()) {
  return dayjs(from).add(AGENT_FREE_MONTHS, 'month').toDate();
}

/**
 * Apply an active agent code to a tenant: attribution + 3 months free (trialEndsAt).
 * Idempotent if the tenant is already attributed to the same agent.
 *
 * @param {object} params
 * @param {object} params.tenant - Sequelize Tenant instance (should include optional columns scope if needed)
 * @param {string} params.rawCode
 * @param {object} [params.transaction]
 * @param {boolean} [params.requireCode=false] - if true and code missing/invalid, throw
 * @returns {Promise<{ applied: boolean, agent?: object, codeRow?: object, trialEndsAt?: Date, skippedReason?: string }>}
 */
async function applyAgentCodeToTenant({ tenant, rawCode, transaction, requireCode = false }) {
  const code = normalizeAgentCode(rawCode);
  if (!code) {
    if (requireCode) {
      throw Object.assign(new Error('A valid sales agent code is required'), {
        statusCode: 400,
        errorCode: 'INVALID_AGENT_CODE',
      });
    }
    return { applied: false, skippedReason: 'missing_code' };
  }

  if (tenant.referredByAgentId) {
    if (normalizeAgentCode(tenant.referredByAgentCode) === code) {
      return {
        applied: false,
        skippedReason: 'already_attributed',
        agent: { id: tenant.referredByAgentId },
        trialEndsAt: tenant.trialEndsAt,
      };
    }
    throw Object.assign(new Error('This business is already linked to a sales agent'), {
      statusCode: 400,
      errorCode: 'ALREADY_ATTRIBUTED',
    });
  }

  const resolved = await resolveActiveAgentCode(code);
  if (!resolved) {
    throw Object.assign(new Error('This sales agent code is invalid or inactive'), {
      statusCode: 400,
      errorCode: 'AGENT_CODE_NOT_FOUND',
    });
  }

  // Never shorten an existing access window (e.g. mobile free_plan = 12 months vs agent = 3).
  const agentEndsAt = computeAgentFreeTrialEndsAt();
  const existingEndsAt = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : null;
  const trialEndsAt =
    existingEndsAt && !Number.isNaN(existingEndsAt.getTime()) && existingEndsAt > agentEndsAt
      ? existingEndsAt
      : agentEndsAt;
  const metadata = {
    ...(tenant.metadata || {}),
    salesAgentAttribution: {
      agentId: resolved.agent.id,
      code: resolved.codeRow.code,
      codeId: resolved.codeRow.id,
      freeMonths: AGENT_FREE_MONTHS,
      appliedAt: new Date().toISOString(),
    },
  };

  await tenant.update(
    {
      referredByAgentId: resolved.agent.id,
      referredByAgentCode: resolved.codeRow.code,
      agentAttributedAt: new Date(),
      trialEndsAt,
      plan: tenant.plan === 'trial' || !tenant.plan ? 'trial' : tenant.plan,
      metadata,
    },
    { transaction }
  );

  // Keep subscription setting in sync when present
  const setting = await Setting.findOne({
    where: { tenantId: tenant.id, key: 'subscription' },
    transaction,
  });
  if (setting) {
    const planId = String(setting.value?.plan || tenant.plan || '').toLowerCase();
    const value = {
      ...(setting.value || {}),
      plan: valuePlanOrTrial(setting.value?.plan || tenant.plan),
      // Keep free_plan complimentary as active; do not force trialing.
      status:
        setting.value?.status === 'active' || planId === 'free_plan'
          ? 'active'
          : 'trialing',
      trialEndsAt,
      salesAgentFreeMonths: AGENT_FREE_MONTHS,
    };
    await setting.update({ value }, { transaction });
  }

  return {
    applied: true,
    agent: resolved.agent,
    codeRow: resolved.codeRow,
    trialEndsAt,
  };
}

function valuePlanOrTrial(plan) {
  return plan && String(plan).trim() ? String(plan).trim().toLowerCase() : 'trial';
}

/**
 * After a successful paid subscription payment, create at most one commission
 * (capped at 3 total per tenant-agent pair). Skips free/trial months and zero/negative amounts.
 *
 * Hook assumption: called from `recordSubscriptionPaymentAndActivate` whenever
 * a subscription payment is recorded with status `success` (manual admin record
 * or Paystack apply path). Free months are not billed, so they never create payments.
 *
 * @param {object} payment - SubscriptionPayment instance
 * @param {object} [options]
 * @param {object} [options.transaction]
 * @returns {Promise<{ created: boolean, commission?: object, skippedReason?: string }>}
 */
async function maybeCreateCommissionForSuccessfulPayment(payment, options = {}) {
  const { transaction } = options;
  if (!payment || payment.status !== 'success') {
    return { created: false, skippedReason: 'not_successful' };
  }

  const amount = Number(payment.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { created: false, skippedReason: 'non_paid_amount' };
  }

  const tenant = await Tenant.scope('withOptionalColumns').findByPk(payment.tenantId, {
    attributes: ['id', 'referredByAgentId', 'referredByAgentCode', 'metadata'],
    transaction,
  });
  if (!tenant?.referredByAgentId) {
    return { created: false, skippedReason: 'not_attributed' };
  }

  const agent = await SalesAgent.findByPk(tenant.referredByAgentId, { transaction });
  if (!agent || agent.status === 'disabled') {
    return { created: false, skippedReason: 'agent_inactive' };
  }

  if (payment.id) {
    const existingForPayment = await SalesAgentCommission.findOne({
      where: { subscriptionPaymentId: payment.id },
      transaction,
    });
    if (existingForPayment) {
      return { created: false, commission: existingForPayment, skippedReason: 'already_recorded' };
    }
  }

  const existingCount = await SalesAgentCommission.count({
    where: {
      salesAgentId: tenant.referredByAgentId,
      tenantId: tenant.id,
    },
    transaction,
  });

  if (existingCount >= MAX_COMMISSIONS_PER_TENANT) {
    return { created: false, skippedReason: 'cap_reached' };
  }

  const periodNumber = existingCount + 1;
  const commissionPercent = getCommissionPercent(agent);
  // Preserve existing agreements until an administrator explicitly sets a percentage.
  const commissionAmount = commissionPercent !== null
    ? calculatePercentageCommission(amount, commissionPercent)
    : (Number.isFinite(Number(agent.commissionAmount)) ? Math.max(0, Number(agent.commissionAmount)) : DEFAULT_COMMISSION_PESEWAS);
  if (commissionAmount <= 0) return { created: false, skippedReason: 'zero_commission' };


  try {
    const commission = await SalesAgentCommission.create(
      {
        salesAgentId: tenant.referredByAgentId,
        tenantId: tenant.id,
        subscriptionPaymentId: payment.id || null,
        periodNumber,
        amount: commissionAmount,
        currency: payment.currency || 'GHS',
        status: 'due',
        metadata: {
          source: 'subscription_payment',
          commissionType: commissionPercent === null ? 'fixed' : 'percentage',
          commissionPercent,
          paymentAmount: amount,
          paymentPlan: payment.plan,
          billingPeriod: payment.billingPeriod,
          provider: payment.provider,
          providerReference: payment.providerReference || null,
          attributionCode: tenant.referredByAgentCode || null,
        },
      },
      { transaction }
    );
    return { created: true, commission };
  } catch (err) {
    // Unique constraint races → treat as already recorded
    if (err?.name === 'SequelizeUniqueConstraintError') {
      const existing = await SalesAgentCommission.findOne({
        where: payment.id
          ? { subscriptionPaymentId: payment.id }
          : {
              salesAgentId: tenant.referredByAgentId,
              tenantId: tenant.id,
              periodNumber,
            },
        transaction,
      });
      return { created: false, commission: existing || undefined, skippedReason: 'already_recorded' };
    }
    throw err;
  }
}

/**
 * Create a sales agent (admin). Optionally create an initial code.
 * @param {object} payload
 * @param {object} [options]
 * @param {string} [options.approvedBy]
 */
async function createSalesAgent(payload = {}, options = {}) {
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name || name.length < 2) {
    throw Object.assign(new Error('Agent name is required'), { statusCode: 400, errorCode: 'VALIDATION_ERROR' });
  }

  const status = AGENT_STATUSES.has(payload.status) ? payload.status : 'pending';
  const commissionPercent = payload.commissionPercent == null && status === 'pending'
    ? null : validateCommissionPercent(payload.commissionPercent);
  const commissionAmount =
    payload.commissionAmount != null && Number(payload.commissionAmount) >= 0
      ? Math.round(Number(payload.commissionAmount))
      : DEFAULT_COMMISSION_PESEWAS;

  const agent = await SalesAgent.create({
    name,
    email: payload.email ? String(payload.email).trim().toLowerCase() : null,
    phone: payload.phone ? String(payload.phone).trim() : null,
    status,
    commissionAmount,
    notes: payload.notes ? String(payload.notes).trim() : null,
    leadId: payload.leadId || null,
    approvedAt: status === 'active' ? new Date() : null,
    approvedBy: status === 'active' ? options.approvedBy || null : null,
    metadata: { ...(payload.metadata || {}), ...(commissionPercent !== null ? { commissionPercent } : {}) },
  });

  let codeRow = null;
  if (payload.createCode !== false && status === 'active') {
    codeRow = await createAgentCode(agent.id, {
      code: payload.code,
      label: payload.codeLabel || 'Primary',
    });
  }

  return { agent, code: codeRow };
}

/**
 * @param {string} agentId
 * @param {object} patch
 * @param {object} [options]
 */
async function updateSalesAgent(agentId, patch = {}, options = {}) {
  const agent = await SalesAgent.findByPk(agentId);
  if (!agent) {
    throw Object.assign(new Error('Sales agent not found'), { statusCode: 404, errorCode: 'NOT_FOUND' });
  }

  const updates = {};
  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (name.length < 2) {
      throw Object.assign(new Error('Agent name is required'), { statusCode: 400, errorCode: 'VALIDATION_ERROR' });
    }
    updates.name = name;
  }
  if (patch.email !== undefined) {
    updates.email = patch.email ? String(patch.email).trim().toLowerCase() : null;
  }
  if (patch.phone !== undefined) {
    updates.phone = patch.phone ? String(patch.phone).trim() : null;
  }
  if (patch.notes !== undefined) {
    updates.notes = patch.notes ? String(patch.notes).trim() : null;
  }
  if (patch.commissionPercent !== undefined) {
    updates.metadata = { ...(agent.metadata || {}), commissionPercent: validateCommissionPercent(patch.commissionPercent) };
  }
  if (patch.commissionAmount != null) {
    const amount = Math.round(Number(patch.commissionAmount));
    if (!Number.isFinite(amount) || amount < 0) {
      throw Object.assign(new Error('Invalid commission amount'), { statusCode: 400, errorCode: 'VALIDATION_ERROR' });
    }
    updates.commissionAmount = amount;
  }
  if (patch.status != null) {
    if (!AGENT_STATUSES.has(patch.status)) {
      throw Object.assign(new Error('Invalid agent status'), { statusCode: 400, errorCode: 'VALIDATION_ERROR' });
    }
    updates.status = patch.status;
    if (patch.status === 'active' && agent.status !== 'active') {
      updates.approvedAt = new Date();
      updates.approvedBy = options.approvedBy || agent.approvedBy || null;
    }
  }

  await agent.update(updates);
  return agent;
}

/**
 * @param {string} salesAgentId
 * @param {object} [payload]
 */
async function createAgentCode(salesAgentId, payload = {}) {
  const agent = await SalesAgent.findByPk(salesAgentId);
  if (!agent) {
    throw Object.assign(new Error('Sales agent not found'), { statusCode: 404, errorCode: 'NOT_FOUND' });
  }

  let code = normalizeAgentCode(payload.code);
  if (!code) {
    for (let i = 0; i < 5; i += 1) {
      code = generateAgentCodeValue();
      // eslint-disable-next-line no-await-in-loop
      const clash = await SalesAgentCode.findOne({ where: { code: { [Op.iLike]: code } } });
      if (!clash) break;
      code = null;
    }
    if (!code) {
      throw Object.assign(new Error('Could not generate a unique agent code'), {
        statusCode: 500,
        errorCode: 'CODE_GENERATION_FAILED',
      });
    }
  } else {
    const clash = await SalesAgentCode.findOne({ where: { code: { [Op.iLike]: code } } });
    if (clash) {
      throw Object.assign(new Error('This agent code is already in use'), {
        statusCode: 409,
        errorCode: 'CODE_EXISTS',
      });
    }
  }

  return SalesAgentCode.create({
    salesAgentId,
    code,
    status: CODE_STATUSES.has(payload.status) ? payload.status : 'active',
    label: payload.label ? String(payload.label).trim() : null,
    metadata: payload.metadata || {},
  });
}

/**
 * @param {string} codeId
 * @param {'active'|'disabled'} status
 */
async function setAgentCodeStatus(codeId, status) {
  if (!CODE_STATUSES.has(status)) {
    throw Object.assign(new Error('Invalid code status'), { statusCode: 400, errorCode: 'VALIDATION_ERROR' });
  }
  const codeRow = await SalesAgentCode.findByPk(codeId);
  if (!codeRow) {
    throw Object.assign(new Error('Agent code not found'), { statusCode: 404, errorCode: 'NOT_FOUND' });
  }
  await codeRow.update({ status });
  return codeRow;
}

/**
 * @param {string} commissionId
 * @param {'due'|'paid'} status
 * @param {object} [options]
 */
async function setCommissionStatus(commissionId, status, options = {}) {
  if (!COMMISSION_STATUSES.has(status)) {
    throw Object.assign(new Error('Invalid commission status'), { statusCode: 400, errorCode: 'VALIDATION_ERROR' });
  }
  const commission = await SalesAgentCommission.findByPk(commissionId);
  if (!commission) {
    throw Object.assign(new Error('Commission not found'), { statusCode: 404, errorCode: 'NOT_FOUND' });
  }

  const updates = { status };
  if (status === 'paid') {
    updates.paidAt = new Date();
    updates.paidBy = options.paidBy || null;
  } else {
    updates.paidAt = null;
    updates.paidBy = null;
  }
  if (options.notes !== undefined) {
    updates.notes = options.notes ? String(options.notes).trim() : null;
  }

  await commission.update(updates);
  return commission;
}

/**
 * List agents with optional filters and aggregate stats.
 * @param {object} [query]
 */
async function listSalesAgents(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const where = {};

  if (query.status && AGENT_STATUSES.has(query.status)) {
    where.status = query.status;
  }
  if (query.search) {
    const q = String(query.search).trim();
    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } },
        { phone: { [Op.iLike]: `%${q}%` } },
      ];
    }
  }

  const { rows, count } = await SalesAgent.findAndCountAll({
    where,
    include: [
      {
        model: SalesAgentCode,
        as: 'codes',
        required: false,
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  const agentIds = rows.map((r) => r.id);
  const commissionStats = {};
  const attributionCounts = {};

  if (agentIds.length) {
    const commissions = await SalesAgentCommission.findAll({
      where: { salesAgentId: { [Op.in]: agentIds } },
      attributes: ['salesAgentId', 'status', 'amount'],
    });
    for (const c of commissions) {
      const bucket = commissionStats[c.salesAgentId] || {
        dueCount: 0,
        paidCount: 0,
        dueAmount: 0,
        paidAmount: 0,
        totalCount: 0,
      };
      bucket.totalCount += 1;
      if (c.status === 'paid') {
        bucket.paidCount += 1;
        bucket.paidAmount += Number(c.amount) || 0;
      } else {
        bucket.dueCount += 1;
        bucket.dueAmount += Number(c.amount) || 0;
      }
      commissionStats[c.salesAgentId] = bucket;
    }

    const attributed = await Tenant.findAll({
      where: { referredByAgentId: { [Op.in]: agentIds } },
      attributes: ['referredByAgentId'],
    });
    for (const t of attributed) {
      attributionCounts[t.referredByAgentId] = (attributionCounts[t.referredByAgentId] || 0) + 1;
    }
  }

  const data = rows.map((row) => {
    const json = row.toJSON();
    return {
      ...json,
      stats: {
        attributedTenants: attributionCounts[row.id] || 0,
        commissions: commissionStats[row.id] || {
          dueCount: 0,
          paidCount: 0,
          dueAmount: 0,
          paidAmount: 0,
          totalCount: 0,
        },
      },
    };
  });

  return { data, count, page, limit };
}

/**
 * @param {string} agentId
 */
async function getSalesAgentDetail(agentId) {
  const agent = await SalesAgent.findByPk(agentId, {
    include: [{ model: SalesAgentCode, as: 'codes' }],
  });
  if (!agent) {
    throw Object.assign(new Error('Sales agent not found'), { statusCode: 404, errorCode: 'NOT_FOUND' });
  }

  const tenants = await Tenant.scope('withOptionalColumns').findAll({
    where: { referredByAgentId: agentId },
    attributes: [
      'id',
      'name',
      'slug',
      'plan',
      'status',
      'trialEndsAt',
      'referredByAgentCode',
      'agentAttributedAt',
      'createdAt',
    ],
    order: [['agentAttributedAt', 'DESC']],
    limit: 200,
  });

  const commissions = await SalesAgentCommission.findAll({
    where: { salesAgentId: agentId },
    include: [
      {
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name', 'slug'],
      },
      {
        model: SubscriptionPayment,
        as: 'subscriptionPayment',
        attributes: ['id', 'plan', 'billingPeriod', 'amount', 'currency', 'provider', 'providerReference', 'createdAt'],
        required: false,
      },
    ],
    order: [['createdAt', 'DESC']],
    limit: 500,
  });

  return { agent, tenants, commissions };
}

module.exports = {
  AGENT_FREE_MONTHS,
  MAX_COMMISSIONS_PER_TENANT,
  DEFAULT_COMMISSION_PESEWAS,
  normalizeAgentCode,
  generateAgentCodeValue,
  resolveActiveAgentCode,
  validateAgentCode,
  computeAgentFreeTrialEndsAt,
  applyAgentCodeToTenant,
  maybeCreateCommissionForSuccessfulPayment,
  createSalesAgent,
  updateSalesAgent,
  createAgentCode,
  setAgentCodeStatus,
  setCommissionStatus,
  listSalesAgents,
  getSalesAgentDetail,
};
