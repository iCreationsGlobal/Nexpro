import { getSimpleModeConfig, isSimpleModePathAllowed } from '@/constants/simpleMode';
import { simplePeriodRange } from '@/utils/simplePeriods';
import { getInterfaceMode, getSimpleModeShowAdvanced } from '@/utils/interfaceMode';

describe('Simple Mode config', () => {
  const shop = getSimpleModeConfig('shop');

  it('is only available for shops for now', () => {
    expect(shop).not.toBeNull();
    expect(getSimpleModeConfig('studio')).toBeNull();
    expect(getSimpleModeConfig(undefined)).toBeNull();
  });

  it('allows the essential screens and their detail pages', () => {
    for (const path of ['/', '/(tabs)', '/(tabs)/sales', '/sale/123', '/expenses', '/customer/9', '/products', '/reports', '/settings', '/simple/charge']) {
      expect(isSimpleModePathAllowed(shop, path)).toBe(true);
    }
  });

  it('blocks everything else', () => {
    for (const path of ['/invoices', '/(tabs)/jobs', '/lead/1', '/notifications', '/(tabs)/chat', '/quotes-new']) {
      expect(isSimpleModePathAllowed(shop, path)).toBe(false);
    }
  });
});

describe('simplePeriodRange', () => {
  const wednesday = new Date(2026, 8, 23, 15, 0); // Wed 23 Sep 2026

  it('covers today, a Monday-start week, this month and last month', () => {
    expect(simplePeriodRange('today', wednesday)).toEqual({ startDate: '2026-09-23', endDate: '2026-09-23' });
    expect(simplePeriodRange('week', wednesday)).toEqual({ startDate: '2026-09-21', endDate: '2026-09-27' });
    expect(simplePeriodRange('month', wednesday)).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(simplePeriodRange('lastMonth', wednesday)).toEqual({ startDate: '2026-08-01', endDate: '2026-08-31' });
  });

  it('starts Sunday weeks on the Monday before', () => {
    expect(simplePeriodRange('week', new Date(2026, 8, 27))).toEqual({ startDate: '2026-09-21', endDate: '2026-09-27' });
  });
});

describe('membership preferences', () => {
  it('reads Simple Mode and show-advanced from membership metadata', () => {
    expect(getInterfaceMode({ metadata: { interfaceMode: 'simple' } })).toBe('simple');
    expect(getSimpleModeShowAdvanced({ metadata: { simpleModeShowAdvanced: true } })).toBe(true);
    expect(getSimpleModeShowAdvanced({ metadata: {} })).toBe(false);
    expect(getSimpleModeShowAdvanced(null)).toBe(false);
  });
});

import { formatDisplayPhone } from '@/utils/displayPhone';

describe('formatDisplayPhone', () => {
  it('collapses a doubled country code and leaves normal numbers alone', () => {
    expect(formatDisplayPhone('+233+233555155972')).toBe('+233555155972');
    expect(formatDisplayPhone('+233555155972')).toBe('+233555155972');
    expect(formatDisplayPhone('0555155972')).toBe('0555155972');
    expect(formatDisplayPhone(null)).toBe('');
  });
});
