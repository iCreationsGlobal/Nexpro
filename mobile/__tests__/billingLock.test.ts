import {
  billingStatusFromLockedResponse,
  getBillingLockCopy,
  isBillingExemptPath,
  isBillingLocked,
  notifySubscriptionLocked,
  onSubscriptionLocked,
} from '@/utils/billingLock';

describe('billingLock', () => {
  it('locks only when access is denied and the workspace is locked or suspended', () => {
    expect(isBillingLocked({ billingStatus: 'locked', canAccessApp: false })).toBe(true);
    expect(isBillingLocked({ billingStatus: 'suspended', canAccessApp: false })).toBe(true);
    expect(isBillingLocked({ billingStatus: 'grace', canAccessApp: true })).toBe(false);
    expect(isBillingLocked({ billingStatus: 'locked' })).toBe(false);
    expect(isBillingLocked(null)).toBe(false);
  });

  it('keeps settings, profile, account and legal pages reachable', () => {
    expect(isBillingExemptPath('/settings')).toBe(true);
    expect(isBillingExemptPath('/profile')).toBe(true);
    expect(isBillingExemptPath('/privacy-policy')).toBe(true);
    expect(isBillingExemptPath('/')).toBe(false);
    expect(isBillingExemptPath('/sales')).toBe(false);
    expect(isBillingExemptPath('/settingsx')).toBe(false);
  });

  it('reads a SUBSCRIPTION_LOCKED 403 body and ignores other errors', () => {
    expect(
      billingStatusFromLockedResponse({
        success: false,
        errorCode: 'SUBSCRIPTION_LOCKED',
        billingStatus: 'locked',
        lockReason: 'trial_expired',
      })
    ).toMatchObject({ billingStatus: 'locked', lockReason: 'trial_expired', canAccessApp: false });
    expect(billingStatusFromLockedResponse({ errorCode: 'FORBIDDEN' })).toBeNull();
    expect(billingStatusFromLockedResponse(undefined)).toBeNull();
  });

  it('words the screen by lock reason without payment links', () => {
    expect(getBillingLockCopy({ lockReason: 'trial_expired' }).title).toBe('Your free trial has ended');
    expect(getBillingLockCopy({ billingStatus: 'suspended' }).title).toBe('Access restricted');
    const generic = getBillingLockCopy(null);
    expect(generic.title).toBe('Subscription required');
    expect(generic.description).toMatch(/Contact support/);
  });

  it('notifies listeners until they unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = onSubscriptionLocked(listener);
    notifySubscriptionLocked({ billingStatus: 'locked', canAccessApp: false });
    unsubscribe();
    notifySubscriptionLocked({ billingStatus: 'locked', canAccessApp: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
