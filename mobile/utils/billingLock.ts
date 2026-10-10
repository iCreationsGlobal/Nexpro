/**
 * Workspace billing lock (mirrors Frontend BillingLockedScreen + MainLayout). The backend answers
 * 403 SUBSCRIPTION_LOCKED for a locked workspace; the app shows one lock screen instead of every
 * screen failing on its own.
 */
export type BillingStatus = {
  billingStatus?: string | null;
  lockReason?: string | null;
  canAccessApp?: boolean;
  plan?: string | null;
  trialEndsAt?: string | null;
  graceEndsAt?: string | null;
};

export const SUPPORT_EMAIL = 'support@africanbusinesssuite.com';

export function isBillingLocked(status: BillingStatus | null | undefined): boolean {
  if (!status || status.canAccessApp !== false) return false;
  return status.billingStatus === 'locked' || status.billingStatus === 'suspended';
}

/** Screens that stay reachable while locked: switch workspace, sign out, legal pages. */
const EXEMPT_PATHS = ['/settings', '/profile', '/account', '/terms', '/privacy-policy', '/data-deletion'];

export function isBillingExemptPath(pathname = ''): boolean {
  return EXEMPT_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Store-safe copy: no in-app purchase or external payment link, matching the web "contact support" variant. */
export function getBillingLockCopy(status: BillingStatus | null | undefined): { title: string; description: string } {
  if (status?.billingStatus === 'suspended' || status?.lockReason === 'platform_locked') {
    return {
      title: 'Access restricted',
      description: 'Workspace access has been restricted. Contact support to restore access.',
    };
  }
  if (status?.plan === 'enterprise') {
    return {
      title: 'Subscription required',
      description: 'Your Enterprise workspace needs billing attention. Contact your account manager or support to restore access.',
    };
  }
  if (status?.lockReason === 'trial_expired') {
    return {
      title: 'Your free trial has ended',
      description: 'The trial and grace period for this workspace are over. Contact support to restore access.',
    };
  }
  return {
    title: 'Subscription required',
    description: 'This workspace’s subscription is not active. Contact support to restore access.',
  };
}

/** 403 body → status; the body carries billing fields but not `canAccessApp`. */
export function billingStatusFromLockedResponse(body: unknown): BillingStatus | null {
  if (!body || typeof body !== 'object') return null;
  const data = body as Record<string, unknown>;
  if (data.errorCode !== 'SUBSCRIPTION_LOCKED') return null;
  return {
    billingStatus: typeof data.billingStatus === 'string' ? data.billingStatus : 'locked',
    lockReason: typeof data.lockReason === 'string' ? data.lockReason : null,
    canAccessApp: false,
    trialEndsAt: typeof data.trialEndsAt === 'string' ? data.trialEndsAt : null,
    graceEndsAt: typeof data.graceEndsAt === 'string' ? data.graceEndsAt : null,
  };
}

type LockListener = (status: BillingStatus) => void;
const listeners = new Set<LockListener>();

export function onSubscriptionLocked(listener: LockListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifySubscriptionLocked(status: BillingStatus) {
  listeners.forEach((listener) => listener(status));
}
