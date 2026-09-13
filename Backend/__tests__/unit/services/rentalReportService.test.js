const {
  overlapDays,
  countDaysInclusive,
  paymentMethodLabel,
  stockAlertStatus,
} = require('../../../services/rentalReportService');

describe('rentalReportService helpers', () => {
  describe('countDaysInclusive', () => {
    it('counts inclusive days between two dates', () => {
      expect(countDaysInclusive('2026-01-01', '2026-01-01')).toBe(1);
      expect(countDaysInclusive('2026-01-01', '2026-01-03')).toBe(3);
    });

    it('returns 0 for invalid ranges', () => {
      expect(countDaysInclusive('2026-01-05', '2026-01-01')).toBe(0);
    });
  });

  describe('overlapDays', () => {
    it('returns full rental days when rental is inside period', () => {
      expect(overlapDays('2026-01-05', '2026-01-07', '2026-01-01', '2026-01-31')).toBe(3);
    });

    it('returns partial overlap at period edges', () => {
      expect(overlapDays('2026-01-25', '2026-02-05', '2026-01-01', '2026-01-31')).toBe(7);
    });

    it('returns 0 when rental does not overlap period', () => {
      expect(overlapDays('2026-02-01', '2026-02-05', '2026-01-01', '2026-01-31')).toBe(0);
    });
  });

  describe('paymentMethodLabel', () => {
    it('maps rental payment methods to report labels', () => {
      expect(paymentMethodLabel('cash')).toBe('Cash');
      expect(paymentMethodLabel('mobile_money')).toBe('MoMo');
      expect(paymentMethodLabel('bank_transfer')).toBe('Bank');
    });
  });

  describe('stockAlertStatus', () => {
    it('flags empty quantity as out of stock and qty 1 as critical low', () => {
      expect(stockAlertStatus(0, 2)).toBe('out_of_stock');
      expect(stockAlertStatus(1, 0)).toBe('critical_low');
      expect(stockAlertStatus(8, 2)).toBeNull();
    });
  });
});
