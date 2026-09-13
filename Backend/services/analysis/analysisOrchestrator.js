const { classifyIntent, isAnalysisIntent } = require('./intentClassifier');
const { FALLBACK_SUGGESTED_QUESTIONS } = require('./intentCatalog');
const { buildAnswerMarkdown, buildDashboardInsightCard, templateUnsupported } = require('./answerTemplates');
const { resolvePeriodAutoAlign } = require('./periodMention');
const { buildSalesDropReasons } = require('./reasons/salesDrop');
const {
  getSalesToday,
  getSalesThisMonth,
  getSalesVsPriorPeriod,
} = require('./metrics/sales');
const { getTopProducts, getTopProductCompare } = require('./metrics/topProducts');
const { getReceivables } = require('./metrics/receivables');
const { getLowStock } = require('./metrics/lowStock');
const { getExpensesByCategory } = require('./metrics/expensesByCategory');
const { getNewCustomers, getInactiveCustomers } = require('./metrics/customers');
const { getJobPipeline } = require('./metrics/jobs');
const {
  getRentalsDueToday,
  getOverdueRentals,
  getTopDamageProducts,
  getRentalRevenueForPeriod,
  getRentalPerformanceSummary,
} = require('./metrics/rentals');
const {
  resolveAnalysisPeriod,
  getEqualLengthPriorPeriod,
} = require('./metrics/dates');

/**
 * Progressive-friendly analysis DTO.
 * @param {Object} params
 */
function buildAnalysisDto({
  intent,
  confidence,
  metrics,
  reasons = [],
  answerMarkdown,
  insight = null,
  extraMeta = {},
}) {
  return {
    intent,
    confidence,
    answerMarkdown,
    message: answerMarkdown,
    metrics,
    reasons,
    insight,
    meta: {
      intent,
      confidence,
      source: 'analysis_engine',
      reasons,
      metrics,
      ...extraMeta,
    },
  };
}

/**
 * Fetch metrics for a classified analysis intent.
 * @param {string} intent
 * @param {Object} ctx
 */
async function fetchMetricsForIntent(intent, ctx) {
  switch (intent) {
    case 'sales_today':
      return getSalesToday(ctx);
    case 'sales_this_month':
      return getSalesThisMonth(ctx);
    case 'sales_vs_prior_period':
      return getSalesVsPriorPeriod(ctx);
    case 'why_sales_down': {
      const compare = await getSalesVsPriorPeriod(ctx);
      const currentRange = resolveAnalysisPeriod(
        { ...ctx, defaultPeriod: 'month' },
        ctx.now
      );
      const priorRange = getEqualLengthPriorPeriod(currentRange.start, currentRange.end);
      const topCompare = await getTopProductCompare(ctx, currentRange, priorRange);
      return {
        ...compare,
        compare,
        topProduct: {
          priorName: topCompare.priorTop?.productName,
          priorRevenue: topCompare.priorTop?.totalRevenue,
          currentRevenue: topCompare.currentSameAsPrior?.totalRevenue ?? 0,
        },
      };
    }
    case 'top_products':
      return getTopProducts(ctx);
    case 'expenses_by_category':
      return getExpensesByCategory(ctx);
    case 'new_customers':
      return getNewCustomers(ctx);
    case 'inactive_customers':
      return getInactiveCustomers(ctx);
    case 'job_pipeline':
      return getJobPipeline(ctx);
    case 'rentals_due_today':
      return getRentalsDueToday(ctx);
    case 'rentals_overdue':
      return getOverdueRentals(ctx);
    case 'rental_damage':
      return getTopDamageProducts(ctx);
    case 'rental_revenue_month':
      return getRentalRevenueForPeriod(ctx);
    case 'receivables_summary':
    case 'who_owes_me':
      return getReceivables(ctx);
    case 'low_stock':
      return getLowStock(ctx);
    case 'performance_summary': {
      if (ctx.businessType === 'rental') {
        return getRentalPerformanceSummary(ctx);
      }
      const [compare, lowStock, receivables] = await Promise.all([
        getSalesVsPriorPeriod(ctx),
        getLowStock(ctx),
        getReceivables(ctx),
      ]);
      return {
        current: compare.current,
        prior: compare.prior,
        changes: compare.changes,
        lowStockCount: lowStock.lowStockCount || 0,
        receivables,
      };
    }
    default:
      return {};
  }
}

/**
 * Run classify → fetch → reasons → templated DTO.
 * Never calls Anthropic.
 *
 * Period choice (#7 / #15): when the user names a resolvable relative period
 * (yesterday / last week / last month / this year / …) that differs from the
 * Ask AI chip, auto-align analysis dates to that mention and note the chip change.
 *
 * @param {string} message
 * @param {{
 *   tenantId: string,
 *   shopFilterId?: string|null,
 *   studioLocationFilterId?: string|null,
 *   period?: string,
 *   startDate?: string,
 *   endDate?: string,
 *   periodLabel?: string,
 *   pageContext?: string,
 *   forceIntent?: string,
 * }} context
 * @returns {Promise<{ route: string, result?: Object, classification: Object }>}
 */
async function runAnalysis(message, context = {}) {
  const classification = context.forceIntent && isAnalysisIntent(context.forceIntent)
    ? { intent: context.forceIntent, confidence: 1, route: 'analysis' }
    : classifyIntent(message, {
      pageContext: context.pageContext,
      businessType: context.businessType,
    });

  if (classification.route !== 'analysis' || !isAnalysisIntent(classification.intent)) {
    return { route: classification.route, classification };
  }

  const chipLabel = context.periodLabel;
  const autoAlign = resolvePeriodAutoAlign(message, chipLabel, context.now);
  const periodInput = autoAlign?.override
    ? {
      period: autoAlign.override.period,
      startDate: autoAlign.override.startDate,
      endDate: autoAlign.override.endDate,
      periodLabel: autoAlign.override.periodLabel,
      defaultPeriod:
        classification.intent === 'sales_today' ? 'today' : 'month',
    }
    : {
      period: context.period,
      startDate: context.startDate,
      endDate: context.endDate,
      periodLabel: context.periodLabel,
      defaultPeriod:
        classification.intent === 'sales_today' ? 'today' : 'month',
    };

  const resolvedPeriod = resolveAnalysisPeriod(periodInput, context.now);

  const ctx = {
    tenantId: context.tenantId,
    shopFilterId: context.shopFilterId || null,
    studioLocationFilterId: context.studioLocationFilterId || null,
    businessType: context.businessType || null,
    period: resolvedPeriod.periodKey,
    startDate: resolvedPeriod.startDate,
    endDate: resolvedPeriod.endDate,
    periodLabel: resolvedPeriod.label,
    now: context.now,
  };

  const metrics = await fetchMetricsForIntent(classification.intent, ctx);
  let reasons = [];
  let reasonsResult = null;

  if (classification.intent === 'why_sales_down') {
    reasonsResult = buildSalesDropReasons({
      current: metrics.current,
      prior: metrics.prior,
      topProduct: metrics.topProduct,
    });
    reasons = reasonsResult.reasons;
  }

  let answerMarkdown = buildAnswerMarkdown(classification.intent, metrics, { reasonsResult });
  if (autoAlign?.leadIn) {
    answerMarkdown = `${autoAlign.leadIn}\n\n${answerMarkdown}`;
  }
  const insight =
    classification.intent === 'performance_summary'
      ? buildDashboardInsightCard(metrics)
      : null;

  return {
    route: 'analysis',
    classification,
    result: buildAnalysisDto({
      intent: classification.intent,
      confidence: classification.confidence,
      metrics,
      reasons,
      answerMarkdown,
      insight,
      extraMeta: {
        period: resolvedPeriod.periodKey,
        periodLabel: resolvedPeriod.label,
        startDate: resolvedPeriod.startDate,
        endDate: resolvedPeriod.endDate,
        periodMismatch: Boolean(autoAlign?.leadIn),
        periodAutoAligned: Boolean(autoAlign?.override),
      },
    }),
  };
}

/**
 * Unsupported / non-analysis helper message.
 */
function buildUnsupportedResponse(suggestedQuestions = FALLBACK_SUGGESTED_QUESTIONS) {
  const answerMarkdown = templateUnsupported(suggestedQuestions);
  return buildAnalysisDto({
    intent: null,
    confidence: 0,
    metrics: {},
    reasons: [],
    answerMarkdown,
    extraMeta: {
      source: 'analysis_engine',
      unsupported: true,
      suggestedQuestions,
    },
  });
}

module.exports = {
  runAnalysis,
  fetchMetricsForIntent,
  buildAnalysisDto,
  buildUnsupportedResponse,
};
