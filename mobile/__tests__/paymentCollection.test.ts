import {
  describePayoutDestination,
  getDirectMomoProviders,
  isValidDirectMomoPhone,
  normalizeDirectMomoPhone,
} from '@/utils/paymentCollection';

describe('payment collection utilities', () => {
  it.each([
    ['024 123 4567', '233241234567'],
    ['+233241234567', '233241234567'],
    ['233241234567', '233241234567'],
    ['241234567', '233241234567'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeDirectMomoPhone(input)).toBe(expected);
  });

  it('validates Ghana mobile money phone numbers', () => {
    expect(isValidDirectMomoPhone('024 123 4567')).toBe(true);
    expect(isValidDirectMomoPhone('+233241234567')).toBe(true);
    expect(isValidDirectMomoPhone('12345')).toBe(false);
  });

  it('only returns direct MoMo providers when collection is configured', () => {
    expect(getDirectMomoProviders(null)).toEqual([]);
    expect(getDirectMomoProviders({ configured: true })).toEqual(['MTN', 'AIRTEL', 'VODAFONE']);
    expect(getDirectMomoProviders({ mtn_collection: { merchantId: 'M1' } })).toEqual([
      'MTN',
      'AIRTEL',
      'VODAFONE',
    ]);
    expect(getDirectMomoProviders({ hubtel_collection: { configured: true } })).toEqual([
      'MTN',
      'AIRTEL',
      'VODAFONE',
    ]);
  });
});

describe('describePayoutDestination', () => {
  it('summarises a Mobile Money payout wallet', () => {
    expect(
      describePayoutDestination({ settlement_type: 'momo', momo_provider: 'MTN', momo_phone_masked: '****4567' })
    ).toBe('MTN MoMo ****4567');
  });

  it('summarises a bank payout account', () => {
    expect(
      describePayoutDestination({ settlement_type: 'bank', bank_name: 'GCB Bank', account_number_masked: '****1234' })
    ).toBe('GCB Bank ****1234');
  });

  it('returns null when no payout destination is connected', () => {
    expect(describePayoutDestination(null)).toBeNull();
    expect(describePayoutDestination({ settlement_type: 'momo' })).toBeNull();
  });
});
