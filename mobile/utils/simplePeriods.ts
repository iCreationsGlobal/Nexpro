export type SimplePeriodKey = 'today' | 'week' | 'month' | 'lastMonth';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Local-date range (YYYY-MM-DD) for a Simple Mode period. Weeks start on Monday, matching the
 * web Simple Mode pages.
 */
export function simplePeriodRange(key: SimplePeriodKey, now = new Date()): { startDate: string; endDate: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (key === 'week') {
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (key === 'month') {
    start.setDate(1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
  } else if (key === 'lastMonth') {
    start.setFullYear(start.getFullYear(), start.getMonth() - 1, 1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
  }
  return { startDate: isoDate(start), endDate: isoDate(end) };
}
