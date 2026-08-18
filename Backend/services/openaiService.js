const { getAssistantSupportGuide, getPageContextHint } = require('../utils/assistantSupportGuide');
const {
  ASSISTANT_DISPLAY_NAME,
  ASSISTANT_IDENTITY_RULES,
  sanitizeAssistantDisplayName,
} = require('../utils/assistantIdentity');
const { formatDecimal } = require('../utils/formatNumber');
const { parseAiJsonResponse } = require('../utils/parseAiJsonResponse');
const { buildReportAnalysisFallback } = require('../utils/reportAnalysisFallback');
const { getTenantAnthropicApiKey } = require('./tenantAiSettingsService');
const { normalizeAiProviderError, classifyAiProviderError } = require('../utils/aiProviderErrors');

let _anthropic = null;

/** Lazy-init system Anthropic client for Claude; tenant keys create isolated clients. */
function getAnthropic(apiKey) {
  if (apiKey) {
    const { Anthropic } = require('@anthropic-ai/sdk');
    return new Anthropic({ apiKey });
  }
  if (_anthropic !== null) return _anthropic;
  let key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  key = key.replace(/\r?\n/g, '');
  if (!key) return null;
  const { Anthropic } = require('@anthropic-ai/sdk');
  _anthropic = new Anthropic({ apiKey: key });
  return _anthropic;
}

/** Require Anthropic client; tenant settings override the system env key when present. */
async function requireAnthropic(options = {}) {
  const tenantKey = options.apiKey || await getTenantAnthropicApiKey(options.tenantId);
  const client = getAnthropic(tenantKey);
  if (!client) {
    const err = new Error('AI is not configured. Set ANTHROPIC_API_KEY in .env to use AI features.');
    err.code = 'OPENAI_NOT_CONFIGURED';
    throw err;
  }
  return client;
}

/**
 * Trim assistant context JSON for the system prompt (smaller payload, faster provider response).
 * @param {Object} context
 * @param {'light' | 'full'} [tier='full']
 * @returns {Object}
 */
const summarizeAssistantContext = (context, tier = 'full') => {
  if (tier === 'light') {
    const light = {
      businessType: context.businessType,
      tenantName: context.tenantName,
      workspaceContact: context.workspaceContact,
      dateFilter: context.dateFilter,
    };
    if (context.selectedPeriod) {
      light.selectedPeriod = {
        label: context.selectedPeriod.label,
        revenue: context.selectedPeriod.revenue,
        expenses: context.selectedPeriod.expenses,
        profit: context.selectedPeriod.profit,
        newCustomers: context.selectedPeriod.newCustomers,
        range: context.selectedPeriod.range,
        topProducts: (context.selectedPeriod.topProducts || []).slice(0, 3),
      };
    }
    return light;
  }

  const summarized = {
    businessType: context.businessType,
    tenantName: context.tenantName,
    workspaceContact: context.workspaceContact,
    activeShopId: context.activeShopId,
    dateFilter: context.dateFilter,
    thisMonth: context.thisMonth,
    today: context.today,
    receivables: context.receivables,
  };

  if (context.selectedPeriod) {
    summarized.selectedPeriod = {
      label: context.selectedPeriod.label,
      revenue: context.selectedPeriod.revenue,
      expenses: context.selectedPeriod.expenses,
      profit: context.selectedPeriod.profit,
      newCustomers: context.selectedPeriod.newCustomers,
      range: context.selectedPeriod.range,
      topProducts: (context.selectedPeriod.topProducts || []).slice(0, 3),
      recentSales: (context.selectedPeriod.recentSales || []).slice(0, 3),
    };
  }

  if (context.last3Months) {
    summarized.last3Months = {
      revenue: context.last3Months.revenue,
      expenses: context.last3Months.expenses,
      profit: context.last3Months.profit,
      newCustomers: context.last3Months.newCustomers,
    };
  }

  if (context.inventory) {
    summarized.inventory = {
      lowStockCount: context.inventory.lowStockCount,
      lowStockProducts: (context.inventory.lowStockProducts || []).slice(0, 5),
      topProductsThisMonth: (context.inventory.topProductsThisMonth || []).slice(0, 3),
    };
  }

  if (context.jobs) summarized.jobs = context.jobs;
  if (context.recentSales?.length) {
    summarized.recentSales = context.recentSales.slice(0, 3);
  }

  return summarized;
};

const STORE_BANNER_WIDTH = 1600;
const STORE_BANNER_HEIGHT = 500;
const STORE_BANNER_PROMPT_MAX_LENGTH = 500;

const stripMarkdownFence = (value = '') => String(value || '')
  .trim()
  .replace(/^```(?:svg|xml)?\s*/i, '')
  .replace(/```$/i, '')
  .trim();

const extractSvgMarkup = (value = '') => {
  const text = stripMarkdownFence(value);
  const match = text.match(/<svg[\s\S]*<\/svg>/i);
  return match ? match[0].trim() : '';
};

const sanitizeGeneratedSvg = (value = '') => {
  const svg = extractSvgMarkup(value);
  if (!svg || !/^<svg[\s>]/i.test(svg)) {
    const error = new Error('AI did not return a valid banner image');
    error.code = 'AI_IMAGE_INVALID_OUTPUT';
    throw error;
  }

  const sanitized = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\s(?:href|xlink:href)\s*=\s*(['"])\s*(?:javascript:|https?:\/\/|\/\/).*?\1/gi, '')
    .replace(/<svg\b([^>]*)>/i, (_match, attrs = '') => {
      const cleanedAttrs = attrs.replace(/\s(?:width|height|viewBox|xmlns|role|aria-label)\s*=\s*(['"]).*?\1/gi, '');
      return `<svg${cleanedAttrs} width="${STORE_BANNER_WIDTH}" height="${STORE_BANNER_HEIGHT}" viewBox="0 0 ${STORE_BANNER_WIDTH} ${STORE_BANNER_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Generated online store banner">`;
    });

  if (!/^<svg[\s>]/i.test(sanitized) || !/<\/svg>$/i.test(sanitized)) {
    const error = new Error('AI returned unsafe banner image markup');
    error.code = 'AI_IMAGE_INVALID_OUTPUT';
    throw error;
  }

  return sanitized;
};

/**
 * Generate an online storefront banner as SVG using the same Anthropic
 * integration that powers Ask AI. Anthropic is text-only, so this produces
 * branded vector artwork rather than photorealistic raster imagery.
 * @param {Object} options
 * @returns {Promise<{ svg: string, provider: string, model: string, format: string }>}
 */
const generateStoreBannerSvg = async ({
  prompt,
  styleHint = '',
  colorHint = '',
  storeName = '',
  category = '',
  description = '',
  businessType = 'shop',
  tenantId = null
} = {}) => {
  const safePrompt = String(prompt || '').trim().slice(0, STORE_BANNER_PROMPT_MAX_LENGTH);
  if (safePrompt.length < 8) {
    const error = new Error('Describe the banner you want in at least 8 characters');
    error.statusCode = 400;
    throw error;
  }

  const model = 'claude-sonnet-4-5-20250929';
  try {
    const anthropic = await requireAnthropic({ tenantId });
    const system = `You create safe SVG storefront banner artwork for African Business Suite.
Return only a single complete SVG. No markdown, no commentary, no scripts, no external images, no foreignObject, no embedded fonts, no clickable links.
Canvas: ${STORE_BANNER_WIDTH}x${STORE_BANNER_HEIGHT}. Use flat vector design with simple shapes, gradients, patterns, and optional short readable text. Do not imitate protected brands or include real people.`;
  const userPrompt = `Create a polished online storefront hero/banner SVG.

Store name: ${String(storeName || 'Online store').slice(0, 120)}
Business type: ${String(businessType || 'shop').slice(0, 80)}
Category: ${String(category || 'General retail').slice(0, 120)}
Description: ${String(description || '').slice(0, 300)}
Requested banner: ${safePrompt}
Style hint: ${String(styleHint || 'clean, modern, welcoming, premium').slice(0, 180)}
Color hint: ${String(colorHint || 'use the store brand color tastefully').slice(0, 120)}

Make it appropriate for a public ecommerce storefront, with good contrast and no explicit, hateful, violent, political, medical diagnosis, alcohol, gambling, or adult content.`;

  const completion = await anthropic.messages.create({
    model,
    max_tokens: 3500,
    temperature: 0.7,
    system,
    messages: [{ role: 'user', content: userPrompt }]
  });
  const rawText = completion.content?.find((b) => b.type === 'text')?.text?.trim() || '';
  return {
    svg: sanitizeGeneratedSvg(rawText),
    provider: 'anthropic',
    model,
    format: 'svg',
    width: STORE_BANNER_WIDTH,
    height: STORE_BANNER_HEIGHT
  };
  } catch (error) {
    normalizeAiProviderError(error);
  }
};

/**
 * Normalize parsed AI JSON into the Smart Report analysis shape.
 * @param {Object} aiResponse
 * @returns {Object}
 */
function normalizeReportAnalysis(aiResponse) {
  return {
    keyFindings: Array.isArray(aiResponse.keyFindings) ? aiResponse.keyFindings : [],
    performanceAnalysis:
      typeof aiResponse.performanceAnalysis === 'string'
        ? aiResponse.performanceAnalysis
        : '',
    recommendations: Array.isArray(aiResponse.recommendations)
      ? aiResponse.recommendations
      : [],
    riskAssessment: Array.isArray(aiResponse.riskAssessment)
      ? aiResponse.riskAssessment
      : [],
    growthOpportunities: Array.isArray(aiResponse.growthOpportunities)
      ? aiResponse.growthOpportunities
      : [],
    strategicSuggestions: Array.isArray(aiResponse.strategicSuggestions)
      ? aiResponse.strategicSuggestions
      : []
  };
}

/**
 * Generate AI-powered insights and recommendations for business report
 * @param {Object} reportData - The report data to analyze
 * @param {Object} options - Additional options (businessType, period, etc.)
 * @returns {Promise<Object>} AI-generated insights, recommendations, and analysis
 */
// Display names for AI prompts (user-friendly)
const BUSINESS_DISPLAY_NAMES = {
  printing_press: 'printing press',
  mechanic: 'auto repair / mechanic',
  barber: 'barber',
  salon: 'salon',
  shop: 'retail shop',
  pharmacy: 'pharmacy',
  studio: 'service business'
};

const analyzeReportData = async (reportData, options = {}) => {
  try {
    const {
      businessType = 'printing_press',
      studioType,
      period = 'selected period',
      startDate,
      endDate,
      comparisonStartDate,
      comparisonEndDate,
      comparisonLabel,
      customQuestion
    } = options;

    const effectiveType = studioType || businessType;

    // Map business type to terminology (supports studio types: mechanic, barber, salon)
    const businessTerminology = {
      printing_press: {
        items: 'services',
        sales: 'jobs',
        revenue: 'service revenue',
        analytics: 'service performance'
      },
      mechanic: {
        items: 'repairs',
        sales: 'repairs',
        revenue: 'repair revenue',
        analytics: 'repair performance'
      },
      barber: {
        items: 'services',
        sales: 'appointments',
        revenue: 'service revenue',
        analytics: 'service performance'
      },
      salon: {
        items: 'services',
        sales: 'appointments',
        revenue: 'service revenue',
        analytics: 'service performance'
      },
      shop: {
        items: 'products',
        sales: 'sales',
        revenue: 'product revenue',
        analytics: 'product performance'
      },
      pharmacy: {
        items: 'drugs',
        sales: 'prescriptions',
        revenue: 'prescription revenue',
        analytics: 'drug performance'
      }
    };

    const terms = businessTerminology[effectiveType] || businessTerminology.printing_press;
    const displayName = BUSINESS_DISPLAY_NAMES[effectiveType] || effectiveType;

    // Prepare structured data summary for AI
    const dataSummary = {
      financial: {
        revenue: reportData.revenue || 0,
        expenses: reportData.expenses || 0,
        profit: reportData.profit ?? ((reportData.revenue || 0) - (reportData.expenses || 0)),
        profitMargin: reportData.profitMargin || 0,
        revenueChange: reportData.revenueChange || 0,
        expenseChange: reportData.expenseChange || 0
      },
      period: {
        startDate,
        endDate,
        type: period,
        comparisonStartDate,
        comparisonEndDate,
        comparisonLabel
      },
      businessType: effectiveType,
      topItems: reportData.topItems || [],
      expenseBreakdown: reportData.expenseBreakdown || [],
      materials: reportData.materials || null,
      outstandingPayments: reportData.outstandingPayments || 0,
      studioMetrics: reportData.studioMetrics || null
    };

    const hasCustomQuestion = Boolean(customQuestion && String(customQuestion).trim());
    const dataBoundaryRules = hasCustomQuestion
      ? `

CRITICAL DATA BOUNDARY (free-text / custom question):
- Only cite figures, counts, percentages, and trends that appear in the Business Data Summary below (reportData).
- Do not invent, estimate beyond the given numbers, or pull in external knowledge as if it were this business's data.
- If the user asks for information that is not present in the summary (e.g. foot traffic, payroll, specific SKUs not listed, competitor data), say clearly that this report does not include that data and answer with what is available instead.
- Still fill all required JSON keys; address the user's question primarily in keyFindings, performanceAnalysis, and recommendations.`
      : '';

    // Create comprehensive prompt for AI analysis
    const systemPrompt = `You are an expert business analyst specializing in ${displayName} operations. Analyze the provided business data and generate actionable insights, recommendations, and strategic suggestions. Be specific, data-driven, and practical.${dataBoundaryRules}`;

    const userPrompt = `Analyze the following business report data for a ${displayName} business and provide:

1. **Key Findings** (3-5 bullet points highlighting the most important insights)
2. **Performance Analysis** (detailed analysis of revenue, expenses, and profitability trends)
3. **Actionable Recommendations** (5-7 specific, prioritized recommendations with expected impact)
4. **Risk Assessment** (identify potential risks and concerns)
5. **Growth Opportunities** (suggest specific opportunities for growth and improvement)
6. **Strategic Suggestions** (long-term strategic advice based on the data patterns)

Business Data Summary:
- Revenue: GHS ${formatDecimal(dataSummary.financial.revenue)}
- Expenses: GHS ${formatDecimal(dataSummary.financial.expenses)}
- Net Profit: GHS ${formatDecimal(dataSummary.financial.profit)}
- Profit Margin: ${dataSummary.financial.profitMargin.toFixed(2)}%
- Revenue Change: ${dataSummary.financial.revenueChange >= 0 ? '+' : ''}${dataSummary.financial.revenueChange.toFixed(2)}%
- Expense Change: ${dataSummary.financial.expenseChange >= 0 ? '+' : ''}${dataSummary.financial.expenseChange.toFixed(2)}%
- Period: ${startDate} to ${endDate}
- Comparison Period: ${comparisonStartDate && comparisonEndDate ? `${comparisonStartDate} to ${comparisonEndDate}` : 'previous equivalent period'}${comparisonLabel ? ` (${comparisonLabel})` : ''}
- Outstanding Payments: GHS ${formatDecimal(dataSummary.outstandingPayments)}

${dataSummary.topItems.length > 0 ? `Top Performing ${terms.items}: ${dataSummary.topItems.slice(0, 5).map(item => `${item.name || item.item} (Revenue: GHS ${formatDecimal(item.revenue || 0)})`).join(', ')}` : ''}

${dataSummary.studioMetrics ? `Studio Operations:
- Collected Revenue: GHS ${formatDecimal(dataSummary.studioMetrics.collectedRevenue || 0)}
- Booked Job Value: GHS ${formatDecimal(dataSummary.studioMetrics.bookedJobValue || 0)}
- Booked Not Collected: GHS ${formatDecimal(dataSummary.studioMetrics.bookedNotCollected || 0)}
- Jobs Created: ${dataSummary.studioMetrics.jobCount || 0}
- Average Job Value: GHS ${formatDecimal(dataSummary.studioMetrics.averageJobValue || 0)}
- Pipeline: ${JSON.stringify(dataSummary.studioMetrics.pipelineSummary || {})}
- Job Status: ${(dataSummary.studioMetrics.byStatus || []).map(row => `${row.status}: ${row.count} jobs / GHS ${formatDecimal(row.value || 0)}`).join(', ')}
- Service Mix: ${(dataSummary.studioMetrics.serviceMix || []).map(row => `${row.name}: GHS ${formatDecimal(row.revenue || 0)} (${row.quantity || 0})`).join(', ')}
Use collected revenue for financial profitability and booked job value for studio operations. Do not describe uncollected booked jobs as collected revenue.` : ''}

${dataSummary.expenseBreakdown.length > 0 ? `Expense Breakdown: ${dataSummary.expenseBreakdown.map(exp => `${exp.category}: GHS ${formatDecimal(exp.amount)}`).join(', ')}` : ''}

${dataSummary.materials ? `Materials Status: ${dataSummary.materials.totalStocks} total items, ${dataSummary.materials.stockAvailabilityRate}% availability rate` : ''}
${hasCustomQuestion ? `\nThe user also asked: "${String(customQuestion).trim()}". Address this question specifically in your analysis, while obeying the CRITICAL DATA BOUNDARY rules above.` : ''}

Provide your analysis in a structured JSON format with the following keys:
- keyFindings: array of strings
- performanceAnalysis: string (detailed paragraph)
- recommendations: array of objects with {priority: "High|Medium|Low", action: string, impact: string, reasoning: string}
- riskAssessment: array of objects with {risk: string, severity: "High|Medium|Low", mitigation: string}
- growthOpportunities: array of objects with {opportunity: string, potentialImpact: string, actionSteps: string[]}
- strategicSuggestions: array of strings

Be specific, actionable, and data-driven. Use the actual numbers from the report in your analysis. Respond with only valid JSON, no other text or markdown.`;

    const anthropic = await requireAnthropic({ tenantId: options.tenantId });
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const rawText = completion.content?.find((b) => b.type === 'text')?.text?.trim() || '';
    const parsed = parseAiJsonResponse(rawText);

    if (!parsed.ok) {
      console.warn('[AI report analysis] JSON parse failed; using deterministic fallback', {
        error: parsed.error,
        responseLength: rawText.length,
        snippet: parsed.jsonSnippet
      });
      return {
        success: true,
        analysis: buildReportAnalysisFallback(reportData, {
          businessType: effectiveType,
          startDate,
          endDate,
          period
        }),
        usedFallback: true
      };
    }

    return {
      success: true,
      analysis: normalizeReportAnalysis(parsed.value)
    };
  } catch (error) {
    if (error.aiProviderError) {
      throw error;
    }
    const classified = classifyAiProviderError(error);
    if (classified) {
      normalizeAiProviderError(error);
    }
    console.error('Error in AI report analysis:', {
      message: error.message,
      code: error.code,
      status: error.status
    });
    return {
      success: true,
      analysis: buildReportAnalysisFallback(reportData, {
        businessType: options.studioType || options.businessType || 'printing_press',
        startDate: options.startDate,
        endDate: options.endDate,
        period: options.period
      }),
      usedFallback: true
    };
  }
};

/**
 * Generate executive summary for report
 * @param {Object} reportData - The report data
 * @param {Object} options - Additional options
 * @returns {Promise<String>} Executive summary text
 */
const generateExecutiveSummary = async (reportData, options = {}) => {
  try {
    const { businessType = 'printing_press', period = 'selected period', startDate, endDate } = options;

    const prompt = `Generate a concise executive summary (2-3 paragraphs) for a ${businessType} business report covering ${startDate} to ${endDate}.

Key metrics:
- Revenue: GHS ${formatDecimal(reportData.revenue || 0)}
- Expenses: GHS ${formatDecimal(reportData.expenses || 0)}
- Profit: GHS ${formatDecimal((reportData.revenue || 0) - (reportData.expenses || 0))}
- Profit Margin: ${(reportData.profitMargin || 0).toFixed(2)}%
- Revenue Change: ${(reportData.revenueChange || 0) >= 0 ? '+' : ''}${(reportData.revenueChange || 0).toFixed(2)}%

Write in a professional, executive-friendly tone. Highlight key achievements, challenges, and strategic priorities.`;

    const anthropic = await requireAnthropic({ tenantId: options.tenantId });
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const textBlock = completion.content?.find((b) => b.type === 'text');
    return textBlock?.text?.trim() || '';
  } catch (error) {
    console.error('Error generating executive summary:', error);
    throw error;
  }
};

/**
 * Build the Ask Ayebia system prompt (advisory vs support).
 * Exported for unit tests so identity copy cannot drift back to iBIS.
 *
 * @param {Object} context
 * @param {Object} [options]
 * @returns {string}
 */
function buildChatSystemPrompt(context = {}, options = {}) {
  const businessType = options.businessType || context.businessType || 'printing_press';
  const pageContext = options.pageContext;
  const workspaceContact = context.workspaceContact || {};
  const mode = options.mode === 'advisory' ? 'advisory' : 'support';
  const pageHint = getPageContextHint(pageContext);
  const contextTier = options.contextTier || (mode === 'advisory' ? 'light' : 'full');
  const contextBlob = JSON.stringify(
    summarizeAssistantContext(context, contextTier),
    null,
    contextTier === 'light' ? 0 : 2
  );
  const tenantLabel = context.tenantName || 'this workspace';
  const identityLine =
    `You are ${ASSISTANT_DISPLAY_NAME}, the business intelligence assistant for ${tenantLabel} (${businessType} business in African Business Suite / ABS). ${ASSISTANT_IDENTITY_RULES}`;
  const smallTalkBackstop =
    `If the user is only greeting or making small talk (hi, hey, good morning, good day, how are you, who are you, wow, thanks, bye, or similar), reply in 1–2 short sentences as ${ASSISTANT_DISPLAY_NAME}. Do not write a strategy, analysis, or workspace dump unless they asked. Never invent numbers.`;

  if (mode === 'advisory') {
    return `${identityLine}

Your role for this conversation: open-ended business advice — growth, marketing, customer acquisition, strategy, forecasts, and similar questions the built-in ABS analysis engine cannot answer with exact ledger numbers.

${pageHint ? `Current screen context: ${pageHint}\n` : ''}
Workspace snapshot (optional context only; do NOT invent precise revenue/expense figures that are not present):
${contextBlob}

Workspace contact (for signatures if drafting; never invent email/phone):
${JSON.stringify(workspaceContact, null, 2)}

Rules:
- ${smallTalkBackstop}
- Give concrete, actionable advice suited to a small/medium African business of this type.
- Prefer short sections with **bold** labels and bullet lists.
- When suggesting forecasts or predictions, end with: "This is an estimate, not a guarantee."
- Do not claim ABS menu steps unless you are sure; for product how-tos, say they can ask "How do I…" in Ask ${ASSISTANT_DISPLAY_NAME}.
- Keep replies concise and practical. If you lack local market data, say so and give general best practices.
${context.dateFilter?.active
  ? `- Live numbers in the JSON are for "${context.dateFilter.periodLabel}" only (${context.dateFilter.startDate} to ${context.dateFilter.endDate}). If the user asks about a different timeframe (e.g. this year while the filter is this quarter), say that clearly, answer with selectedPeriod for the active filter, and invite them to ask again naming the timeframe (today / this week / this month / this year). Never pretend you lack all sales visibility when selectedPeriod is present.`
  : ''}`;
  }

  const supportGuide = getAssistantSupportGuide(businessType);
  return `${identityLine}

Your roles (detect from the user's message):
1. **Business advisor** — insights, summaries, comparisons, collections advice, inventory/restock ideas using ONLY the JSON data below.
2. **ABS support** — how to use the app; use the product support guide below with numbered steps and exact menu names.
3. **Message drafter** — payment reminders, promos, thank-yous; plain text, professional tone.

${pageHint ? `Current screen context: ${pageHint}\n` : ''}
${context.dateFilter?.active
  ? `IMPORTANT: The active date filter is "${context.dateFilter.periodLabel || 'Selected period'}" (${context.dateFilter.startDate} to ${context.dateFilter.endDate}). For revenue, expenses, profit, sales, and customer counts, use selectedPeriod in the JSON below—not thisMonth or today. If they ask about a different timeframe than this filter, say so in the first sentence, still answer with selectedPeriod for the active filter, and invite them to ask again naming the timeframe (today / yesterday / this week / this month / this year). Do not say you have no sales visibility when selectedPeriod is present.\n`
  : ''}
Current business data (GHS; never invent numbers not in this JSON):
${contextBlob}

Product support guide:
${supportGuide}

Workspace contact (for signatures; never invent email/phone):
${JSON.stringify(workspaceContact, null, 2)}

Formatting rules:
- ${smallTalkBackstop}
- Start with one short direct answer line when possible.
- Use **bold** for key numbers and labels.
- Use bullet lists or numbered steps (1. 2. 3.) as appropriate.
- For predictions, end with: "This is an estimate, not a guarantee."
- For receivables: if totalOutstanding is high vs (selectedPeriod?.revenue ?? thisMonth.revenue), recommend specific collection actions and name topDebtors when present.
- For low stock: use inventory.lowStockProducts when present.
- Email/SMS drafts: first line \`Subject: ...\`, blank line, then body. Sign with business name and contact when available.
- Keep replies concise. If data is missing, say what is missing instead of guessing.`;
}

/**
 * Chat with the AI assistant using conversation history and tenant context.
 * Used for in-app Q&A (e.g. "How many customers this month?", "Predict next month sales").
 * @param {Array<{ role: string, content: string }>} messages - Conversation history (user/assistant)
 * @param {Object} context - Tenant context from getAssistantContext: { businessType, tenantName, workspaceContact, thisMonth, last3Months, receivables }
 * @param {Object} options - Optional { businessType, mode: 'support' | 'advisory', apiKey, tenantId, pageContext, contextTier }
 * @returns {Promise<string>} Assistant reply text
 */
const chatWithContext = async (messages, context, options = {}) => {
  try {
    const systemPrompt = buildChatSystemPrompt(context, options);

    const anthropic = await requireAnthropic({
      tenantId: options.tenantId,
      apiKey: options.apiKey,
    });
    const claudeMessages = messages.map((m) => ({ role: m.role, content: m.content }));
    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1536,
      system: systemPrompt,
      messages: claudeMessages
    });
    const textBlock = claudeResponse.content?.find((b) => b.type === 'text');
    return sanitizeAssistantDisplayName(
      textBlock?.text?.trim() || 'I couldn\'t generate a response. Please try again.'
    );
  } catch (error) {
    console.error('Error in chatWithContext:', {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.error?.type,
    });
    const keySource = options.keySource || (options.apiKey ? 'unknown' : 'system');
    normalizeAiProviderError(error, { keySource });
  }
};

const draftAutomationRule = async ({ instruction, businessType = 'printing_press', suggestionsContext = {}, tenantId = null, tenant = null }) => {
  try {
  const allTriggers = ['invoice_due_in_days', 'invoice_overdue', 'low_stock_detected', 'low_stock_on_change', 'out_of_stock_detected', 'quote_no_response', 'quote_sent', 'customer_inactive_days', 'customer_birthday', 'customer_created', 'payment_received', 'review_request', 'job_completed', 'job_created', 'job_due_in_hours', 'daily_sales_summary', 'new_lead', 'high_value_invoice', 'invoice_sent', 'sale_completed', 'order_created', 'lead_no_contact_days', 'low_profit_margin', 'prescription_refill_due', 'task_assigned_staff', 'lead_assigned_staff', 'job_assigned_staff'];
  const { filterTriggerTypesForTenant } = require('../utils/automationBusinessType');
  const tenantForFilter = tenant || { businessType };
  const allowedTriggers = filterTriggerTypesForTenant(allTriggers, tenantForFilter);
  if (!allowedTriggers.length) {
    throw new Error('No automation triggers are available for this business type');
  }
  const allowedActions = ['create_task', 'send_email_platform', 'send_sms', 'send_whatsapp'];
  const system = `You draft automation rules for African Business Suite. Return only JSON. Never enable a rule or execute actions. Use only allowed trigger/action values.`;
  const prompt = `Create one draft automation rule from this user request:
"${instruction}"

Business type: ${businessType}
Allowed triggers: ${allowedTriggers.join(', ')}
Allowed action types: ${allowedActions.join(', ')}
Context: ${JSON.stringify(suggestionsContext)}

Return JSON with this exact shape:
{
  "name": "short rule name",
  "triggerType": "one allowed trigger",
  "triggerConfig": {},
  "conditionConfig": {},
  "scheduleConfig": {"frequency": "weekly", "cooldownHours": 168},
  "actionConfig": {"actions": []},
  "explanation": "one sentence explaining what will happen"
}

For sticky triggers (invoice_overdue, invoice_due_in_days, quote_no_response, lead_no_contact_days, customer_inactive_days, low_stock_*, job_due_in_hours), set scheduleConfig.frequency to one of: once, daily, every_n_days, weekly, monthly. Prefer weekly for invoice_overdue. For every_n_days also set intervalDays. Derive cooldownHours (daily=24, weekly=168, monthly=720, every_n_days=N*24); for once set maxSends: 1.
For WhatsApp actions, use template messages only and set "category" to "transactional" unless the user clearly asks for marketing. Use placeholder values like "{{customerName}}", "{{invoiceNumber}}", "{{balanceFormatted}}", "{{dueDate}}", "{{paymentPath}}" in parameters when appropriate. For payment_reminder, body params are customerName, invoiceNumber, balanceFormatted, dueDate and buttonParameters should include "{{paymentPath}}".`;

  const anthropic = await requireAnthropic({ tenantId });
  const completion = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: prompt }]
  });
  const rawText = completion.content?.find((b) => b.type === 'text')?.text?.trim() || '{}';
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  if (!allowedTriggers.includes(parsed.triggerType)) {
    throw new Error('AI returned an unsupported trigger type');
  }
  const actions = Array.isArray(parsed.actionConfig?.actions) ? parsed.actionConfig.actions : [];
  if (actions.some((action) => !allowedActions.includes(action?.type))) {
    throw new Error('AI returned an unsupported action type');
  }
  return {
    name: String(parsed.name || 'AI draft automation').slice(0, 160),
    triggerType: parsed.triggerType,
    triggerConfig: parsed.triggerConfig && typeof parsed.triggerConfig === 'object' && !Array.isArray(parsed.triggerConfig) ? parsed.triggerConfig : {},
    conditionConfig: parsed.conditionConfig && typeof parsed.conditionConfig === 'object' && !Array.isArray(parsed.conditionConfig) ? parsed.conditionConfig : {},
    scheduleConfig: parsed.scheduleConfig && typeof parsed.scheduleConfig === 'object' && !Array.isArray(parsed.scheduleConfig) ? parsed.scheduleConfig : { cooldownHours: 24 },
    actionConfig: { actions },
    enabled: false,
    explanation: String(parsed.explanation || 'Review and save this draft before enabling it.')
  };
  } catch (error) {
    normalizeAiProviderError(error);
  }
};

module.exports = {
  analyzeReportData,
  generateExecutiveSummary,
  buildChatSystemPrompt,
  chatWithContext,
  draftAutomationRule,
  generateStoreBannerSvg
};
