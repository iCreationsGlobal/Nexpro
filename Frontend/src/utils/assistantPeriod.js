import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);

/** Ask AI period keys — align with analysis API `period`. Default is this month. */
export const ASSISTANT_PERIOD_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
];

export const DEFAULT_ASSISTANT_PERIOD = 'month';

/**
 * Detect a clear relative period in the user message for this request only.
 * Returns null when nothing clear is mentioned (caller keeps the default).
 * @param {string} message
 * @returns {'today'|'yesterday'|'week'|'month'|'year'|null}
 */
export function detectAssistantPeriodKeyFromMessage(message) {
  const text = String(message || '');
  if (/\byesterday\b/i.test(text)) return 'yesterday';
  if (/\btoday\b/i.test(text)) return 'today';
  if (/\bthis week\b/i.test(text)) return 'week';
  if (/\bthis month\b/i.test(text)) return 'month';
  if (/\bthis year\b/i.test(text)) return 'year';
  return null;
}

/**
 * Map period key to Dashboard-aligned date range (ISO week, calendar quarter).
 * @param {'today'|'yesterday'|'week'|'month'|'quarter'|'year'} periodKey
 * @param {import('dayjs').Dayjs} [now]
 * @returns {{ period: string, startDate: string, endDate: string, periodLabel: string }}
 */
export function resolveAssistantPeriod(periodKey = DEFAULT_ASSISTANT_PERIOD, now = dayjs()) {
  const knownChip = ASSISTANT_PERIOD_OPTIONS.some((o) => o.key === periodKey);
  const key = knownChip || periodKey === 'yesterday' ? periodKey : DEFAULT_ASSISTANT_PERIOD;
  let start;
  let end;
  switch (key) {
    case 'yesterday':
      start = now.subtract(1, 'day').startOf('day');
      end = now.subtract(1, 'day').endOf('day');
      break;
    case 'week':
      start = now.startOf('isoWeek');
      end = now.endOf('isoWeek');
      break;
    case 'month':
      start = now.startOf('month');
      end = now.endOf('month');
      break;
    case 'quarter':
      start = now.startOf('quarter');
      end = now.endOf('quarter');
      break;
    case 'year':
      start = now.startOf('year');
      end = now.endOf('year');
      break;
    case 'today':
    default:
      start = now.startOf('day');
      end = now.endOf('day');
      break;
  }
  const option = ASSISTANT_PERIOD_OPTIONS.find((o) => o.key === key);
  return {
    period: key,
    startDate: start.format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD'),
    periodLabel: key === 'yesterday' ? 'Yesterday' : option?.label || 'This month',
  };
}

/**
 * Resolve period for one chat request: NLP mention overrides default for that call only.
 * @param {string} message
 * @param {'today'|'week'|'month'|'quarter'|'year'} [defaultKey]
 * @param {import('dayjs').Dayjs} [now]
 */
export function resolveAssistantPeriodForMessage(
  message,
  defaultKey = DEFAULT_ASSISTANT_PERIOD,
  now = dayjs()
) {
  const mentioned = detectAssistantPeriodKeyFromMessage(message);
  return resolveAssistantPeriod(mentioned || defaultKey, now);
}

/**
 * Infer chip key from URL/dashboard dates when possible; default this month.
 * @param {string|undefined} startDate
 * @param {string|undefined} endDate
 * @param {string|undefined} periodLabel
 * @returns {'today'|'week'|'month'|'quarter'|'year'}
 */
export function inferAssistantPeriodKey(startDate, endDate, periodLabel) {
  const label = String(periodLabel || '').toLowerCase();
  if (label.includes('week')) return 'week';
  if (label.includes('quarter')) return 'quarter';
  if (label.includes('year')) return 'year';
  if (label.includes('month')) return 'month';
  if (label.includes('today') || label === 'today') return 'today';

  if (startDate && endDate) {
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    if (start.isSame(end, 'day') && start.isSame(dayjs(), 'day')) return 'today';
    const week = resolveAssistantPeriod('week');
    if (startDate === week.startDate && endDate === week.endDate) return 'week';
    const month = resolveAssistantPeriod('month');
    if (startDate === month.startDate && endDate === month.endDate) return 'month';
    const quarter = resolveAssistantPeriod('quarter');
    if (startDate === quarter.startDate && endDate === quarter.endDate) return 'quarter';
    const year = resolveAssistantPeriod('year');
    if (startDate === year.startDate && endDate === year.endDate) return 'year';
  }
  return DEFAULT_ASSISTANT_PERIOD;
}
