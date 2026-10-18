import {
  BarChart3,
  Clock,
  Gauge,
  History,
  LayoutDashboard,
  Package,
  Percent,
  Receipt,
  ShoppingCart,
  Wallet,
  Wrench,
} from 'lucide-react';

/** Smart Report tab definitions — matches detail page tabs and create-modal sections. */
export const SMART_REPORT_TABS = [
  { id: 'executive', label: 'Executive Summary', icon: Gauge },
  { id: 'financial', label: 'Financial Overview', icon: BarChart3 },
  { id: 'sales', label: 'Sales & Customers', icon: ShoppingCart },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'cashflow', label: 'Cash Flow', icon: Wallet },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'rental-overview', label: 'Business Overview', icon: LayoutDashboard },
  { id: 'rental-inventory', label: 'Inventory Intelligence', icon: Package },
  { id: 'rental-history', label: 'Product Rental History', icon: History },
  { id: 'rental-utilization', label: 'Utilization', icon: Percent },
  { id: 'rental-late-returns', label: 'Late Returns', icon: Clock },
  { id: 'rental-damage', label: 'Damage Reports', icon: Wrench },
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
  'rental-overview': 'Hire booked, top items, categories, branches, and stock alerts',
  'rental-inventory': 'Low stock, fleet value, and utilization by product',
  'rental-history': 'Times rented, quantity, revenue, and last hired date',
  'rental-utilization': 'Fleet utilization and hired item-days',
  'rental-late-returns': 'Late returns, days late, and late charges',
  'rental-damage': 'Damage reports and cost by type',
};

/**
 * Create-modal groups — section ids match Smart Report tab ids.
 * @type {Array<{ groupLabel: string, tabIds: string[], showWhen?: (ctx: object) => boolean }>}
 */
export const SMART_REPORT_TYPE_GROUPS = [
  {
    groupLabel: 'Overview',
    tabIds: ['executive'],
    showWhen: ({ isRental }) => !isRental,
  },
  {
    groupLabel: 'Business',
    tabIds: ['rental-overview', 'rental-inventory', 'rental-history', 'rental-damage'],
    showWhen: ({ isRental }) => isRental,
  },
  {
    groupLabel: 'Financial',
    tabIds: ['financial', 'expenses', 'cashflow'],
    showWhen: ({ isRental }) => !isRental,
  },
  {
    groupLabel: 'Financial Reports',
    tabIds: ['financial'],
    showWhen: ({ isRental }) => isRental,
  },
  {
    groupLabel: 'Sales & customers',
    tabIds: ['sales'],
    showWhen: ({ isRental }) => !isRental,
  },
  {
    groupLabel: 'Customer Analytics',
    tabIds: ['sales'],
    showWhen: ({ isRental }) => isRental,
  },
  {
    groupLabel: 'Inventory',
    tabIds: ['inventory'],
    showWhen: ({ isShop, isPharmacy }) => isShop || isPharmacy,
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
