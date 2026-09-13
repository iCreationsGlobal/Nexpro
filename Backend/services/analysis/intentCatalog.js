/**
 * Starter intents for the owned analysis engine (Phase 1+).
 * Numbers always come from DB/queries — never from an LLM.
 */

/** @typedef {{ id: string, label: string, description: string, suggestedQuestions: string[], category: 'analysis' | 'support' | 'draft' }} AnalysisIntent */

/** @type {AnalysisIntent[]} */
const ANALYSIS_INTENTS = [
  {
    id: 'sales_today',
    label: 'Sales today',
    description: 'Revenue, expenses, and profit for today',
    suggestedQuestions: [
      "How much did I sell today?",
      "Summarize today's sales",
      "What are today's sales?",
    ],
    category: 'analysis',
  },
  {
    id: 'sales_this_month',
    label: 'Sales this month',
    description: 'Revenue, expenses, and profit for the current month',
    suggestedQuestions: [
      'How are sales this month?',
      'Revenue this month',
      'Summarize this month',
    ],
    category: 'analysis',
  },
  {
    id: 'sales_vs_prior_period',
    label: 'Compare to prior period',
    description: 'Selected or current period vs the previous equivalent period',
    suggestedQuestions: [
      'Compare this period to the previous period',
      'Sales vs last month',
      'Compare this quarter to last quarter',
    ],
    category: 'analysis',
  },
  {
    id: 'why_sales_down',
    label: 'Why sales are down',
    description: 'Checklist diagnosis when sales declined vs prior period',
    suggestedQuestions: [
      'Why are sales down?',
      'Why did sales drop?',
      'What caused the sales decline?',
    ],
    category: 'analysis',
  },
  {
    id: 'top_products',
    label: 'Top products',
    description: 'Best-selling products by revenue in the period',
    suggestedQuestions: [
      'What are my top products?',
      'Best sellers this month',
      'Top selling products',
    ],
    category: 'analysis',
  },
  {
    id: 'expenses_by_category',
    label: 'Expenses by category',
    description: 'Spending breakdown by expense category for the period',
    suggestedQuestions: [
      'What are my top expense categories?',
      'Top expenses this month',
      'Expenses by category',
    ],
    category: 'analysis',
  },
  {
    id: 'new_customers',
    label: 'New customers',
    description: 'Customers acquired in the selected period',
    suggestedQuestions: [
      'How many new customers this month?',
      'New customers today',
      'How many customers did I get?',
    ],
    category: 'analysis',
  },
  {
    id: 'inactive_customers',
    label: 'Inactive customers',
    description: 'Active customers with no purchase/activity in the last 30 days',
    suggestedQuestions: [
      "Show me customers who haven't ordered in 30 days",
      'Inactive customers',
      "Who hasn't bought recently?",
    ],
    category: 'analysis',
  },
  {
    id: 'job_pipeline',
    label: 'Job pipeline',
    description: 'Open studio jobs pending and in progress',
    suggestedQuestions: [
      'Summarize my open jobs',
      'Which jobs still need attention?',
      'Job pipeline',
    ],
    category: 'analysis',
  },
  {
    id: 'receivables_summary',
    label: 'Receivables',
    description: 'Outstanding invoices and who owes money',
    suggestedQuestions: [
      'Who owes me money?',
      'What are my outstanding receivables?',
      'Who has overdue invoices?',
    ],
    category: 'analysis',
  },
  {
    id: 'who_owes_me',
    label: 'Who owes me',
    description: 'Alias of receivables focused on top debtors',
    suggestedQuestions: [
      'Who owes me?',
      'List customers who owe me',
    ],
    category: 'analysis',
  },
  {
    id: 'low_stock',
    label: 'Low stock',
    description: 'Products at or below reorder level',
    suggestedQuestions: [
      'What should I restock?',
      'What products are low on stock?',
      'Low stock alerts',
    ],
    category: 'analysis',
  },
  {
    id: 'performance_summary',
    label: 'Performance summary',
    description: 'Short overall performance snapshot for dashboard / Ask AI',
    suggestedQuestions: [
      'Summarize performance',
      'How is my business doing?',
      "Summarize today's performance",
    ],
    category: 'analysis',
  },
  {
    id: 'rentals_due_today',
    label: 'Rentals due today',
    description: 'Active hires scheduled to return today',
    suggestedQuestions: [
      'What rentals are due back today?',
      'Which rentals return today?',
    ],
    category: 'analysis',
  },
  {
    id: 'rentals_overdue',
    label: 'Overdue rentals',
    description: 'Hires past their return date',
    suggestedQuestions: [
      'Show overdue rentals',
      'Which rentals are overdue?',
    ],
    category: 'analysis',
  },
  {
    id: 'rental_damage',
    label: 'Rental damage',
    description: 'Items with the most damage incidents',
    suggestedQuestions: [
      'Which items have the most damage?',
      'Top damage items',
    ],
    category: 'analysis',
  },
  {
    id: 'rental_revenue_month',
    label: 'Rental revenue',
    description: 'Booked rental revenue for the selected period',
    suggestedQuestions: [
      'Rental revenue this month',
      'How much rental revenue this month?',
    ],
    category: 'analysis',
  },
];

const ANALYSIS_INTENT_IDS = new Set(ANALYSIS_INTENTS.map((i) => i.id));

/** Suggested chips when analysis cannot answer (retail default). */
const FALLBACK_SUGGESTED_QUESTIONS = [
  'How much did I sell today?',
  'How are sales this month?',
  'Who owes me money?',
  'What are my top products?',
  'What are my top expense categories?',
  'What should I restock?',
  'Why are sales down?',
];

const FALLBACK_SUGGESTED_QUESTIONS_STUDIO = [
  'How much revenue did I make today?',
  'How is revenue this month?',
  'Who owes me money?',
  'Summarize my open jobs',
  'Summarize performance',
  'Why is revenue down?',
  'Compare this period to the previous period',
];

const FALLBACK_SUGGESTED_QUESTIONS_RENTAL = [
  'What rentals are due back today?',
  'Show overdue rentals',
  'Rental revenue this month',
  'Who owes me money?',
  'Which items have the most damage?',
  'Summarize performance',
];

/**
 * @param {string|null|undefined} businessType
 * @returns {string[]}
 */
function getFallbackSuggestedQuestions(businessType) {
  const type = businessType || '';
  if (type === 'rental') return FALLBACK_SUGGESTED_QUESTIONS_RENTAL;
  const studio = ['printing_press', 'mechanic', 'barber', 'salon', 'studio'].includes(type);
  return studio ? FALLBACK_SUGGESTED_QUESTIONS_STUDIO : FALLBACK_SUGGESTED_QUESTIONS;
}

/**
 * @param {string} intentId
 * @returns {AnalysisIntent | undefined}
 */
function getIntentById(intentId) {
  return ANALYSIS_INTENTS.find((i) => i.id === intentId);
}

module.exports = {
  ANALYSIS_INTENTS,
  ANALYSIS_INTENT_IDS,
  FALLBACK_SUGGESTED_QUESTIONS,
  FALLBACK_SUGGESTED_QUESTIONS_STUDIO,
  FALLBACK_SUGGESTED_QUESTIONS_RENTAL,
  getFallbackSuggestedQuestions,
  getIntentById,
};
