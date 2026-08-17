import {
  BarChart3,
  Brain,
  Lightbulb,
  Package,
  Receipt,
  ShoppingCart,
  Sparkles,
  Wallet,
} from 'lucide-react';

/** Smart Report tab definitions — matches detail page tabs and create-modal sections. */
export const SMART_REPORT_TABS = [
  { id: 'executive', label: 'Executive Summary', icon: Sparkles },
  { id: 'financial', label: 'Financial Overview', icon: BarChart3 },
  { id: 'sales', label: 'Sales & Customers', icon: ShoppingCart },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'cashflow', label: 'Cash Flow', icon: Wallet },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'ai-insights', label: 'AI Insights', icon: Brain },
  { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
];

export const SMART_REPORT_TAB_IDS = SMART_REPORT_TABS.map((t) => t.id);

/** Descriptions shown in the create-report modal (aligned with each tab). */
export const SMART_REPORT_TAB_DESCRIPTIONS = {
  executive: 'High-level KPIs, trends, and performance snapshot',
  financial: 'P&L, revenue breakdown, financial position, and ratios',
  sales: 'Sales performance, top customers, and customer segments',
  expenses: 'Expense categories, vendors, and cost trends',
  cashflow: 'Cash inflows, outflows, and liquidity',
  inventory: 'Stock levels, low stock alerts, and inventory movement',
  'ai-insights': 'AI-generated findings from your business data',
  recommendations: 'Prioritized actions to improve performance',
};

/**
 * Create-modal groups — section ids match Smart Report tab ids.
 * @type {Array<{ groupLabel: string, tabIds: string[], showWhen?: (ctx: object) => boolean }>}
 */
export const SMART_REPORT_TYPE_GROUPS = [
  {
    groupLabel: 'Overview',
    tabIds: ['executive'],
  },
  {
    groupLabel: 'Financial',
    tabIds: ['financial', 'expenses', 'cashflow'],
  },
  {
    groupLabel: 'Sales & customers',
    tabIds: ['sales'],
  },
  {
    groupLabel: 'Inventory',
    tabIds: ['inventory'],
    showWhen: ({ isShop, isPharmacy }) => isShop || isPharmacy,
  },
  {
    groupLabel: 'AI',
    tabIds: ['ai-insights', 'recommendations'],
  },
];

/** Map legacy generate-report type ids → Smart Report tab id(s). */
export const LEGACY_REPORT_TYPE_TO_TAB = {
  cashflow: 'cashflow',
  'cost-analysis': 'expenses',
  'invoice-summary': 'financial',
  'outstanding-payments': 'financial',
  'customer-summary': 'sales',
  'sales-summary': 'sales',
  'product-analytics': ['sales', 'inventory'],
  'service-analytics': 'sales',
  'materials-summary': 'inventory',
  pipeline: 'sales',
  'prescription-summary': 'sales',
  'inventory-status': 'inventory',
  performance: 'executive',
};

/** Create-modal generation modes. */
export const SMART_REPORT_GENERATION_MODES = {
  SECTIONS: 'sections',
  FREE_TEXT: 'free_text',
};

/**
 * Map assistant NLP period keys → Reports DateRangePicker preset keys.
 * @type {Record<string, string>}
 */
export const ASSISTANT_PERIOD_TO_DATE_FILTER = {
  today: 'today',
  yesterday: 'yesterday',
  week: 'thisWeek',
  month: 'thisMonth',
  year: 'thisYear',
};

/** Longer AI timeout for free-text custom questions (template path stays shorter). */
export const SMART_REPORT_FREE_TEXT_AI_TIMEOUT_MS = 40000;

/** Example chips for the Describe with AI create path. */
export const SMART_REPORT_FREE_TEXT_EXAMPLE_PROMPTS = [
  'How did we do this month vs last, and what should I fix first?',
  'Where is cash getting stuck and what actions will free it up?',
  'Which products or services drove profit this week, and what is at risk?',
  'Give me a growth plan for this quarter based only on our numbers.',
];
