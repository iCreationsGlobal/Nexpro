const { Op } = require('sequelize');
const { Tenant, Setting, SubscriptionPayment, TenantAccessAudit } = require('../models');
const { normalizeTenantInstanceForRequest } = require('../utils/tenantClassification');
const { getFallbackAmountPesewas } = require('../config/paystackPlans');
const {
  getTrialEndDate,
  buildTrialSubscriptionSettingValue,
} = require('../utils/subscriptionDefaults');

const PAID_PLANS = new Set(['starter', 'professional', 'enterprise']);
const PAYMENT_STATUSES = new Set(['success', 'pending', 'failed', 'refunded']);
const DEFAULT_GRACE_DAYS = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 7);

const normalizePlan = (plan = '') => String(plan || '').trim().toLowerCase();
const normalizeBillingPeriod = (value = '') =>
  String(value).trim().toLowerCase() === 'yearly' ? 'yearly' : 'monthly';
const normalizePaymentStatus = (value = '') => {
  const status = String(value || '').trim().toLowerCase();
  return PAYMENT_STATUSES.has(status) ? status : 'success';
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const addPeriod = (fromDate, billingPeriod) => {
  const dt = new Date(fromDate);
  if (billingPeriod === 'yearly') dt.setFullYear(dt.getFullYear() + 1);
  else dt.setMonth(dt.getMonth() + 1);
  return dt;
};

const daysBetween = (from, to) => {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
};

/**
 * @param {string} tenantId
 */
async function getSubscriptionSetting(tenantId) {
  const row = await Setting.findOne({ where: { tenantId, key: 'subscription' } });
  return row?.value || {};
}

/**
 * Latest successful payment that covers `at` (default now).
 * @param {string} tenantId
 * @param {Date} [at]
 */
async function getActivePaymentForTenant(tenantId, at = new Date()) {
  return SubscriptionPayment.findOne({
    where: {
      tenantId,
      status: 'success',
      periodStart: { [Op.lte]: at },
      periodEnd: { [Op.gt]: at },
    },
    order: [['periodEnd', 'DESC']],
  });
}

/**
 * @param {import('../models').Tenant|string} tenantOrId
 * @param {{ at?: Date, subscriptionSetting?: object }} [options]
 */
async function resolveBillingStatus(tenantOrId, options = {}) {
  const at = options.at || new Date();
  let tenant =
    typeof tenantOrId === 'string'
      ? await Tenant.scope('withOptionalColumns').findByPk(tenantOrId)
      : tenantOrId;
  if (tenant && typeof tenantOrId === 'object' && !tenant.id) {
    const pk = tenant.get?.('id') ?? tenant.dataValues?.id;
    if (pk) {
      tenant.id = pk;
    } else {
      tenant = null;
    }
  }
  if (!tenant) {
    return {
      billingStatus: 'unknown',
      lockReason: 'tenant_not_found',
      canAccessApp: false,
      trialEndsAt: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
      daysRemaining: 0,
      plan: 'trial',
      activePayment: null,
    };
  }

  tenant = normalizeTenantInstanceForRequest(tenant);
  const subscription = options.subscriptionSetting || (await getSubscriptionSetting(tenant.id));
  const entitlements = tenant.metadata?.entitlements || {};
  const accessState = entitlements.accessState || (tenant.status === 'paused' ? 'restricted' : 'active');

  if (accessState === 'suspended' || tenant.status === 'suspended') {
    return {
      billingStatus: 'suspended',
      lockReason: 'platform_suspended',
      canAccessApp: false,
      trialEndsAt: tenant.trialEndsAt || subscription.trialEndsAt || null,
      currentPeriodEnd: subscription.currentPeriodEnd || null,
      graceEndsAt: null,
      daysRemaining: 0,
      plan: normalizePlan(tenant.plan) || 'trial',
      activePayment: null,
    };
  }

  if (entitlements.billingOverride === 'unlocked') {
    return {
      billingStatus: 'manual_override',
      lockReason: null,
      canAccessApp: true,
      trialEndsAt: tenant.trialEndsAt || subscription.trialEndsAt || null,
      currentPeriodEnd: subscription.currentPeriodEnd || null,
      graceEndsAt: null,
      daysRemaining: null,
      plan: normalizePlan(tenant.plan) || 'trial',
      activePayment: null,
    };
  }

  const activePayment = await getActivePaymentForTenant(tenant.id, at);
  const trialEndsAt = tenant.trialEndsAt
    ? new Date(tenant.trialEndsAt)
    : subscription.trialEndsAt
      ? new Date(subscription.trialEndsAt)
      : null;
  const plan = normalizePlan(tenant.plan) || normalizePlan(subscription.plan) || 'trial';
  const currentPeriodEnd = activePayment
    ? new Date(activePayment.periodEnd)
    : subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd)
      : null;

  if (activePayment && PAID_PLANS.has(normalizePlan(activePayment.plan))) {
    const daysRemaining = daysBetween(at, activePayment.periodEnd);
    return {
      billingStatus: 'active',
      lockReason: null,
      canAccessApp: true,
      trialEndsAt,
      currentPeriodEnd,
      graceEndsAt: null,
      daysRemaining: Math.max(0, daysRemaining),
      plan: normalizePlan(activePayment.plan),
      activePayment,
    };
  }

  // Enterprise is contract / platform-managed — not gated on self-serve Paystack ledger rows.
  if (plan === 'enterprise') {
    if (entitlements.billingOverride === 'locked') {
      return {
        billingStatus: 'locked',
        lockReason: 'platform_locked',
        canAccessApp: false,
        trialEndsAt,
        currentPeriodEnd,
        graceEndsAt: null,
        daysRemaining: 0,
        plan: 'enterprise',
        activePayment: null,
      };
    }
    return {
      billingStatus: 'active',
      lockReason: null,
      canAccessApp: true,
      trialEndsAt,
      currentPeriodEnd,
      graceEndsAt: null,
      daysRemaining: null,
      plan: 'enterprise',
      activePayment: null,
    };
  }

  // Product trial. Unknown non-paid plans follow the same trial gating.
  const isTrialPlan = plan === 'trial' || plan === 'free' || !PAID_PLANS.has(plan);
  if (isTrialPlan && !trialEndsAt) {
    return {
      billingStatus: 'trialing',
      lockReason: null,
      canAccessApp: true,
      trialEndsAt: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
      daysRemaining: null,
      plan: 'trial',
      activePayment: null,
    };
  }
  if (isTrialPlan && trialEndsAt && at < trialEndsAt) {
    return {
      billingStatus: 'trialing',
      lockReason: null,
      canAccessApp: true,
      trialEndsAt,
      currentPeriodEnd: null,
      graceEndsAt: null,
      daysRemaining: daysBetween(at, trialEndsAt),
      plan: 'trial',
      activePayment: null,
    };
  }

  const graceDays =
    Number(entitlements.billingGraceDays) > 0
      ? Number(entitlements.billingGraceDays)
      : DEFAULT_GRACE_DAYS;
  const periodEndForGrace = trialEndsAt || currentPeriodEnd;
  const graceEndsAt = periodEndForGrace ? addDays(periodEndForGrace, graceDays) : addDays(at, graceDays);
  const trialExpired = trialEndsAt && at >= trialEndsAt;

  if (periodEndForGrace && at < graceEndsAt) {
    return {
      billingStatus: 'grace',
      lockReason: trialExpired ? 'trial_expired' : 'subscription_expired',
      canAccessApp: true,
      trialEndsAt,
      currentPeriodEnd,
      graceEndsAt,
      daysRemaining: daysBetween(at, graceEndsAt),
      plan,
      activePayment: null,
    };
  }

  return {
    billingStatus: 'locked',
    lockReason: trialExpired ? 'trial_expired' : 'payment_required',
    canAccessApp: false,
    trialEndsAt,
    currentPeriodEnd,
    graceEndsAt,
    daysRemaining: 0,
    plan,
    activePayment: null,
  };
}

/**
 * Record payment and activate tenant (idempotent on providerReference).
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.plan
 * @param {string} params.billingPeriod
 * @param {number} params.amount
 * @param {string} [params.currency]
 * @param {string} params.provider
 * @param {string} [params.providerReference]
 * @param {string} [params.status]
 * @param {string} [params.recordedBy]
 * @param {string} [params.notes]
 * @param {Date} [params.periodStart]
 * @param {Date} [params.periodEnd]
 * @param {object} [params.metadata]
 */
async function recordSubscriptionPaymentAndActivate(params) {
  const tenantId = params.tenantId;
  const plan = normalizePlan(params.plan);
  const billingPeriod = normalizeBillingPeriod(params.billingPeriod);
  const provider = params.provider || 'manual';
  const providerReference = params.providerReference || null;
  const status = normalizePaymentStatus(params.status);

  if (!tenantId || !PAID_PLANS.has(plan)) {
    throw Object.assign(new Error('Invalid tenant or plan for subscription payment'), { statusCode: 400 });
  }

  if (providerReference) {
    const existing = await SubscriptionPayment.findOne({
      where: { provider, providerReference },
    });
    if (existing) {
      return { payment: existing, alreadyRecorded: true };
    }
  }

  const periodStart = params.periodStart ? new Date(params.periodStart) : new Date();
  const periodEnd = params.periodEnd ? new Date(params.periodEnd) : addPeriod(periodStart, billingPeriod);
  const amount =
    params.amount != null
      ? Number(params.amount)
      : getFallbackAmountPesewas(plan, billingPeriod) || 0;

  const payment = await SubscriptionPayment.create({
    tenantId,
    plan,
    billingPeriod,
    periodStart,
    periodEnd,
    amount,
    currency: params.currency || 'GHS',
    status,
    provider,
    providerReference,
    recordedBy: params.recordedBy || null,
    notes: params.notes || null,
    metadata: params.metadata || {},
  });

  if (status === 'success') {
    await syncTenantSubscriptionState(tenantId, {
      plan,
      billingPeriod,
      currentPeriodEnd: periodEnd,
      lastPaymentReference: providerReference,
      payment,
    });

    // Sales agent commissions: up to 3 successful paid subscription events per attributed tenant.
    // Assumption: this is the single payment-success path for SaaS subscriptions (manual admin
    // recording and Paystack apply both call recordSubscriptionPaymentAndActivate).
    try {
      const salesAgentService = require('./salesAgentService');
      await salesAgentService.maybeCreateCommissionForSuccessfulPayment(payment);
    } catch (commissionErr) {
      console.error(
        '[subscriptionBilling] sales agent commission hook failed:',
        commissionErr?.message || commissionErr
      );
    }
  }

  return { payment, alreadyRecorded: false };
}

/**
 * @param {string} tenantId
 * @param {object} patch
 */
async function syncTenantSubscriptionState(tenantId, patch) {
  const [setting] = await Setting.findOrCreate({
    where: { tenantId, key: 'subscription' },
    defaults: {
      tenantId,
      key: 'subscription',
      value: {},
      description: 'Subscription and billing information',
    },
  });

  const prev = setting.value || {};
  const history = Array.isArray(prev.history) ? prev.history : [];
  if (patch.payment) {
    history.unshift({
      at: new Date().toISOString(),
      event: 'payment_recorded',
      reference: patch.payment.providerReference,
      amount: patch.payment.amount,
      plan: patch.payment.plan,
      billingPeriod: patch.payment.billingPeriod,
      provider: patch.payment.provider,
    });
  }

  const nextValue = {
    ...prev,
    plan: patch.plan || prev.plan,
    status: 'active',
    billingPeriod: patch.billingPeriod || prev.billingPeriod,
    currentPeriodEnd: (patch.currentPeriodEnd || new Date()).toISOString(),
    lastPaymentReference: patch.lastPaymentReference || prev.lastPaymentReference,
    history: history.slice(0, 100),
  };

  await setting.update({ value: nextValue });

  const tenant = await Tenant.scope('withOptionalColumns').findByPk(tenantId);
  if (tenant) {
    const metadata = { ...(tenant.metadata || {}) };
    const entitlements = { ...(metadata.entitlements || {}) };
    entitlements.accessState = 'active';
    metadata.entitlements = entitlements;
    await tenant.update({
      plan: patch.plan || tenant.plan,
      status: tenant.status === 'suspended' ? tenant.status : 'active',
      metadata,
    });
  }
}

/**
 * Paystack verify payload → payment record
 * @param {object} paymentData - Paystack transaction data
 * @param {string} source
 */
async function applySubscriptionFromPaystackTransaction(paymentData, source = 'verify') {
  const metadata =
    typeof paymentData?.metadata === 'string'
      ? JSON.parse(paymentData.metadata || '{}')
      : paymentData?.metadata || {};
  const tenantId = metadata.tenantId || metadata.tenant_id;
  const plan = normalizePlan(metadata.plan);
  const billingPeriod = normalizeBillingPeriod(metadata.billingPeriod || metadata.billing_period);
  const reference = paymentData?.reference;

  if (!tenantId || !plan || metadata.type !== 'subscription') {
    return null;
  }

  return recordSubscriptionPaymentAndActivate({
    tenantId,
    plan,
    billingPeriod,
    amount: paymentData?.amount,
    provider: 'paystack',
    providerReference: reference,
    metadata: {
      source,
      channel: paymentData?.channel || null,
      paystackPlanCode: metadata.paystackPlanCode || null,
      featureKeys: Array.isArray(metadata.featureKeys) ? metadata.featureKeys : [],
    },
  });
}

/**
 * Grant another free trial period (now + the trial length set on the Trial plan) for a tenant.
 * Allowed for expired/unpaid/trialing tenants. Blocked when there is an active
 * paid subscription period or an active enterprise contract plan.
 *
 * Updates tenant.plan / tenant.trialEndsAt, syncs the subscription Setting to
 * trialing, and writes a TenantAccessAudit row. Idempotent-safe: calling again
 * simply moves trialEndsAt to a fresh window from `at`.
 *
 * @param {string} tenantId
 * @param {{ actorUserId?: string|null, reason?: string|null, at?: Date }} [options]
 * @returns {Promise<{
 *   tenantId: string,
 *   plan: string,
 *   trialEndsAt: Date,
 *   billing: ReturnType<typeof toBillingPayload>,
 *   before: object,
 *   after: object,
 * }>}
 * @throws {Error} statusCode 404 when tenant missing; 409 when paid/active
 * @example
 * await resetTenantTrial(tenantId, { actorUserId: adminId, reason: 'Customer support' });
 */
async function resetTenantTrial(tenantId, options = {}) {
  const at = options.at || new Date();
  const actorUserId = options.actorUserId || null;
  const reason =
    options.reason != null && String(options.reason).trim()
      ? String(options.reason).trim().slice(0, 500)
      : 'Granted another free trial';

  if (!tenantId) {
    const err = new Error('Tenant id is required');
    err.statusCode = 400;
    err.errorCode = 'TENANT_ID_REQUIRED';
    throw err;
  }

  const tenant = await Tenant.scope('withOptionalColumns').findByPk(tenantId);
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.statusCode = 404;
    err.errorCode = 'TENANT_NOT_FOUND';
    throw err;
  }

  const subscriptionSetting = await getSubscriptionSetting(tenant.id);
  const billing = await resolveBillingStatus(tenant, { at, subscriptionSetting });
  const billingPlan = normalizePlan(billing.plan);
  const hasActivePaidPayment =
    Boolean(billing.activePayment) && PAID_PLANS.has(normalizePlan(billing.activePayment.plan));
  const isActivePaidBilling =
    billing.billingStatus === 'active' && PAID_PLANS.has(billingPlan);

  if (hasActivePaidPayment || isActivePaidBilling) {
    const err = new Error(
      'Cannot reset trial while this tenant has an active paid subscription. Wait for the paid period to end, or change their plan first.'
    );
    err.statusCode = 409;
    err.errorCode = 'ACTIVE_PAID_SUBSCRIPTION';
    throw err;
  }

  const trialEndsAt = await getTrialEndDate(at);
  const beforeSnapshot = {
    plan: tenant.plan,
    trialEndsAt: tenant.trialEndsAt || subscriptionSetting?.trialEndsAt || null,
    status: tenant.status,
    subscriptionStatus: subscriptionSetting?.status || null,
    accessState: tenant.metadata?.entitlements?.accessState || null,
  };

  const metadata =
    tenant.metadata && typeof tenant.metadata === 'object' ? { ...tenant.metadata } : {};
  const entitlements =
    metadata.entitlements && typeof metadata.entitlements === 'object'
      ? { ...metadata.entitlements }
      : {};

  // Restore app access for billing-restricted states without clearing platform suspension.
  if (entitlements.accessState === 'restricted' || entitlements.accessState === 'read_only') {
    entitlements.accessState = 'active';
  }
  if (entitlements.billingOverride === 'locked') {
    delete entitlements.billingOverride;
  }
  entitlements.updatedAt = at.toISOString();
  entitlements.updatedBy = actorUserId;
  metadata.entitlements = entitlements;
  metadata.lastTrialResetAt = at.toISOString();
  metadata.lastTrialResetBy = actorUserId;

  const nextTenantStatus =
    tenant.status === 'suspended' || tenant.status === 'paused' ? tenant.status : 'active';

  await tenant.update({
    plan: 'trial',
    trialEndsAt,
    status: nextTenantStatus,
    metadata,
  });

  const [setting] = await Setting.findOrCreate({
    where: { tenantId: tenant.id, key: 'subscription' },
    defaults: {
      tenantId: tenant.id,
      key: 'subscription',
      value: buildTrialSubscriptionSettingValue(trialEndsAt),
      description: 'Subscription and billing information',
    },
  });

  const prev =
    setting.value && typeof setting.value === 'object' ? { ...setting.value } : {};
  const history = Array.isArray(prev.history) ? [...prev.history] : [];
  history.unshift({
    at: at.toISOString(),
    event: 'trial_reset',
    trialEndsAt: trialEndsAt.toISOString(),
    actorUserId,
    reason,
  });

  await setting.update({
    value: {
      ...prev,
      ...buildTrialSubscriptionSettingValue(trialEndsAt),
      history: history.slice(0, 100),
    },
  });

  const afterSnapshot = {
    plan: 'trial',
    trialEndsAt,
    status: nextTenantStatus,
    subscriptionStatus: 'trialing',
    accessState: entitlements.accessState || null,
  };

  await TenantAccessAudit.create({
    tenantId: tenant.id,
    actorUserId,
    action: 'tenant_trial_reset',
    before: beforeSnapshot,
    after: {
      ...afterSnapshot,
      trialEndsAt: trialEndsAt.toISOString(),
    },
    reason,
  });

  const freshTenant = await Tenant.scope('withOptionalColumns').findByPk(tenant.id);
  const nextBilling = toBillingPayload(
    await resolveBillingStatus(freshTenant, { at })
  );

  return {
    tenantId: tenant.id,
    plan: 'trial',
    trialEndsAt,
    status: nextTenantStatus,
    billing: nextBilling,
    before: beforeSnapshot,
    after: afterSnapshot,
  };
}

/**
 * JSON-safe billing payload for API responses.
 * @param {Awaited<ReturnType<typeof resolveBillingStatus>>} billing
 */
function toBillingPayload(billing) {
  if (!billing) return null;
  const ap = billing.activePayment;
  return {
    billingStatus: billing.billingStatus,
    lockReason: billing.lockReason,
    canAccessApp: billing.canAccessApp,
    trialEndsAt: billing.trialEndsAt,
    currentPeriodEnd: billing.currentPeriodEnd,
    graceEndsAt: billing.graceEndsAt,
    daysRemaining: billing.daysRemaining,
    plan: billing.plan,
    activePayment: ap
      ? {
          id: ap.id,
          plan: ap.plan,
          billingPeriod: ap.billingPeriod,
          periodStart: ap.periodStart,
          periodEnd: ap.periodEnd,
          amount: ap.amount,
          currency: ap.currency,
          provider: ap.provider,
          providerReference: ap.providerReference,
        }
      : null,
  };
}

module.exports = {
  PAID_PLANS,
  DEFAULT_GRACE_DAYS,
  normalizePlan,
  normalizeBillingPeriod,
  normalizePaymentStatus,
  addPeriod,
  getSubscriptionSetting,
  getActivePaymentForTenant,
  resolveBillingStatus,
  recordSubscriptionPaymentAndActivate,
  syncTenantSubscriptionState,
  applySubscriptionFromPaystackTransaction,
  resetTenantTrial,
  toBillingPayload,
};
