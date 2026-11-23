import fs from 'node:fs';
import path from 'node:path';
import {
  formatBillingPeriod,
  formatMinorAmount,
  formatPaymentPeriod,
  formatPaymentProvider,
  formatPaymentStatus,
  formatPlanName,
  formatSeatUsage,
  getBillingHeadline,
  getBillingStatusBadge,
  getPeriodEndDate,
} from '@/utils/billingSummary';

describe('billingSummary', () => {
  it('names plans the way owners know them', () => {
    expect(formatPlanName('trial')).toBe('Free trial');
    expect(formatPlanName(null)).toBe('Free trial');
    expect(formatPlanName('starter')).toBe('Starter');
    expect(formatPlanName('professional')).toBe('Professional');
    expect(formatPlanName('enterprise')).toBe('Enterprise');
  });

  it('labels every backend billing state', () => {
    expect(getBillingStatusBadge({ billingStatus: 'active' })).toEqual({ label: 'Active', tone: 'success' });
    expect(getBillingStatusBadge({ billingStatus: 'manual_override' }).tone).toBe('success');
    expect(getBillingStatusBadge({ billingStatus: 'trialing' })).toEqual({ label: 'On trial', tone: 'success' });
    expect(getBillingStatusBadge({ billingStatus: 'grace' }).tone).toBe('warning');
    expect(getBillingStatusBadge({ billingStatus: 'locked' }).tone).toBe('danger');
    expect(getBillingStatusBadge({ billingStatus: 'suspended' }).tone).toBe('danger');
    expect(getBillingStatusBadge(null)).toEqual({ label: 'Unknown', tone: 'neutral' });
  });

  it('says when the trial, paid period or grace period ends', () => {
    expect(
      getBillingHeadline({ billingStatus: 'trialing', trialEndsAt: '2026-11-30T12:00:00Z', daysRemaining: 20 })
    ).toBe('Trial ends Nov 30, 2026 (20 days left)');
    expect(
      getBillingHeadline({ billingStatus: 'active', currentPeriodEnd: '2026-12-01T12:00:00Z', daysRemaining: 1 })
    ).toBe('Paid through Dec 1, 2026 (1 day left)');
    expect(getBillingHeadline({ billingStatus: 'active', plan: 'enterprise' })).toBe(
      'Billed under your Enterprise agreement.'
    );
    expect(
      getBillingHeadline({
        billingStatus: 'grace',
        lockReason: 'trial_expired',
        graceEndsAt: '2026-11-15T12:00:00Z',
        daysRemaining: 0,
      })
    ).toBe('Your free trial has ended. The app keeps working until Nov 15, 2026 (ends today).');
    expect(
      getBillingHeadline({ billingStatus: 'locked', lockReason: 'trial_expired', trialEndsAt: '2026-10-01T12:00:00Z' })
    ).toBe('Your free trial ended on Oct 1, 2026.');
    expect(getBillingHeadline({ billingStatus: 'locked', lockReason: 'platform_locked' })).toBe(
      'Access to this workspace has been restricted.'
    );
    expect(getBillingHeadline(null)).toBe('Billing details are not available right now.');
  });

  it('uses the trial end while on trial, the paid period end otherwise', () => {
    expect(
      getPeriodEndDate({ billingStatus: 'trialing', trialEndsAt: 'T', currentPeriodEnd: 'P' })
    ).toBe('T');
    expect(getPeriodEndDate({ billingStatus: 'active', trialEndsAt: 'T', currentPeriodEnd: 'P' })).toBe('P');
    expect(getPeriodEndDate({ billingStatus: 'locked', trialEndsAt: 'T' })).toBe('T');
    expect(getPeriodEndDate(null)).toBeNull();
  });

  it('turns pesewas into cedis', () => {
    expect(formatMinorAmount(12900, 'GHS')).toBe('₵ 129.00');
    expect(formatMinorAmount('238800', null)).toBe('₵ 2,388.00');
    expect(formatMinorAmount(1000, 'usd')).toBe('USD 10.00');
    expect(formatMinorAmount(undefined)).toBe('₵ 0.00');
  });

  it('formats payment rows', () => {
    expect(formatBillingPeriod('monthly')).toBe('Monthly');
    expect(formatBillingPeriod('yearly')).toBe('Yearly');
    expect(formatBillingPeriod(null)).toBeNull();
    expect(
      formatPaymentPeriod({ periodStart: '2026-11-01T12:00:00Z', periodEnd: '2026-12-01T12:00:00Z' })
    ).toBe('Nov 1, 2026 – Dec 1, 2026');
    expect(formatPaymentStatus('success')).toEqual({ label: 'Paid', tone: 'success' });
    expect(formatPaymentStatus(undefined)).toEqual({ label: 'Paid', tone: 'success' });
    expect(formatPaymentStatus('pending').tone).toBe('warning');
    expect(formatPaymentStatus('refunded')).toEqual({ label: 'Refunded', tone: 'danger' });
    expect(formatPaymentProvider('paystack')).toBe('Paystack');
    expect(formatPaymentProvider(null)).toBe('Recorded by ABS');
  });

  it('shows seats used against the limit', () => {
    expect(formatSeatUsage({ current: 3, limit: 5 })).toBe('3 of 5 used');
    expect(formatSeatUsage({ isUnlimited: true, limit: null })).toBe('Unlimited');
    expect(formatSeatUsage({ limit: null })).toBeNull();
    expect(formatSeatUsage(null)).toBeNull();
  });

  // Apple 3.1.1 / Google Play payments policy: the app must not sell the ABS plan or point to another way to pay.
  it('keeps the billing screen free of purchase prompts', () => {
    const files = ['app/billing.tsx', 'utils/billingSummary.ts', 'components/BillingLockedScreen.tsx'];
    for (const file of files) {
      const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code).not.toMatch(/\b(upgrade|renew|subscribe|checkout|buy now)\b/i);
      expect(code).not.toMatch(/subscription\/initialize|initializeSubscriptionPayment|\/plans\b/);
    }
  });
});
