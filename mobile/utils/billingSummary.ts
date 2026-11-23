import { CURRENCY } from '@/constants';
import { formatDate, formatDecimal } from '@/utils/formatCurrency';
import type { BillingStatus } from '@/utils/billingLock';

/**
 * Read-only billing summary for the Billing screen (mobile counterpart of the web Settings → Billing).
 *
 * Store-safe on purpose: Apple 3.1.1 and Google Play's payments policy forbid selling the ABS
 * subscription outside their own billing, or pointing people to another way to pay. So nothing here
 * says "upgrade", "renew" or "pay on the web"; the screen only reports the plan and past payments.
 */

export type BillingDetails = BillingStatus & {
  currentPeriodEnd?: string | null;
  daysRemaining?: number | null;
};

export type SubscriptionPayment = {
  id?: string;
  plan?: string | null;
  billingPeriod?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  provider?: string | null;
  providerReference?: string | null;
  createdAt?: string | null;
};

export type SeatUsage = {
  current?: number | null;
  limit?: number | null;
  isUnlimited?: boolean;
};

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatPlanName(plan: string | null | undefined): string {
  const key = String(plan || '').trim().toLowerCase();
  if (!key || key === 'trial') return 'Free trial';
  return titleCase(key);
}

export function formatBillingPeriod(period: string | null | undefined): string | null {
  const key = String(period || '').trim().toLowerCase();
  if (!key) return null;
  if (key === 'monthly' || key === 'month') return 'Monthly';
  if (key === 'yearly' || key === 'annual' || key === 'annually' || key === 'year') return 'Yearly';
  return titleCase(key);
}

export function getBillingStatusBadge(billing: BillingDetails | null | undefined): { label: string; tone: BadgeTone } {
  switch (billing?.billingStatus) {
    case 'active':
    case 'manual_override':
      return { label: 'Active', tone: 'success' };
    case 'trialing':
      return { label: 'On trial', tone: 'success' };
    case 'grace':
      return { label: 'Grace period', tone: 'warning' };
    case 'past_due':
      return { label: 'Past due', tone: 'warning' };
    case 'locked':
      return { label: 'Locked', tone: 'danger' };
    case 'suspended':
      return { label: 'Suspended', tone: 'danger' };
    default:
      return { label: 'Unknown', tone: 'neutral' };
  }
}

function daysLeftText(days: number | null | undefined): string {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) return '';
  if (days === 0) return ' (ends today)';
  return days === 1 ? ' (1 day left)' : ` (${days} days left)`;
}

/** One line under the plan name: when the trial, paid period or grace period ends. */
export function getBillingHeadline(billing: BillingDetails | null | undefined): string {
  if (!billing) return 'Billing details are not available right now.';
  const { billingStatus, lockReason, trialEndsAt, currentPeriodEnd, graceEndsAt, daysRemaining, plan } = billing;

  switch (billingStatus) {
    case 'trialing':
      return trialEndsAt
        ? `Trial ends ${formatDate(trialEndsAt)}${daysLeftText(daysRemaining)}`
        : 'Your workspace is on the free trial.';
    case 'active':
      if (currentPeriodEnd) return `Paid through ${formatDate(currentPeriodEnd)}${daysLeftText(daysRemaining)}`;
      return plan === 'enterprise' ? 'Billed under your Enterprise agreement.' : 'Your plan is active.';
    case 'manual_override':
      return 'Access is set by ABS support for this workspace.';
    case 'grace': {
      const ended = lockReason === 'trial_expired' ? 'Your free trial has ended.' : 'Your paid period has ended.';
      return graceEndsAt
        ? `${ended} The app keeps working until ${formatDate(graceEndsAt)}${daysLeftText(daysRemaining)}.`
        : ended;
    }
    case 'locked':
      if (lockReason === 'platform_locked') return 'Access to this workspace has been restricted.';
      if (lockReason === 'trial_expired') {
        return trialEndsAt ? `Your free trial ended on ${formatDate(trialEndsAt)}.` : 'Your free trial has ended.';
      }
      return currentPeriodEnd ? `Your paid period ended on ${formatDate(currentPeriodEnd)}.` : 'This workspace has no active plan.';
    case 'suspended':
      return 'Access to this workspace has been suspended.';
    default:
      return 'Billing details are not available right now.';
  }
}

/** The date for the "Current period ends" row (trial end while on trial). */
export function getPeriodEndDate(billing: BillingDetails | null | undefined): string | null {
  if (!billing) return null;
  if (billing.billingStatus === 'trialing') return billing.trialEndsAt ?? null;
  return billing.currentPeriodEnd ?? billing.trialEndsAt ?? null;
}

/** Subscription payments are stored in minor units (pesewas for GHS). */
export function formatMinorAmount(amount: number | string | null | undefined, currency?: string | null): string {
  const minor = Number(amount);
  const major = Number.isFinite(minor) ? minor / 100 : 0;
  const code = String(currency || 'GHS').toUpperCase();
  const symbol = code === 'GHS' ? CURRENCY.SYMBOL : code;
  return `${symbol} ${formatDecimal(major, CURRENCY.DECIMAL_PLACES)}`;
}

export function formatPaymentPeriod(payment: SubscriptionPayment): string {
  if (!payment.periodStart && !payment.periodEnd) return formatDate(payment.createdAt);
  return `${formatDate(payment.periodStart)} – ${formatDate(payment.periodEnd)}`;
}

export function formatPaymentStatus(status: string | null | undefined): { label: string; tone: BadgeTone } {
  const key = String(status || 'success').trim().toLowerCase();
  if (key === 'success' || key === 'paid' || key === 'active') return { label: 'Paid', tone: 'success' };
  if (key === 'pending' || key === 'processing') return { label: 'Pending', tone: 'warning' };
  if (key === 'failed' || key === 'abandoned' || key === 'reversed' || key === 'refunded') {
    return { label: titleCase(key), tone: 'danger' };
  }
  return { label: titleCase(key), tone: 'neutral' };
}

export function formatPaymentProvider(provider: string | null | undefined): string {
  const key = String(provider || 'manual').trim().toLowerCase();
  if (key === 'paystack') return 'Paystack';
  if (key === 'manual') return 'Recorded by ABS';
  return titleCase(key);
}

export function formatSeatUsage(usage: SeatUsage | null | undefined): string | null {
  if (!usage) return null;
  if (usage.isUnlimited) return 'Unlimited';
  const limit = Number(usage.limit);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const current = Number(usage.current);
  return Number.isFinite(current) ? `${current} of ${limit} used` : `${limit} seats`;
}
