const { getTrialEndDate } = require('./subscriptionDefaults');

/**
 * Signup plan assignment
 * ----------------------
 * Every new business starts on the `trial` plan, whether it signs up on the web or in the app.
 * How long the trial lasts is set by the admin on the Trial plan (see getTrialMonths).
 *
 * The signup channel is still recorded (metadata.signupChannel) so app and web signups can be
 * told apart; it no longer changes the plan.
 */

const MOBILE_CLIENT_HEADER_VALUES = new Set(['mobile', 'abs-mobile', 'expo']);
const MOBILE_APP_HEADER_VALUES = new Set(['abs-mobile', 'mobile']);

/**
 * Detect ABS mobile client from explicit headers / body flag (prefer over UA sniffing).
 * @param {import('express').Request|object|null} req
 * @returns {boolean}
 */
function isMobileSignupClient(req) {
  if (!req) return false;
  const headers = req.headers || {};
  const body = req.body || {};

  const xClient = String(headers['x-client'] || headers['X-Client'] || '')
    .trim()
    .toLowerCase();
  if (MOBILE_CLIENT_HEADER_VALUES.has(xClient)) return true;

  const xApp = String(headers['x-app'] || headers['X-App'] || '')
    .trim()
    .toLowerCase();
  if (MOBILE_APP_HEADER_VALUES.has(xApp)) return true;

  const clientFlag = String(body.client || body.signupClient || '')
    .trim()
    .toLowerCase();
  if (MOBILE_CLIENT_HEADER_VALUES.has(clientFlag) || clientFlag === 'abs-mobile') {
    return true;
  }

  return false;
}

/**
 * Resolve plan + trial end for a new tenant signup.
 * Ignores client-supplied plan ids.
 *
 * @param {object} params
 * @param {import('express').Request|object} [params.req]
 * @param {Date} [params.at]
 * @returns {Promise<{
 *   channel: 'mobile'|'web',
 *   planId: 'trial',
 *   subscriptionStatus: 'trialing',
 *   trialEndsAt: Date,
 *   metadataExtras: object,
 * }>}
 */
async function resolveSignupPlanAssignment({ req, at = new Date() } = {}) {
  const channel = isMobileSignupClient(req) ? 'mobile' : 'web';
  return {
    channel,
    planId: 'trial',
    subscriptionStatus: 'trialing',
    trialEndsAt: await getTrialEndDate(at),
    metadataExtras: {
      signupChannel: channel,
    },
  };
}

/**
 * Build the subscription Setting.value payload for a signup assignment.
 * @param {object} assignment - from resolveSignupPlanAssignment
 * @param {object} [extras]
 */
function buildSignupSubscriptionSettingValue(assignment, extras = {}) {
  return {
    plan: assignment.planId,
    status: assignment.subscriptionStatus,
    trialEndsAt: assignment.trialEndsAt,
    paymentMethod: null,
    seats: 1,
    ...extras,
  };
}

module.exports = {
  isMobileSignupClient,
  resolveSignupPlanAssignment,
  buildSignupSubscriptionSettingValue,
};
