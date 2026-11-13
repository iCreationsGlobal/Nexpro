const { resolveBillingStatus } = require('../services/subscriptionBillingService');

/**
 * Paths allowed when workspace billing is locked (hard lock).
 * Matched against req.baseUrl + req.path (Express mount path).
 */
const isBillingExemptRequest = (req) => {
  if (req.user?.isPlatformAdmin) return true;
  if (req.isSupportAccess) return true;

  const method = String(req.method || 'GET').toUpperCase();
  const base = String(req.baseUrl || '');
  const path = String(req.path || '');
  const full = `${base}${path}`;

  if (full.startsWith('/api/public')) return true;
  if (base === '/api/auth') return true;
  if (base === '/api/webhooks') return true;
  if (base.startsWith('/api/admin') || base.startsWith('/api/platform')) return true;

  if (base === '/api/subscription') return true;

  if (base === '/api/settings') {
    if (path === '/profile' || path === '/profile/avatar') return true;
    if (method === 'GET' && path === '/subscription') return true;
    if (method === 'GET' && path === '/organization') return true;
    // Account deletion must always be possible (App Store 5.1.1(v)), locked or not.
    if (method === 'POST' && path === '/data-deletion-request') return true;
    return false;
  }

  if (base === '/api/tenants' && method === 'GET') return true;

  if (base === '/api/studio-locations' && path === '/access' && method === 'GET') return true;
  if (base === '/api/shops' && path === '/access' && method === 'GET') return true;

  if (base === '/api/support' || full.includes('/support')) return true;

  return false;
};

/**
 * Block locked workspaces except billing-safe endpoints.
 * Attach billingStatus on request for downstream use.
 */
const enforceBillingAccess = async (req, res, next) => {
  try {
    if (!req.tenantId || !req.tenant) return next();
    if (isBillingExemptRequest(req)) return next();

    const billing = await resolveBillingStatus(req.tenant);
    req.billingStatus = billing;
    res.locals.billingStatus = billing;

    if (billing.canAccessApp) return next();

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    return res.status(403).json({
      success: false,
      errorCode: 'SUBSCRIPTION_LOCKED',
      message:
        billing.billingStatus === 'suspended'
          ? 'Workspace access is suspended. Contact support.'
          : 'Your subscription has expired. Renew your plan to continue using the app.',
      billingStatus: billing.billingStatus,
      lockReason: billing.lockReason,
      trialEndsAt: billing.trialEndsAt,
      graceEndsAt: billing.graceEndsAt,
      currentPeriodEnd: billing.currentPeriodEnd,
      daysRemaining: billing.daysRemaining,
      checkoutUrl: `${frontendUrl}/checkout`,
      upgradeRequired: true,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  enforceBillingAccess,
  isBillingExemptRequest,
};
