/**
 * Ask AI period helpers — keys align with analysis API `period`.
 * Uses local calendar days (ISO week Mon–Sun), matching Dashboard / backend.
 * Default analysis window is this month; optional NLP can override per message.
 */

export const ASSISTANT_PERIOD_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
] as const;

export type AssistantPeriodKey = (typeof ASSISTANT_PERIOD_OPTIONS)[number]['key'];

/** Resolvable keys including NLP-only `yesterday` (not a chip option). */
export type AssistantResolvablePeriodKey = AssistantPeriodKey | 'yesterday';

export const DEFAULT_ASSISTANT_PERIOD: AssistantPeriodKey = 'month';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Detect a clear relative period in the user message for this request only.
 * Returns null when nothing clear is mentioned (caller keeps the default).
 */
export function detectAssistantPeriodKeyFromMessage(
  message: string
): AssistantResolvablePeriodKey | null {
  const text = String(message || '');
  if (/\byesterday\b/i.test(text)) return 'yesterday';
  if (/\btoday\b/i.test(text)) return 'today';
  if (/\bthis week\b/i.test(text)) return 'week';
  if (/\bthis month\b/i.test(text)) return 'month';
  if (/\bthis year\b/i.test(text)) return 'year';
  return null;
}

/**
 * Map period key to Dashboard-aligned date range.
 */
export function resolveAssistantPeriod(
  periodKey: AssistantResolvablePeriodKey | string = DEFAULT_ASSISTANT_PERIOD,
  now = new Date()
): {
  period: AssistantResolvablePeriodKey;
  startDate: string;
  endDate: string;
  periodLabel: string;
} {
  const knownChip = ASSISTANT_PERIOD_OPTIONS.some((o) => o.key === periodKey);
  const key = (knownChip || periodKey === 'yesterday'
    ? periodKey
    : DEFAULT_ASSISTANT_PERIOD) as AssistantResolvablePeriodKey;

  let start: Date;
  let end: Date;

  switch (key) {
    case 'yesterday': {
      const d = startOfDay(now);
      d.setDate(d.getDate() - 1);
      start = d;
      end = endOfDay(d);
      break;
    }
    case 'week': {
      const d = startOfDay(now);
      const day = d.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      start = startOfDay(d);
      start.setDate(d.getDate() + diffToMonday);
      end = endOfDay(start);
      end.setDate(start.getDate() + 6);
      break;
    }
    case 'month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start = startOfDay(start);
      end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      break;
    }
    case 'quarter': {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      start = startOfDay(new Date(now.getFullYear(), qStart, 1));
      end = endOfDay(new Date(now.getFullYear(), qStart + 3, 0));
      break;
    }
    case 'year': {
      start = startOfDay(new Date(now.getFullYear(), 0, 1));
      end = endOfDay(new Date(now.getFullYear(), 11, 31));
      break;
    }
    case 'today':
    default:
      start = startOfDay(now);
      end = endOfDay(now);
      break;
  }

  const option = ASSISTANT_PERIOD_OPTIONS.find((o) => o.key === key);
  const periodLabel = key === 'yesterday' ? 'Yesterday' : option?.label || 'This month';
  return {
    period: key,
    startDate: formatYmd(start),
    endDate: formatYmd(end),
    periodLabel,
  };
}

/**
 * Resolve period for one chat request: NLP mention overrides default for that call only.
 */
export function resolveAssistantPeriodForMessage(
  message: string,
  defaultKey: AssistantPeriodKey = DEFAULT_ASSISTANT_PERIOD,
  now = new Date()
) {
  const mentioned = detectAssistantPeriodKeyFromMessage(message);
  return resolveAssistantPeriod(mentioned || defaultKey, now);
}
