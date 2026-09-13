import {
  getEndDateFromDuration,
  getRentalDayCount,
  normalizeDayBillingMode,
} from '../../utils/rentalDayBilling';

describe('rentalDayBilling', () => {
  it('defaults unknown modes to end of day', () => {
    expect(normalizeDayBillingMode(undefined)).toBe('end_of_day');
    expect(normalizeDayBillingMode('overnight')).toBe('overnight');
  });

  it('bills inclusive calendar days for end of day (cars)', () => {
    expect(getRentalDayCount('2026-08-29', '2026-08-29', 'end_of_day')).toBe(1);
    expect(getRentalDayCount('2026-08-29', '2026-08-30', 'end_of_day')).toBe(2);
    expect(getEndDateFromDuration('2026-08-29', 1, 'end_of_day')).toBe('2026-08-29');
    expect(getEndDateFromDuration('2026-08-29', 3, 'end_of_day')).toBe('2026-08-31');
  });

  it('bills nights for overnight (equipment)', () => {
    expect(getRentalDayCount('2026-08-29', '2026-08-30', 'overnight')).toBe(1);
    expect(getRentalDayCount('2026-08-29', '2026-09-01', 'overnight')).toBe(3);
    expect(getEndDateFromDuration('2026-08-29', 1, 'overnight')).toBe('2026-08-30');
    expect(getEndDateFromDuration('2026-08-29', 3, 'overnight')).toBe('2026-09-01');
  });
});
