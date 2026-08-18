import { STUDIO_LIKE_TYPES } from './studioLikeTypes.js';

/**
 * Suggested prompts for ABS Assistant (web).
 * Prefer getAssistantPromptSets() so chips match business type.
 */

/** Shared retail (shop / pharmacy) business insight chips — includes stock & products. */
export const ASSISTANT_RETAIL_BUSINESS_PROMPTS = [
  'What did I sell today?',
  'How are sales this month?',
  'Who owes me money?',
  'Which products are running low?',
  "Show this month's profit",
  'What are my top products?',
  'What are my top expense categories?',
  'Compare this month to last month',
  'Why are sales down?',
  'Summarize performance',
];

/** Studio-like chips — jobs/pipeline wording; no stock/inventory/top products. */
export const ASSISTANT_STUDIO_BUSINESS_PROMPTS = [
  'How much revenue did I make today?',
  'How is revenue this month?',
  'Who owes me money?',
  'Summarize my open jobs',
  'Which jobs still need attention?',
  'Why is revenue down?',
  'Compare this period to the previous period',
  'Summarize performance',
];

/** Restaurant shop-type chips — aligned with analysis intents (top products / sales / stock). */
export const ASSISTANT_RESTAURANT_BUSINESS_PROMPTS = [
  'What meals sold best today?',
  "Summarize today's food sales",
  'What ingredients are running low?',
  'Who owes me money?',
  'What are my top expense categories?',
  'Summarize performance',
];

/** @deprecated Prefer getAssistantPromptSets — kept for any direct imports */
export const ASSISTANT_BUSINESS_PROMPTS = ASSISTANT_RETAIL_BUSINESS_PROMPTS;

export const ASSISTANT_RETAIL_SUPPORT_PROMPTS = [
  'How do I create an invoice?',
  'How do I record a payment on an invoice?',
  'How do I add an expense?',
  'How do I add a customer?',
  'How do I run a sale on POS?',
];

export const ASSISTANT_STUDIO_SUPPORT_PROMPTS = [
  'How do I create a job?',
  'How do I create an invoice?',
  'How do I record a payment on an invoice?',
  'How do I add an expense?',
  'How do I add a customer?',
];

export const ASSISTANT_PHARMACY_SUPPORT_PROMPTS = [
  'How do I create an invoice?',
  'How do I record a payment on an invoice?',
  'How do I add an expense?',
  'How do I add a customer?',
  'How do I dispense a prescription?',
];

/** @deprecated Prefer getAssistantPromptSets */
export const ASSISTANT_SUPPORT_PROMPTS = ASSISTANT_RETAIL_SUPPORT_PROMPTS;

export const ASSISTANT_RETAIL_DRAFT_PROMPTS = [
  'Draft a polite payment reminder for overdue customers',
  'Draft a short thank-you message for my best customers',
  'Draft a promotional SMS for my shop',
];

export const ASSISTANT_STUDIO_DRAFT_PROMPTS = [
  'Draft a polite payment reminder for overdue customers',
  'Draft a short thank-you message for my best customers',
  'Draft a job-ready / pickup notification for a customer',
];

/** @deprecated Prefer getAssistantPromptSets */
export const ASSISTANT_DRAFT_PROMPTS = ASSISTANT_RETAIL_DRAFT_PROMPTS;

/** Page-specific prompts when opening Ask AI from a module (filtered by type in getPagePrompts). */
export const ASSISTANT_PAGE_PROMPTS = {
  dashboard: ['Summarize performance', 'What should I restock?', 'Who owes me money?'],
  reports: [
    'Summarize performance for this period',
    'Compare this period to the previous period',
    'Why are sales down?',
  ],
  sales: ['How are sales this month?', 'What are my top products?'],
  invoices: ['Who owes me money?', 'Draft a payment reminder'],
  expenses: ['What are my top expense categories?', 'Summarize performance'],
  customers: [
    'Who owes me money?',
    "Show me customers who haven't ordered in 30 days",
    'How many new customers this month?',
  ],
  products: ['What products are low on stock?', 'What are my top products?'],
  jobs: ['Summarize my open jobs', 'Who owes me money?', 'Summarize performance'],
};

const STOCKISH = /restock|low on stock|stock|inventory|top products|ingredients are running/i;
const PRODUCTISH = /top products|best sellers|sold best/i;

/**
 * @param {string|null|undefined} businessType
 * @param {string|null|undefined} shopType
 * @returns {'studio'|'restaurant'|'pharmacy'|'shop'}
 */
export function resolveAssistantWorkspaceKind(businessType, shopType) {
  const type = businessType || 'printing_press';
  if (STUDIO_LIKE_TYPES.includes(type)) return 'studio';
  if (type === 'pharmacy') return 'pharmacy';
  if (type === 'shop' && shopType === 'restaurant') return 'restaurant';
  if (type === 'shop') return 'shop';
  return 'studio';
}

/**
 * Filter prompts that don't apply to the workspace (e.g. stock for studios).
 * @param {string[]} prompts
 * @param {'studio'|'restaurant'|'pharmacy'|'shop'} kind
 * @returns {string[]}
 */
export function filterPromptsForWorkspace(prompts, kind) {
  if (!Array.isArray(prompts)) return [];
  if (kind === 'studio') {
    return prompts.filter((p) => !STOCKISH.test(p) && !PRODUCTISH.test(p));
  }
  if (kind === 'shop' || kind === 'pharmacy') {
    return prompts.filter((p) => !/open jobs|job pipeline|create a job|job-ready/i.test(p));
  }
  return prompts;
}

/**
 * Context-aware chip sets for Ask AI home / floating panel.
 * @param {{ businessType?: string|null, shopType?: string|null }} [ctx]
 * @returns {{
 *   kind: string,
 *   business: string[],
 *   support: string[],
 *   draft: string[],
 * }}
 */
export function getAssistantPromptSets(ctx = {}) {
  const kind = resolveAssistantWorkspaceKind(ctx.businessType, ctx.shopType);

  if (kind === 'studio') {
    return {
      kind,
      business: ASSISTANT_STUDIO_BUSINESS_PROMPTS,
      support: ASSISTANT_STUDIO_SUPPORT_PROMPTS,
      draft: ASSISTANT_STUDIO_DRAFT_PROMPTS,
    };
  }
  if (kind === 'restaurant') {
    return {
      kind,
      business: ASSISTANT_RESTAURANT_BUSINESS_PROMPTS,
      support: ASSISTANT_RETAIL_SUPPORT_PROMPTS,
      draft: ASSISTANT_RETAIL_DRAFT_PROMPTS,
    };
  }
  if (kind === 'pharmacy') {
    return {
      kind,
      business: ASSISTANT_RETAIL_BUSINESS_PROMPTS.map((p) =>
        p === 'Which products are running low?' ? 'What drugs or products are low on stock?' : p
      ),
      support: ASSISTANT_PHARMACY_SUPPORT_PROMPTS,
      draft: ASSISTANT_RETAIL_DRAFT_PROMPTS,
    };
  }
  return {
    kind: 'shop',
    business: ASSISTANT_RETAIL_BUSINESS_PROMPTS,
    support: ASSISTANT_RETAIL_SUPPORT_PROMPTS,
    draft: ASSISTANT_RETAIL_DRAFT_PROMPTS,
  };
}

/**
 * Page-context chips filtered for business type.
 * @param {string|undefined} pageContext
 * @param {{ businessType?: string|null, shopType?: string|null, periodLabel?: string }} [opts]
 * @returns {string[]}
 */
export function getPagePrompts(pageContext, opts = {}) {
  if (!pageContext) return [];
  const kind = resolveAssistantWorkspaceKind(opts.businessType, opts.shopType);
  let base = [...(ASSISTANT_PAGE_PROMPTS[pageContext] || [])];

  if (kind === 'studio') {
    if (pageContext === 'dashboard') {
      base = ['Summarize performance', 'Summarize my open jobs', 'Who owes me money?'];
    } else if (pageContext === 'sales') {
      base = ['How is revenue this month?', 'Summarize performance'];
    } else if (pageContext === 'products') {
      base = ['Summarize performance', 'Who owes me money?'];
    } else if (pageContext === 'reports') {
      base = [
        `Summarize performance for ${opts.periodLabel || 'this period'}`,
        'Compare this period to the previous period',
        'Why is revenue down?',
      ];
    }
  }

  return filterPromptsForWorkspace(base, kind);
}

/**
 * Map a prompt string to a short card title + icon key for the Ask AI home UI.
 * @param {string} prompt
 * @returns {{ title: string, icon: string }}
 */
function suggestionMetaForPrompt(prompt) {
  const p = String(prompt || '');
  if (/owe|collect|outstanding|overdue/i.test(p)) {
    return { title: 'Collections', icon: 'users' };
  }
  if (/restock|low on stock|running low|ingredients|drugs or products/i.test(p)) {
    return { title: 'Low stock items', icon: 'package' };
  }
  if (/meals sold|sold best/i.test(p)) {
    return { title: 'Top meals', icon: 'utensils' };
  }
  if (/profit/i.test(p)) {
    return { title: 'Profit', icon: 'trending' };
  }
  if (/expense categor|top expenses/i.test(p)) {
    return { title: 'Expenses', icon: 'wallet' };
  }
  if (/top products|best sellers/i.test(p)) {
    return { title: 'Top products', icon: 'award' };
  }
  if (/open jobs|still need attention|job pipeline/i.test(p)) {
    return { title: 'Open jobs', icon: 'briefcase' };
  }
  if (/new customers|inactive customers|haven'?t ordered/i.test(p)) {
    return { title: 'Customers', icon: 'users' };
  }
  if (/today|sold today|sell today|revenue did I make today|food sales/i.test(p)) {
    return { title: "Today's sales", icon: 'shopping' };
  }
  if (/this month|sales this month|revenue this month/i.test(p)) {
    return { title: 'This month', icon: 'calendar' };
  }
  if (/summarize|performance|summary/i.test(p)) {
    return { title: 'Monthly summary', icon: 'file' };
  }
  if (/compare|previous period|last month|why are sales|why is revenue/i.test(p)) {
    return { title: 'Performance', icon: 'trending' };
  }
  if (/top customers/i.test(p)) {
    return { title: 'Top customers', icon: 'users' };
  }
  return { title: 'Ask Ayebia', icon: 'sparkles' };
}

/**
 * Card suggestions for Ask AI empty state — driven by business-type prompt sets.
 * Product businesses never get open-jobs cards; studios can.
 *
 * @param {{ businessType?: string|null, shopType?: string|null, limit?: number }} [ctx]
 * @returns {Array<{ id: string, title: string, prompt: string, icon: string }>}
 */
export function getAssistantSuggestionCards(ctx = {}) {
  const { business } = getAssistantPromptSets(ctx);
  const limit = Number.isFinite(ctx.limit) ? ctx.limit : 5;
  const kind = resolveAssistantWorkspaceKind(ctx.businessType, ctx.shopType);

  // Prefer a curated order of themes so the carousel reads well.
  const preferredMatchers =
    kind === 'studio'
      ? [
          /revenue did I make today|sold today/i,
          /owe|collect/i,
          /open jobs|still need attention/i,
          /summarize performance|summarize my/i,
          /revenue this month|sales this month/i,
        ]
      : kind === 'restaurant'
        ? [
            /sold best today|food sales/i,
            /ingredients|running low/i,
            /owe|collect/i,
            /expense categor|top expenses/i,
            /summarize performance/i,
          ]
        : [
            /sell today|sold today|what did I sell/i,
            /restock|running low|low on stock/i,
            /profit|sales this month/i,
            /owe|collect/i,
            /compare|last month|previous period/i,
          ];

  const picked = [];
  const used = new Set();

  for (const matcher of preferredMatchers) {
    const found = business.find((prompt) => matcher.test(prompt) && !used.has(prompt));
    if (found) {
      used.add(found);
      picked.push(found);
    }
    if (picked.length >= limit) break;
  }

  for (const prompt of business) {
    if (picked.length >= limit) break;
    if (used.has(prompt)) continue;
    used.add(prompt);
    picked.push(prompt);
  }

  return picked.map((prompt, index) => {
    const meta = suggestionMetaForPrompt(prompt);
    return {
      id: `${kind}-${index}-${meta.icon}`,
      title: meta.title,
      prompt,
      icon: meta.icon,
    };
  });
}
