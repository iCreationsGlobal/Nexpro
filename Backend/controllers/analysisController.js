const {
  runAnalysis,
  buildUnsupportedResponse,
  classifyIntent,
  ANALYSIS_INTENTS,
  FALLBACK_SUGGESTED_QUESTIONS,
} = require('../services/analysis');
const { startHotPathTimer } = require('../utils/performanceLogger');

/**
 * POST /api/analysis/ask
 * Owned analysis engine — DB numbers only, no Anthropic.
 */
exports.ask = async (req, res, next) => {
  const finishTiming = startHotPathTimer('analysis.ask', req);
  try {
    if (!req.tenantId) {
      finishTiming({ outcome: 'validation_error' });
      return res.status(400).json({
        success: false,
        error: 'Tenant context is required',
        errorCode: 'VALIDATION_ERROR',
        code: 'VALIDATION_ERROR',
      });
    }

    const {
      message,
      question,
      intent: forceIntent,
      period,
      startDate,
      endDate,
      periodLabel,
      pageContext,
    } = req.body || {};

    const text = String(message || question || '').trim();
    if (!text && !forceIntent) {
      finishTiming({ outcome: 'validation_error' });
      return res.status(400).json({
        success: false,
        error: 'message (or question) is required',
        errorCode: 'VALIDATION_ERROR',
        code: 'VALIDATION_ERROR',
      });
    }

    const analysis = await runAnalysis(text || forceIntent, {
      tenantId: req.tenantId,
      shopFilterId: req.shopFilterId || null,
      studioLocationFilterId: req.studioLocationFilterId || null,
      period: typeof period === 'string' ? period : undefined,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
      periodLabel: typeof periodLabel === 'string' ? periodLabel : undefined,
      pageContext: typeof pageContext === 'string' ? pageContext : undefined,
      forceIntent: typeof forceIntent === 'string' ? forceIntent : undefined,
      businessType: req.tenant?.businessType,
    });

    if (analysis.route === 'analysis' && analysis.result) {
      finishTiming({ outcome: 'success', intent: analysis.classification.intent });
      return res.status(200).json({
        success: true,
        ...analysis.result,
      });
    }

    if (analysis.route === 'support' || analysis.route === 'draft') {
      finishTiming({ outcome: 'routed_to_assistant', route: analysis.route });
      return res.status(200).json({
        success: true,
        intent: analysis.classification.intent,
        route: analysis.route,
        message:
          analysis.route === 'draft'
            ? 'This looks like a draft request. Use Ask Ayebia chat for message drafts.'
            : 'This looks like an ABS how-to question. Use Ask Ayebia chat for step-by-step support.',
        answerMarkdown:
          analysis.route === 'draft'
            ? 'This looks like a draft request. Use Ask Ayebia chat for message drafts.'
            : 'This looks like an ABS how-to question. Use Ask Ayebia chat for step-by-step support.',
        metrics: {},
        reasons: [],
        meta: {
          source: 'analysis_engine',
          route: analysis.route,
          suggestedEndpoint: '/api/assistant/chat',
        },
      });
    }

    const unsupported = buildUnsupportedResponse(
      analysis.classification.suggestedQuestions || FALLBACK_SUGGESTED_QUESTIONS
    );
    finishTiming({ outcome: 'unsupported' });
    return res.status(200).json({
      success: true,
      ...unsupported,
    });
  } catch (error) {
    finishTiming({ outcome: 'error' });
    console.error('Error in analysis ask:', error?.message);
    next(error);
  }
};

/**
 * GET /api/analysis/intents — list starter intents (for chips / docs).
 */
exports.listIntents = async (req, res) => {
  res.status(200).json({
    success: true,
    data: ANALYSIS_INTENTS,
    suggestedQuestions: FALLBACK_SUGGESTED_QUESTIONS,
  });
};

/**
 * POST /api/analysis/classify — classify only (debug / clients).
 */
exports.classify = async (req, res) => {
  const text = String(req.body?.message || req.body?.question || '').trim();
  const classification = classifyIntent(text, {
    pageContext: req.body?.pageContext,
  });
  res.status(200).json({ success: true, ...classification });
};
