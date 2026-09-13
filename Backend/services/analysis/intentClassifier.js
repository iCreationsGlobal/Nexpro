const {
  ANALYSIS_INTENT_IDS,
  FALLBACK_SUGGESTED_QUESTIONS,
  getFallbackSuggestedQuestions,
} = require('./intentCatalog');

/**
 * Rules-first intent classifier (regex / keywords). No LLM.
 * Returns analysis intents, support/draft, advisory (tenant-key LLM), or unsupported.
 *
 * @param {string} message
 * @param {{ pageContext?: string, businessType?: string }} [options]
 * @returns {{
 *   intent: string | null,
 *   confidence: number,
 *   route: 'analysis' | 'support' | 'draft' | 'advisory' | 'unsupported',
 *   suggestedQuestions?: string[],
 * }}
 */
function classifyIntent(message, options = {}) {
  const text = String(message || '').trim().toLowerCase();
  const suggestions = getFallbackSuggestedQuestions(options.businessType);
  if (!text) {
    return {
      intent: null,
      confidence: 0,
      route: 'unsupported',
      suggestedQuestions: suggestions,
    };
  }

  const isAbsProductAction = /\b(create an? invoice|record a payment|add an? expense|add a customer|run (a |the )?pos|make a (new )?sale|create a job|dispense|in abs|in the app|settings|navigate|menu)\b/.test(text);
  const isGrowthOrStrategy = (
    /\b(more customers?|get (more )?customers?|attract customers?|grow (my |the )?business|increase (my )?sales|marketing tips?|marketing strateg|business strateg)\b/.test(text)
    || /\b(customer acquisition|lead generation|brand awareness|social media (tips?|strateg|marketing))\b/.test(text)
  );

  // Growth / strategy — tenant Anthropic key in Ask AI (before product how-to)
  if (isGrowthOrStrategy && !isAbsProductAction) {
    return { intent: 'business_advisory', confidence: 0.9, route: 'advisory' };
  }

  // Support / how-to — Anthropic with tenant → system fallback
  if (
    /\b(how do i|how to|where (is|can|do)|help me (set|add|create|find|use)|show me how|navigate|steps to|walk me through)\b/.test(text)
    || /\b(create an? invoice|record a payment|add an? expense|add a customer|run (a |the )?pos|make a (new )?sale|create a job|dispense)\b/.test(text)
  ) {
    return { intent: 'support_howto', confidence: 0.85, route: 'support' };
  }

  // Draft / compose — keep Claude path
  if (
    /\b(draft|write|compose|write me|craft)\b/.test(text)
    && /\b(reminder|message|email|sms|whatsapp|thank[- ]?you|promotional|promo|newsletter|template|job[- ]?ready|pickup)\b/.test(text)
  ) {
    return { intent: 'draft_message', confidence: 0.85, route: 'draft' };
  }

  // Predictions / forecasts — advisory BEFORE sales period patterns
  // ("Predict next month's revenue" must not match sales_this_month via month's + revenue)
  if (
    /\b(predict|forecast|projection|projected)\b/.test(text)
    || /\b(will i sell|next week'?s? (sales?|revenue)|what will (sales?|revenue))\b/.test(text)
    || (/\bnext (month|week|quarter|year)\b/.test(text)
      && /\b(sales?|revenue|profit|earn|predict|forecast)\b/.test(text))
  ) {
    return {
      intent: 'business_advisory',
      confidence: 0.7,
      route: 'advisory',
      suggestedQuestions: suggestions,
    };
  }

  // Why sales down — check before generic sales compare
  if (
    /\b(why|what caused|reason|reasons)\b/.test(text)
    && /\b(sales?|revenue|performance)\b/.test(text)
    && /\b(down|drop(ped|ping)?|declin(e|ed|ing)|lower|fell|fall(ing)?|decreas(e|ed|ing)|slow)\b/.test(text)
  ) {
    return { intent: 'why_sales_down', confidence: 0.92, route: 'analysis' };
  }

  // Expenses by category — before top_products ("top expenses" must not misroute)
  if (
    /\b(top expenses?|expense categories?|expenses? by category|biggest expenses?|spending by category|where (is|does) (my |the )?money go)\b/.test(text)
    || (/\bexpenses?\b/.test(text) && /\b(top|category|categories|breakdown|split)\b/.test(text))
  ) {
    return { intent: 'expenses_by_category', confidence: 0.9, route: 'analysis' };
  }

  // Inactive customers (30d default)
  if (
    /\b(inactive customers?|haven'?t (ordered|bought|purchased|shopped)|customers? who haven'?t|no (orders?|purchases?) in|dormant customers?)\b/.test(text)
    || (/\bcustomers?\b/.test(text) && /\b(30 days?|inactive|haven'?t|not (ordered|bought))\b/.test(text))
  ) {
    return { intent: 'inactive_customers', confidence: 0.9, route: 'analysis' };
  }

  // New customers for period
  if (
    /\b(new customers?|customers? (this|today|yesterday|last)|how many customers? (did i |have i )?(get|gain|add))\b/.test(text)
    || (/\bcustomers?\b/.test(text) && /\b(new|acquired|signed up|joined)\b/.test(text)
      && !/\b(get more|attract|acquisition)\b/.test(text))
  ) {
    return { intent: 'new_customers', confidence: 0.88, route: 'analysis' };
  }

  // Rental operations — before studio jobs / generic stock
  if (
    /\b(rentals?|hire|hired)\b/.test(text)
    && /\b(due back|due today|return(ing)? today|back today)\b/.test(text)
  ) {
    return { intent: 'rentals_due_today', confidence: 0.92, route: 'analysis' };
  }

  if (
    /\b(overdue rentals?|rentals? (are )?overdue|show overdue rentals?)\b/.test(text)
    || (/\boverdue\b/.test(text) && /\brentals?\b/.test(text))
  ) {
    return { intent: 'rentals_overdue', confidence: 0.92, route: 'analysis' };
  }

  if (
    /\b(damage|damaged|repair)\b/.test(text)
    && /\b(items?|products?|equipment|most)\b/.test(text)
  ) {
    return { intent: 'rental_damage', confidence: 0.9, route: 'analysis' };
  }

  if (
    /\brental revenue\b/.test(text)
    || (/\b(rentals?|hire)\b/.test(text) && /\b(revenue|income|earned)\b/.test(text))
  ) {
    return { intent: 'rental_revenue_month', confidence: 0.9, route: 'analysis' };
  }

  // Studio job pipeline — analysis (not support/Anthropic)
  if (
    /\b(open jobs?|job pipeline|jobs? (still )?need|which jobs|outstanding jobs?|summarize (my )?open jobs?|jobs? (awaiting|pending|in progress))\b/.test(text)
  ) {
    return { intent: 'job_pipeline', confidence: 0.9, route: 'analysis' };
  }

  // Receivables / who owes
  if (
    /\b(who owes|owes me|outstanding|receivables?|overdue invoices?|unpaid invoices?|who has overdue)\b/.test(text)
    || /\b(debtors?|money owed|balances? due)\b/.test(text)
  ) {
    if (/\bwho owes\b/.test(text) || /\bowes me\b/.test(text)) {
      return { intent: 'who_owes_me', confidence: 0.93, route: 'analysis' };
    }
    return { intent: 'receivables_summary', confidence: 0.9, route: 'analysis' };
  }

  // Low stock / restock
  if (
    /\b(low stock|out of stock|restock|reorder|running low|stock alerts?|what (should|can) i (restock|reorder)|drugs? or products are low|ingredients? (are )?(running )?low)\b/.test(text)
    || (/\b(stock|inventory|ingredients?)\b/.test(text) && /\b(low|alert|short|need)\b/.test(text))
  ) {
    return { intent: 'low_stock', confidence: 0.9, route: 'analysis' };
  }

  // Top products / best sellers (plural) — exclude expense phrasing
  if (
    !/\bexpenses?\b/.test(text)
    && (
      /\b(top products?|best[- ]?sellers?|best[- ]?sell(er|ing)|top sell(er|ing)|biggest (revenue )?drivers?|meals? sold best|what meals? sold)\b/.test(text)
      || (/\b(products?|meals?)\b/.test(text) && /\b(top|best|leading|highest)\b/.test(text))
      || /\bwhat('s| is| are) (my )?top\b/.test(text)
    )
  ) {
    return { intent: 'top_products', confidence: 0.9, route: 'analysis' };
  }

  // Sales vs prior period — include quarter / last week / last quarter wording
  if (
    /\b(compare|vs\.?|versus|against|previous period|prior period|last (month|week|quarter|period|year)|vs last)\b/.test(text)
    && /\b(sales?|revenue|period|performance|this (month|week|quarter|period|year)|quarter)\b/.test(text)
  ) {
    return { intent: 'sales_vs_prior_period', confidence: 0.88, route: 'analysis' };
  }

  // Profit questions → period sales metrics (not advisory)
  if (
    /\b(how much profit|what('s| is) (my |the )?profit|net profit|profit (this|today|yesterday|last|for)|how profitable|profit for|show .{0,24}profit)\b/.test(text)
    || (/\bprofit\b/.test(text) && /\b(how much|make|made|earn|earned|did i|show|this month)\b/.test(text))
  ) {
    if (/\b(today|todays)\b/.test(text)) {
      return { intent: 'sales_today', confidence: 0.9, route: 'analysis' };
    }
    return { intent: 'sales_this_month', confidence: 0.88, route: 'analysis' };
  }

  // Sales today
  if (
    /\b(today|todays)\b/.test(text)
    && /\b(sales?|sold|sell|revenue|performance|earn(ed|ings)?|take[- ]?home|how much|did i make|food sales|what did i)\b/.test(text)
  ) {
    return { intent: 'sales_today', confidence: 0.9, route: 'analysis' };
  }
  // Bare "how much did I sell" defaults to today only when no other timeframe is named
  if (
    (/^(how much (did i )?(sell|make))\b/.test(text)
      && !/\b(this (week|month|quarter|year+)|year[- ]?to[- ]?date|\bytd\b|yesterday|last (week|month|quarter|year)|this period)\b/.test(text))
    || /^(sales today|today'?s sales)\b/.test(text)
  ) {
    return { intent: 'sales_today', confidence: 0.88, route: 'analysis' };
  }

  // Sales this month — exclude "next month" (forecast) and prefer last/yesterday via period align
  if (
    /\b(this month|month'?s)\b/.test(text)
    && !/\bnext month\b/.test(text)
    && /\b(sales?|sold|revenue|performance|earn(ed|ings)?|how (are|is)|summarize)\b/.test(text)
  ) {
    return { intent: 'sales_this_month', confidence: 0.88, route: 'analysis' };
  }

  // Yesterday / last week / last month sales → period sales (dates resolved in orchestrator)
  if (
    /\b(yesterday|last week|last month|last quarter)\b/.test(text)
    && /\b(sales?|sold|revenue|performance|earn(ed|ings)?|how much|profit|make|made)\b/.test(text)
  ) {
    return { intent: 'sales_this_month', confidence: 0.87, route: 'analysis' };
  }

  // "What should I work on / focus on" based on sales or business performance
  if (
    /\b(work on|focus on|improve|priorit(y|ies)|what (do|should) i (need to )?(work|focus|improve))\b/.test(text)
    && /\b(sales?|revenue|business|performance)\b/.test(text)
  ) {
    return { intent: 'performance_summary', confidence: 0.86, route: 'analysis' };
  }

  // Sales for week / quarter / year / YTD — analysis uses selected or mentioned period
  if (
    /\b(this (week|quarter|year+)|year[- ]?to[- ]?date|\bytd\b|this period)\b/.test(text)
    && /\b(sales?|sell|sold|revenue|performance|earn(ed|ings)?|how (are|is)|summarize|based on|how much)\b/.test(text)
  ) {
    return { intent: 'sales_this_month', confidence: 0.86, route: 'analysis' };
  }

  // Performance summary (dashboard-friendly)
  if (
    /\b(summarize|summary|overview|how (is|are) (my |the )?business|performance summary|dashboard insight)\b/.test(text)
    || (options.pageContext === 'dashboard' && /\b(summarize|insight|focus|performance)\b/.test(text))
  ) {
    return { intent: 'performance_summary', confidence: 0.82, route: 'analysis' };
  }

  // Explicit performance_summary prompt from dashboard card
  if (/\bperformance_summary\b/.test(text) || text === 'performance summary') {
    return { intent: 'performance_summary', confidence: 0.99, route: 'analysis' };
  }

  // Bare greetings are handled by smallTalk in assistant chat (before this classifier).
  // Analysis API still maps advisory/unsupported to suggestion-only responses.

  // Open-ended / unknown questions → advisory for Ask AI (tenant Anthropic key required)
  return {
    intent: 'business_advisory',
    confidence: 0.25,
    route: 'advisory',
    suggestedQuestions: suggestions,
  };
}

/**
 * @param {string|null} intentId
 * @returns {boolean}
 */
function isAnalysisIntent(intentId) {
  return ANALYSIS_INTENT_IDS.has(intentId);
}

module.exports = {
  classifyIntent,
  isAnalysisIntent,
};
