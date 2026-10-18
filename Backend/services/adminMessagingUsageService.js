const { sequelize } = require('../config/database');
const {
  getCurrentYearMonth,
  getNextResetAt,
  getMonthlyLimit,
} = require('./platformSmsUsageService');
const { testPlatformSmsConnection } = require('./platformSmsSettingsService');

const DEFAULT_PERIOD_DAYS = 30;

const isMissingUsageTableError = (error) => {
  const code = error?.parent?.code || error?.original?.code;
  const message = String(error?.message || error?.parent?.message || '');
  return code === '42P01' || /relation ["']?tenant_platform_sms_usage["']? does not exist/i.test(message);
};

/**
 * Parse ISO date or return null.
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
function parseIsoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Resolve period bounds. Defaults to last 30 days ending now.
 * @param {{ from?: string, to?: string, defaultDays?: number }} options
 * @returns {{ from: Date, to: Date }}
 */
function resolvePeriodBounds({ from, to, defaultDays = DEFAULT_PERIOD_DAYS } = {}) {
  const toDate = parseIsoDate(to) || new Date();
  let fromDate = parseIsoDate(from);
  if (!fromDate) {
    fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - defaultDays);
  }
  return { from: fromDate, to: toDate };
}

/**
 * @param {number} sentCount
 * @param {number} monthlyLimit
 * @returns {{ sentCount: number, monthlyLimit: number, remaining: number, percentUsed: number }}
 */
function computeSmsUsageMetrics(sentCount, monthlyLimit) {
  const sent = Math.max(0, parseInt(sentCount, 10) || 0);
  const limit = Math.max(0, parseInt(monthlyLimit, 10) || 0);
  const remaining = Math.max(0, limit - sent);
  const percentUsed = limit > 0 ? Math.min(100, Math.round((sent / limit) * 100)) : 0;
  return { sentCount: sent, monthlyLimit: limit, remaining, percentUsed };
}

/**
 * Platform SMS usage rows for a calendar month (Africa/Accra yearMonth).
 * @param {{ yearMonth?: string }} options
 */
async function getPlatformSmsUsageByTenant({ yearMonth } = {}) {
  const month = yearMonth || getCurrentYearMonth();
  const monthlyLimit = await getMonthlyLimit();

  let rows = [];
  try {
    const [usageRows] = await sequelize.query(
      `
        SELECT
          u.tenant_id AS "tenantId",
          t.name AS "tenantName",
          u.sent_count AS "sentCount"
        FROM tenant_platform_sms_usage u
        LEFT JOIN tenants t ON t.id = u.tenant_id
        WHERE u.year_month = :yearMonth
        ORDER BY u.sent_count DESC, t.name ASC NULLS LAST
      `,
      { replacements: { yearMonth: month } }
    );
    rows = usageRows || [];
  } catch (error) {
    if (!isMissingUsageTableError(error)) throw error;
  }

  const byTenant = rows.map((row) => {
    const metrics = computeSmsUsageMetrics(row.sentCount, monthlyLimit);
    return {
      tenantId: row.tenantId,
      tenantName: row.tenantName || 'Unknown tenant',
      yearMonth: month,
      ...metrics,
    };
  });

  const sentTotal = byTenant.reduce((sum, row) => sum + row.sentCount, 0);
  const remainingTotal = byTenant.reduce((sum, row) => sum + row.remaining, 0);

  return {
    yearMonth: month,
    monthlyLimit,
    resetsAt: getNextResetAt(),
    totals: {
      sentCount: sentTotal,
      remaining: remainingTotal,
      tenantCount: byTenant.length,
    },
    byTenant,
  };
}

/**
 * Sanitize SMS provider balance payload — no secrets.
 * @param {object|null} data
 */
function sanitizeBalancePayload(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    smsBalance: data.sms_balance ?? data.smsBalance ?? data.balance ?? null,
    mainBalance: data.main_balance ?? data.mainBalance ?? null,
    currency: data.currency || null,
    bonus: data.bonus ?? null,
    raw: {
      sms_balance: data.sms_balance ?? data.smsBalance ?? data.balance ?? null,
      main_balance: data.main_balance ?? data.mainBalance ?? null,
      bonus: data.bonus ?? null,
    },
  };
}

/**
 * Refresh active platform SMS provider wallet/credits using saved settings.
 * @param {{ userId?: string, requestId?: string }} meta
 */
async function fetchPlatformSmsProviderBalance(meta = {}) {
  try {
    const result = await testPlatformSmsConnection({
      payload: {},
      userId: meta.userId,
      requestId: meta.requestId,
    });
    const provider = result.provider || 'arkesel';
    return {
      ok: true,
      provider,
      message: result.message,
      balance: sanitizeBalancePayload(result.data),
    };
  } catch (error) {
    return {
      ok: false,
      provider: null,
      message: error.message || 'Failed to fetch SMS provider balance',
      balance: null,
    };
  }
}

/**
 * GET /api/admin/messaging/usage payload: platform SMS quota per tenant, optional provider balance.
 * @param {{ yearMonth?: string, from?: string, to?: string, includeBalance?: string|boolean }} query
 * @param {{ userId?: string, requestId?: string }} meta
 * @returns {Promise<{ yearMonth: string, period: { from: string, to: string }, platformSms: object, balance: object|null }>}
 */
async function getMessagingUsage(query = {}, meta = {}) {
  const period = resolvePeriodBounds({ from: query.from, to: query.to });
  const yearMonth = query.yearMonth || getCurrentYearMonth();
  const includeBalance = query.includeBalance === '1'
    || query.includeBalance === 'true'
    || query.includeBalance === true;

  const [platformSms, balance] = await Promise.all([
    getPlatformSmsUsageByTenant({ yearMonth }),
    includeBalance ? fetchPlatformSmsProviderBalance(meta) : Promise.resolve(null),
  ]);

  return {
    yearMonth: platformSms.yearMonth,
    period: {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    },
    platformSms,
    balance,
  };
}

module.exports = {
  DEFAULT_PERIOD_DAYS,
  parseIsoDate,
  resolvePeriodBounds,
  computeSmsUsageMetrics,
  getPlatformSmsUsageByTenant,
  sanitizeBalancePayload,
  fetchPlatformSmsProviderBalance,
  getMessagingUsage,
};
