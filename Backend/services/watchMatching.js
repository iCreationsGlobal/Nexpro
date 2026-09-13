const {
  COUNTER_EVENT_TYPES,
  MATCHABLE_SALE_STATUSES,
  INCIDENT_KINDS,
  INCIDENT_COPY,
  DEFAULT_MATCH_WINDOW_MINUTES,
  MIN_MATCH_WINDOW_MINUTES,
  MAX_MATCH_WINDOW_MINUTES,
} = require('../config/watchConstants');

const COUNTER_EVENT_TYPE_SET = new Set(COUNTER_EVENT_TYPES);
const MATCHABLE_SALE_STATUS_SET = new Set(MATCHABLE_SALE_STATUSES);

/**
 * Clamp the sale-matching window to 3–10 minutes (default 5).
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
const clampMatchWindowMinutes = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MATCH_WINDOW_MINUTES;
  return Math.min(
    MAX_MATCH_WINDOW_MINUTES,
    Math.max(MIN_MATCH_WINDOW_MINUTES, Math.round(parsed))
  );
};

/**
 * @param {number|string|null|undefined} minutes
 * @returns {number}
 */
const matchWindowMs = (minutes) => clampMatchWindowMinutes(minutes) * 60 * 1000;

/**
 * @param {string|null|undefined} eventType
 * @returns {boolean}
 */
const isCounterEventType = (eventType) => COUNTER_EVENT_TYPE_SET.has(String(eventType || ''));

/**
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
const isMatchableSaleStatus = (status) => MATCHABLE_SALE_STATUS_SET.has(String(status || ''));

/**
 * @param {Date|string|number} value
 * @returns {number}
 */
const toTimestamp = (value) => {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
};

/**
 * Closest unused sale within ±window of the physical event.
 * Reconciles against Sale.createdAt, not Payment.
 * @param {{ eventTime: Date|string, sales: Array<{ id: string, createdAt: Date|string, status?: string }>, windowMs: number, usedSaleIds?: Set<string> }} args
 * @returns {{ sale: object, deltaMs: number }|null}
 */
const findBestSaleMatch = ({ eventTime, sales, windowMs, usedSaleIds = new Set() }) => {
  const eventMs = toTimestamp(eventTime);
  if (!Number.isFinite(eventMs) || !Array.isArray(sales) || !Number.isFinite(windowMs)) {
    return null;
  }

  let best = null;
  for (const sale of sales) {
    if (!sale?.id || usedSaleIds.has(sale.id)) continue;
    if (sale.status && !isMatchableSaleStatus(sale.status)) continue;
    const saleMs = toTimestamp(sale.createdAt);
    if (!Number.isFinite(saleMs)) continue;
    const deltaMs = Math.abs(saleMs - eventMs);
    if (deltaMs > windowMs) continue;
    if (!best || deltaMs < best.deltaMs) {
      best = { sale, deltaMs };
    }
  }
  return best;
};

/**
 * @param {{ sale: object|null }} args
 * @returns {string}
 */
const classifyIncidentKind = ({ sale }) => (
  sale ? INCIDENT_KINDS.MATCHED : INCIDENT_KINDS.UNMATCHED_INTERACTION
);

/**
 * @param {string} kind
 * @returns {string}
 */
const copyForKind = (kind) => INCIDENT_COPY[kind] || INCIDENT_COPY[INCIDENT_KINDS.UNMATCHED_INTERACTION];

module.exports = {
  clampMatchWindowMinutes,
  matchWindowMs,
  isCounterEventType,
  isMatchableSaleStatus,
  findBestSaleMatch,
  classifyIncidentKind,
  copyForKind,
  toTimestamp,
};
