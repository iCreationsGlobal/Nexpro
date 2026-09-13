/**
 * Application Constants and Configuration
 * 
 * Centralized location for all constants, configuration values,
 * and business rules used throughout the application.
 */

/** App display name (branding). Use useBranding().appName when inside BrandingProvider for tenant customization. */
export const APP_NAME = 'ABS';

/** Online Store paid setup help — WhatsApp (sales) + email fallback. */
export const ONLINE_STORE_SUPPORT_WHATSAPP_NUMBER = '233555155972';
export const ONLINE_STORE_SUPPORT_WHATSAPP_HREF =
  `https://wa.me/${ONLINE_STORE_SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    'Hi ABS — I need help setting up my Online Store (paid setup).',
  )}`;
export const ONLINE_STORE_SUPPORT_EMAIL = 'info@africanbusinesssuite.com';
export const ONLINE_STORE_SUPPORT_EMAIL_HREF =
  `mailto:${ONLINE_STORE_SUPPORT_EMAIL}?subject=${encodeURIComponent('Online Store setup help (paid)')}`;

// API Configuration
export const API_CONFIG = {
  TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY_BASE: 1000, // 1 second
};

// Pagination Configuration
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
  MAX_PAGE_SIZE: 100,
};

// Debounce Delays (in milliseconds)
export const DEBOUNCE_DELAYS = {
  SEARCH: 500,
  INPUT: 300,
  RESIZE: 250,
};

/** When to skip auto app guidance (product tour, forced workspace onboarding). */
export const APP_GUIDANCE = {
  /** Account/membership/tenant age at or above this → treat as established user. */
  TENURE_DAYS: 30,
  /** Recent login within this window + minimum account age → very active user. */
  ACTIVE_RECENT_LOGIN_DAYS: 14,
  MIN_ACCOUNT_AGE_DAYS_FOR_ACTIVE: 7,
};

// React Query Cache Configuration (in milliseconds)
export const QUERY_CACHE = {
  STALE_TIME_STABLE: 5 * 60 * 1000, // 5 minutes for stable data (users, settings, categories)
  STALE_TIME_DEFAULT: 2 * 60 * 1000, // 2 minutes for default data
  STALE_TIME_VOLATILE: 30 * 1000, // 30 seconds for frequently changing data
  CACHE_TIME: 10 * 60 * 1000, // 10 minutes cache time
};

export {
  DEFAULT_TENANT_NAMES,
  isPlaceholderBusinessName,
  getWorkspaceDisplayName,
} from './tenantPlaceholders.js';

// Business Types
export const BUSINESS_TYPES = {
  PRINTING_PRESS: 'printing_press',
  SHOP: 'shop',
  PHARMACY: 'pharmacy',
  RENTAL: 'rental',
};

/** Business types that use Jobs (studio-like: printing press, mechanic, barber, salon) */
export { STUDIO_LIKE_TYPES } from './studioLikeTypes.js';

/**
 * Default review / service tags for the public review form when the tenant has no
 * `metadata.reviewCategories` override (backend passes that list when set).
 * Keys match tenant `businessType` (see Backend Tenant model enum).
 */
export const REVIEW_CATEGORY_OPTIONS_BY_BUSINESS_TYPE = {
  printing_press: ['Digital Printing', 'Branding', 'Graphic Design', 'Large format', 'Other'],
  mechanic: ['Service', 'Repairs', 'Diagnostics', 'Parts', 'Other'],
  barber: ['Haircut', 'Styling', 'Shave', 'Other'],
  salon: ['Hair', 'Nails', 'Treatment', 'Other'],
  studio: ['Project', 'Consultation', 'Other'],
  shop: ['Purchase', 'Support', 'Other'],
  pharmacy: ['Prescription', 'OTC', 'Consultation', 'Other'],
  rental: ['Booking', 'Return', 'Damage', 'Late Charge', 'Other'],
  default: ['General', 'Other'],
};

/**
 * Options shown on the public review page (custom tenant list wins when provided).
 * @param {string|null|undefined} businessType
 * @param {string[]|null|undefined} customFromApi - from GET public feedback branding
 * @returns {string[]}
 */
export function getReviewCategoryOptions(businessType, customFromApi) {
  if (Array.isArray(customFromApi) && customFromApi.length > 0) {
    return [...new Set(customFromApi.map((s) => String(s).trim()).filter(Boolean))];
  }
  const map = REVIEW_CATEGORY_OPTIONS_BY_BUSINESS_TYPE;
  if (businessType && map[businessType]) {
    return map[businessType];
  }
  return map.default;
}

/** @deprecated Use hasFeature('shopsModule') — kept for backwards compatibility */
export const SHOW_SHOPS = true;

// Job Statuses
export const JOB_STATUSES = {
  NEW: 'new',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ON_HOLD: 'on_hold',
  CANCELLED: 'cancelled',
};

// Invoice Statuses
export const INVOICE_STATUSES = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
  PARTIAL: 'partial',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
};

// Expense Statuses
export const EXPENSE_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PAID: 'paid',
};

// Expense Approval Statuses
export const EXPENSE_APPROVAL_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

// Lead Statuses
export const LEAD_STATUSES = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  CONVERTED: 'converted',
  LOST: 'lost',
};

// Lead Priorities
export const LEAD_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

// User Roles
export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  DRIVER: 'driver',
  EMPLOYEE: 'employee',
};

// Date Formats
export const DATE_FORMATS = {
  DISPLAY: 'MMM DD, YYYY',
  DISPLAY_WITH_TIME: 'MMM DD, YYYY HH:mm',
  INPUT: 'YYYY-MM-DD',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
};

/** ABS Watch incident kinds — keep copy low-certainty, never accuse staff. */
export const WATCH_INCIDENT_KINDS = {
  MATCHED: 'matched',
  UNMATCHED_INTERACTION: 'unmatched_interaction',
  SALE_WITHOUT_EVENT: 'sale_without_event',
};

export const WATCH_INCIDENT_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  DISMISSED: 'dismissed',
  NEEDS_CONTEXT: 'needs_context',
};

export const WATCH_REVIEW_DECISIONS = {
  CONFIRM: 'confirm',
  DISMISS: 'dismiss',
  NEEDS_CONTEXT: 'needs_context',
};

// File Upload Configuration
export const FILE_UPLOAD = {
  MAX_SIZE_MB: 20,
  MAX_SIZE_BYTES: 20 * 1024 * 1024, // 20MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

// Currency Configuration (default)
export const CURRENCY = {
  SYMBOL: '₵',
  CODE: 'GHS',
  DECIMAL_PLACES: 2,
};

// Available Currencies (African currencies + major international)
export const CURRENCIES = [
  // African Currencies
  { code: 'GHS', symbol: '₵', name: 'Ghana Cedi', country: 'Ghana' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', country: 'Nigeria' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', country: 'Kenya' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', country: 'South Africa' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', country: 'Egypt' },
  { code: 'MAD', symbol: 'د.م.', name: 'Moroccan Dirham', country: 'Morocco' },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', country: 'Tanzania' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', country: 'Uganda' },
  { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc', country: 'West Africa' },
  { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc', country: 'Central Africa' },
  { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha', country: 'Zambia' },
  { code: 'BWP', symbol: 'P', name: 'Botswana Pula', country: 'Botswana' },
  { code: 'MUR', symbol: '₨', name: 'Mauritian Rupee', country: 'Mauritius' },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr', country: 'Ethiopia' },
  { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc', country: 'Rwanda' },
  // International Currencies
  { code: 'USD', symbol: '$', name: 'US Dollar', country: 'United States' },
  { code: 'GBP', symbol: '£', name: 'British Pound', country: 'United Kingdom' },
  { code: 'EUR', symbol: '€', name: 'Euro', country: 'European Union' },
];

// Notification Types
export const NOTIFICATION_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
};

// Notification Priorities
export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

/**
 * Recharts / dashboard chart palette — anchored to tenant brand (--color-primary from BrandingContext).
 * Extra entries are neutrals for additional series without clashing with status reds.
 */
export const CHART_COLORS = [
  'var(--color-primary)',
  'var(--color-primary-dark)',
  'hsl(var(--primary) / 0.5)',
  'hsl(var(--primary) / 0.32)',
  '#64748b',
  '#94a3b8',
  '#cbd5e1',
  '#475569',
];

// Status chip Tailwind class strings (single source of truth for StatusChip and status badges)
/** Success / positive status color — fixed semantic green, not tenant brand. */
export const CHIP_GREEN = 'bg-green-100 text-green-800 border-green-300';
export const CHIP_RED = 'bg-red-100 text-red-800 border-red-300';
export const CHIP_ORANGE = 'bg-orange-100 text-orange-800 border-orange-300';
/** In-progress / info status color — fixed semantic blue, not tenant brand. */
export const CHIP_BLUE = 'bg-blue-100 text-blue-800 border-blue-300';
export const CHIP_YELLOW = 'bg-yellow-100 text-yellow-800 border-yellow-300';
export const CHIP_PURPLE = 'bg-purple-100 text-purple-800 border-purple-300';
export const CHIP_GRAY = 'bg-muted text-muted-foreground border-border';

/** Default chip class when status is unknown */
export const STATUS_CHIP_DEFAULT_CLASS = CHIP_GRAY;

/**
 * Status → Tailwind classes for StatusChip. Used by StatusChip component.
 * Semantic mapping: green = success/done, red = danger/closed negative,
 * orange = warning/pending, blue = in progress/info, yellow = draft/new,
 * purple = special/qualified, gray = neutral.
 */
export const STATUS_CHIP_CLASSES = {
  // Job statuses
  [JOB_STATUSES.NEW]: CHIP_YELLOW,
  [JOB_STATUSES.IN_PROGRESS]: CHIP_BLUE,
  [JOB_STATUSES.COMPLETED]: CHIP_GREEN,
  [JOB_STATUSES.ON_HOLD]: CHIP_ORANGE,
  [JOB_STATUSES.CANCELLED]: CHIP_RED,
  // Invoice statuses
  [INVOICE_STATUSES.DRAFT]: CHIP_YELLOW,
  [INVOICE_STATUSES.SENT]: CHIP_BLUE,
  [INVOICE_STATUSES.PAID]: CHIP_GREEN,
  [INVOICE_STATUSES.PARTIAL]: CHIP_ORANGE,
  [INVOICE_STATUSES.OVERDUE]: CHIP_RED,
  [INVOICE_STATUSES.CANCELLED]: CHIP_RED,
  // Expense statuses
  [EXPENSE_STATUSES.DRAFT]: CHIP_YELLOW,
  [EXPENSE_STATUSES.PENDING]: CHIP_ORANGE,
  [EXPENSE_STATUSES.APPROVED]: CHIP_GREEN,
  [EXPENSE_STATUSES.REJECTED]: CHIP_RED,
  [EXPENSE_STATUSES.PAID]: CHIP_GREEN,
  // Lead statuses
  [LEAD_STATUSES.NEW]: CHIP_YELLOW,
  [LEAD_STATUSES.CONTACTED]: CHIP_BLUE,
  [LEAD_STATUSES.QUALIFIED]: CHIP_PURPLE,
  [LEAD_STATUSES.CONVERTED]: CHIP_GREEN,
  [LEAD_STATUSES.LOST]: CHIP_RED,
  // Quote statuses
  draft: CHIP_YELLOW,
  sent: CHIP_BLUE,
  accepted: CHIP_GREEN,
  declined: CHIP_RED,
  expired: CHIP_RED,
  // Sale statuses
  completed: CHIP_GREEN,
  pending: CHIP_ORANGE,
  partially_paid: CHIP_ORANGE,
  refunded: CHIP_RED,
  cancelled: CHIP_RED,
  partial_return: CHIP_ORANGE,
  exchanged: CHIP_PURPLE,
  // Task statuses and sources
  todo: CHIP_GRAY,
  task_source_lead: CHIP_PURPLE,
  task_source_invoice: CHIP_BLUE,
  task_source_quote: CHIP_PURPLE,
  task_source_stock: CHIP_GREEN,
  task_source_manual: CHIP_GRAY,
  // Payroll run statuses (approved, paid same as expense)
  // Employee statuses
  active: CHIP_BLUE,
  inactive: CHIP_RED,
  on_leave: CHIP_PURPLE,
  probation: CHIP_PURPLE,
  terminated: CHIP_RED,
  // Tenant / billing statuses
  paused: CHIP_PURPLE,
  suspended: CHIP_RED,
  // Stock statuses
  in_stock: CHIP_GREEN,
  instock: CHIP_GREEN,
  low_stock: CHIP_ORANGE,
  lowstock: CHIP_ORANGE,
  out_of_stock: CHIP_RED,
  outofstock: CHIP_RED,
  // Product active flag (display)
  active_flag: CHIP_GREEN,
  inactive_flag: CHIP_RED,
  // Accounting
  posted: CHIP_GREEN,
  // Health / DB
  online: CHIP_GRAY,
  offline: CHIP_RED,
  // POS sync / receipt / export
  syncing: CHIP_BLUE,
  synced: CHIP_GREEN,
  failed: CHIP_RED,
  /** Automation rule run outcome */
  success: CHIP_GREEN,
  sending: CHIP_BLUE,
  ready: CHIP_GRAY,
  processing: CHIP_BLUE,
  // Subscription
  trialing: CHIP_YELLOW,
  // Prescriptions
  filled: CHIP_GREEN,
  dispensed: CHIP_GREEN,
  in_progress: CHIP_BLUE,
  inprogress: CHIP_BLUE,
  // Aliases for StatusChip (various forms)
  new: CHIP_YELLOW,
  cancelled: CHIP_RED,
  lost: CHIP_RED,
  converted: CHIP_GREEN,
  rejected: CHIP_RED,
  overdue: CHIP_ORANGE,
  partial: CHIP_ORANGE,
  on_hold: CHIP_ORANGE,
  pending_approval: CHIP_ORANGE,
  pending_review: CHIP_ORANGE,
  live: CHIP_GREEN,
  qualified: CHIP_PURPLE,
  declined: CHIP_RED,
  expired: CHIP_RED,
  contacted: CHIP_BLUE,
  accepted: CHIP_GREEN,
  /** Equipment asset lifecycle */
  disposed: CHIP_GRAY,
  sold: CHIP_ORANGE,
  /** Rental lifecycle (pending / completed / overdue / cancelled reuse keys above) */
  confirmed: CHIP_BLUE,
  returned: CHIP_GREEN,
  /** Customer account type (vs workflow status) */
  returning: CHIP_BLUE,
};

/** Priority → Tailwind classes for priority chips (Jobs, Leads). */
export const PRIORITY_CHIP_CLASSES = {
  low: CHIP_GRAY,
  medium: CHIP_BLUE,
  high: CHIP_ORANGE,
  urgent: CHIP_RED,
};

/** Role → Tailwind classes for role chips (Users). */
export const ROLE_CHIP_CLASSES = {
  admin: 'border-transparent bg-red-100 text-red-800 border-red-300',
  manager: 'border-transparent bg-primary text-primary-foreground',
  driver: 'border-transparent bg-amber-100 text-amber-800 border-amber-300',
  employee: CHIP_GRAY,
  staff: CHIP_GRAY,
};

/** Default chip class when subscription plan is unknown */
export const PLAN_CHIP_DEFAULT_CLASS = CHIP_GRAY;

/** Subscription plan → Tailwind classes for PlanBadge (admin). */
export const PLAN_CHIP_CLASSES = {
  trial: CHIP_ORANGE,
  starter: CHIP_GRAY,
  professional: CHIP_GREEN,
  enterprise: CHIP_BLUE,
};

// Payment Methods
export const PAYMENT_METHODS = {
  CASH: 'cash',
  MOBILE_MONEY: 'mobile_money',
  BANK_TRANSFER: 'bank_transfer',
  CHEQUE: 'cheque',
  CARD: 'card',
  CREDIT: 'credit',
  OTHER: 'other',
};

/** POS return / exchange reason codes (matches Backend saleReturnController). */
export const SALE_RETURN_REASON_CODES = {
  CUSTOMER_CHANGED_MIND: 'customer_changed_mind',
  WRONG_ITEM: 'wrong_item',
  DAMAGED: 'damaged',
  DEFECTIVE: 'defective',
  EXPIRED: 'expired',
  OTHER: 'other',
};

export const SALE_RETURN_REASON_LABELS = {
  [SALE_RETURN_REASON_CODES.CUSTOMER_CHANGED_MIND]: 'Customer changed mind',
  [SALE_RETURN_REASON_CODES.WRONG_ITEM]: 'Wrong item',
  [SALE_RETURN_REASON_CODES.DAMAGED]: 'Damaged',
  [SALE_RETURN_REASON_CODES.DEFECTIVE]: 'Defective',
  [SALE_RETURN_REASON_CODES.EXPIRED]: 'Expired',
  [SALE_RETURN_REASON_CODES.OTHER]: 'Other',
};

export const SALE_RETURN_DISPOSITIONS = {
  RESTOCK: 'restock',
  WRITE_OFF: 'write_off',
};

export const SALE_RETURN_DISPOSITION_LABELS = {
  [SALE_RETURN_DISPOSITIONS.RESTOCK]: 'Restock',
  [SALE_RETURN_DISPOSITIONS.WRITE_OFF]: 'Do not restock (write-off)',
};

export const SALE_RETURN_TYPES = {
  REFUND: 'refund',
  EXCHANGE: 'exchange',
};


/**
 * Africa-focused MoMo markets (copy for UI copy, provider hints, docs).
 * Backend: Backend/config/africaPaymentMarkets.js
 * Customer-facing POS / pay links: prefer cash + MoMo (direct APIs) + card (Paystack).
 */
export const AFRICA_MOMO_MARKETS = [
  {
    countryCode: 'GH',
    currency: 'GHS',
    dialCode: '233',
    label: 'Ghana',
    operators: [
      { code: 'MTN', label: 'MTN Mobile Money', prefixes: ['24', '54', '55', '59'] },
      { code: 'AIRTEL', label: 'AirtelTigo Money', prefixes: ['26', '27', '57'] },
      // apiReady: false = direct Telecel Collection API only; Hubtel/Paystack still collect Vodafone
      { code: 'VODAFONE', label: 'Vodafone Cash', prefixes: ['20', '50'], apiReady: false }
    ]
  },
  {
    countryCode: 'UG',
    currency: 'UGX',
    dialCode: '256',
    label: 'Uganda',
    operators: [
      { code: 'MTN', label: 'MTN Mobile Money', prefixes: ['77', '78', '76'] },
      { code: 'AIRTEL', label: 'Airtel Money', prefixes: ['70', '75'] }
    ]
  },
  {
    countryCode: 'KE',
    currency: 'KES',
    dialCode: '254',
    label: 'Kenya',
    operators: [{ code: 'AIRTEL', label: 'Airtel Money', prefixes: ['73', '78'] }]
  }
];

/** Payment rails exposed to customers at POS / public pay: cash, direct MoMo, card (PSP). */
export const CUSTOMER_PAYMENT_RAILS = {
  CASH: 'cash',
  MOBILE_MONEY: 'mobile_money',
  CARD: 'card'
};

// Default Values
export const DEFAULTS = {
  PRIORITY: LEAD_PRIORITIES.MEDIUM,
  STATUS: JOB_STATUSES.NEW,
  PAGE_SIZE: PAGINATION.DEFAULT_PAGE_SIZE,
};

// Error Messages - Actionable copy that answers "What went wrong?" + "How to fix it?"
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Connection lost. Check your internet and try again.',
  TIMEOUT_ERROR: 'Taking longer than expected. Try again or check your connection.',
  UNAUTHORIZED: "You don't have permission for this. Contact your admin if needed.",
  NOT_FOUND: "We couldn't find that. It may have been moved or deleted.",
  VALIDATION_ERROR: 'Please review the highlighted fields.',
  SERVER_ERROR: 'Something went wrong on our end. Please try again shortly.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
};

// Success Messages - Contextual, brief (3-5 words), no "successfully"
export const SUCCESS_MESSAGES = {
  // Generic (use contextual functions when entity name is available)
  CREATED: 'Created',
  UPDATED: 'Updated',
  DELETED: 'Deleted',
  SAVED: 'Changes saved',
  
  // Contextual message generators
  created: (entity) => `${entity} created`,
  updated: (entity) => `${entity} updated`,
  deleted: (entity) => `${entity} deleted`,
  added: (entity) => `${entity} added`,
};

// Header search placeholders - Show searchable fields to guide users
export const SEARCH_PLACEHOLDERS = {
  GLOBAL: 'Type to search...',
  CUSTOMERS: 'Name, email, or phone...',
  /** Reviews inbox — same data as public customer feedback */
  REVIEWS: 'Comment, email, phone, or rating...',
  CUSTOMER_FEEDBACK: 'Comment, email, phone, or rating...',
  INVOICES: 'Invoice #, customer, or amount...',
  LEADS: 'Name, company, or email...',
  JOBS: 'Job #, title, or customer...',
  DELIVERIES: 'Job or sale #, customer, phone, or address...',
  QUOTES: 'Quote #, customer, or title...',
  VENDORS: 'Name, company, or category...',
  ASSETS: 'Name, tag, or location...',
  MATERIALS: 'Name, SKU, or category...',
  EQUIPMENT: 'Name, serial #, or location...',
  RENTALS: 'Customer, product, or status...',
  MERCHANDISE: 'Name, SKU, or category...',
  EMPLOYEES: 'Name, department, or role...',
  USERS: 'Name, email, or role...',
  EXPENSES: 'Description, vendor, or category...',
  SALES: 'Sale #, customer, or product...',
  PAYROLL: 'Employee name or period...',
  ACCOUNTING: 'Account, code, or entry...',
  REPORTS: 'Report name or type...',
  TASKS: 'Title, description, or assignee...',
  SHOPS: 'Name, code, or location...',
  PHARMACIES: 'Name, code, or pharmacist...',
  PRODUCTS: 'Name, SKU, or barcode...',
  DRUGS: 'Name, generic, or batch...',
  PRESCRIPTIONS: 'Prescription #, patient, or drug...',
  PRICING: 'Template name or category...',
  ADMIN_TENANTS: 'Name, slug, or email...',
};

/**
 * Quotes visibility: dependent on business type and (for shop) shop type.
 * - Studio (printing_press, mechanic, barber, salon) and pharmacy: always enabled.
 * - Shop: enabled except when shopType is in QUOTES_HIDDEN_SHOP_TYPES (e.g. restaurant).
 */
export const QUOTES_HIDDEN_SHOP_TYPES = ['restaurant'];

/**
 * @param {string|null} businessType - Tenant businessType
 * @param {string|null} shopType - Tenant metadata.shopType (only relevant when businessType is 'shop')
 * @returns {boolean} Whether the Quotes feature is visible for this tenant
 */
export function isQuotesEnabledForTenant(businessType, shopType) {
  if (!businessType) return false;
  if (businessType === 'rental') return false;
  const isStudio = ['printing_press', 'mechanic', 'barber', 'salon', 'studio'].includes(businessType);
  if (isStudio || businessType === 'pharmacy') return true;
  if (businessType === 'shop') {
    return !QUOTES_HIDDEN_SHOP_TYPES.includes(shopType || '');
  }
  return false;
}

// Responsive Breakpoints (in pixels)
export const RESPONSIVE = {
  BREAKPOINTS: {
    MOBILE: 768,
    TABLET: 1024,
    DESKTOP: 1280,
  },
  // Touch target sizes (in pixels)
  TOUCH_TARGETS: {
    MIN_SIZE: 44, // Minimum touch target size (iOS/Android guidelines)
    RECOMMENDED_SIZE: 48, // Recommended touch target size
    BUTTON_HEIGHT: 44, // Standard button height for mobile
  },
  // Spacing scale for mobile (in Tailwind units)
  SPACING: {
    MOBILE_PADDING: 4, // 16px
    TABLET_PADDING: 6, // 24px
    DESKTOP_PADDING: 8, // 32px
    MOBILE_GAP: 3, // 12px
    TABLET_GAP: 4, // 16px
    DESKTOP_GAP: 6, // 24px
  },
  // Typography scale
  TYPOGRAPHY: {
    MOBILE_BASE: 14, // Base font size for mobile (14px)
    TABLET_BASE: 15, // Base font size for tablet (15px)
    DESKTOP_BASE: 16, // Base font size for desktop (16px)
    MOBILE_LINE_HEIGHT: 1.5, // Line height for mobile
    DESKTOP_LINE_HEIGHT: 1.6, // Line height for desktop
  },
  // Grid columns
  GRID_COLUMNS: {
    MOBILE: 1,
    TABLET: 2,
    DESKTOP: 3,
    LARGE_DESKTOP: 4,
  },
};

// =============================================
// PRODUCT MANAGEMENT CONSTANTS
// =============================================

// Product Units (common African market units; used for products, materials, vendor price lists)
export const PRODUCT_UNITS = [
  { value: 'unit', label: 'Unit' },
  { value: 'hour', label: 'Hour' },
  { value: 'pcs', label: 'Pieces' },
  { value: 'bag', label: 'Bag' },
  { value: 'crate', label: 'Crate' },
  { value: 'carton', label: 'Carton' },
  { value: 'dozen', label: 'Dozen' },
  { value: 'sachet', label: 'Sachet' },
  { value: 'pack', label: 'Pack' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'L', label: 'Litre (L)' },
  { value: 'mL', label: 'Millilitre (mL)' },
  { value: 'box', label: 'Box' },
  { value: 'roll', label: 'Roll' },
  { value: 'pair', label: 'Pair' },
  { value: 'set', label: 'Set' },
  { value: 'meter', label: 'Meter' },
  { value: 'm2', label: 'Square meter (m2)' },
  { value: 'yard', label: 'Yard' },
];

// Restaurant-specific units (food/service)
export const RESTAURANT_UNITS = [
  { value: 'serving', label: 'Serving' },
  { value: 'portion', label: 'Portion' },
  { value: 'plate', label: 'Plate' },
  { value: 'bowl', label: 'Bowl' },
  { value: 'cup', label: 'Cup' },
];

// Common allergens (for restaurant/food products)
export const ALLERGENS_OPTIONS = [
  { value: 'milk', label: 'Milk' },
  { value: 'eggs', label: 'Eggs' },
  { value: 'fish', label: 'Fish' },
  { value: 'shellfish', label: 'Shellfish' },
  { value: 'tree_nuts', label: 'Tree Nuts' },
  { value: 'peanuts', label: 'Peanuts' },
  { value: 'wheat', label: 'Wheat/Gluten' },
  { value: 'soy', label: 'Soybeans' },
  { value: 'sesame', label: 'Sesame' },
];

// Age range options for toys
export const AGE_RANGE_OPTIONS = [
  { value: '0+', label: '0+' },
  { value: '1+', label: '1+' },
  { value: '3+', label: '3+' },
  { value: '5+', label: '5+' },
  { value: '8+', label: '8+' },
  { value: '12+', label: '12+' },
  { value: '14+', label: '14+' },
  { value: '18+', label: '18+' },
];

// Profit Margin Thresholds (for color coding)
export const MARGIN_THRESHOLDS = {
  LOW: 10, // Below 10% - red/danger
  MEDIUM: 30, // 10-30% - yellow/warning
  // Above 30% - green/success
};

// Profit margin badge classes (semantic, fixed colors - never tenant brand-driven)
export const MARGIN_BADGE_CLASSES = {
  LOW: 'border-red-300 bg-red-100 text-red-800',
  MEDIUM: 'border-yellow-300 bg-yellow-100 text-yellow-800',
  HIGH: 'border-green-300 bg-green-100 text-green-800',
};

// Get margin badge class based on percentage
export const getMarginColor = (marginPercent) => {
  if (marginPercent < MARGIN_THRESHOLDS.LOW) return MARGIN_BADGE_CLASSES.LOW;
  if (marginPercent < MARGIN_THRESHOLDS.MEDIUM) return MARGIN_BADGE_CLASSES.MEDIUM;
  return MARGIN_BADGE_CLASSES.HIGH;
};

// Calculate profit margin
export const calculateMargin = (costPrice, sellingPrice) => {
  const cost = parseFloat(costPrice) || 0;
  const sell = parseFloat(sellingPrice) || 0;
  if (sell === 0) return 0;
  return ((sell - cost) / sell) * 100;
};

// Restaurant order statuses (kitchen tracking)
export const ORDER_STATUSES = {
  RECEIVED: 'received',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
};

export const ORDER_STATUS_LABELS = {
  [ORDER_STATUSES.RECEIVED]: 'Received',
  [ORDER_STATUSES.PREPARING]: 'Preparing',
  [ORDER_STATUSES.READY]: 'Ready',
  [ORDER_STATUSES.COMPLETED]: 'Completed',
};

/** Rental lifecycle statuses */
export const RENTAL_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ACTIVE: 'active',
  OVERDUE: 'overdue',
  RETURNED: 'returned',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const RENTAL_STATUS_LABELS = {
  [RENTAL_STATUSES.PENDING]: 'Pending',
  [RENTAL_STATUSES.CONFIRMED]: 'Confirmed',
  [RENTAL_STATUSES.ACTIVE]: 'Active',
  [RENTAL_STATUSES.OVERDUE]: 'Overdue',
  [RENTAL_STATUSES.RETURNED]: 'Returned',
  [RENTAL_STATUSES.COMPLETED]: 'Completed',
  [RENTAL_STATUSES.CANCELLED]: 'Cancelled',
};

/** Rentals where inventory is still reserved or items are out. */
export const RENTAL_OPEN_STATUSES = [
  RENTAL_STATUSES.PENDING,
  RENTAL_STATUSES.CONFIRMED,
  RENTAL_STATUSES.ACTIVE,
  RENTAL_STATUSES.OVERDUE,
];

/** Rentals eligible for the return action. */
export const RENTAL_RETURNABLE_STATUSES = [
  RENTAL_STATUSES.ACTIVE,
  RENTAL_STATUSES.OVERDUE,
];

/** Rentals eligible for extension. */
export const RENTAL_EXTENDABLE_STATUSES = [
  RENTAL_STATUSES.CONFIRMED,
  RENTAL_STATUSES.ACTIVE,
  RENTAL_STATUSES.OVERDUE,
];

/** Rentals eligible for checkout / handover (status only; start date checked in UI). */
export const RENTAL_CHECKOUTABLE_STATUSES = [
  RENTAL_STATUSES.CONFIRMED,
];

/** Pre-booking lifecycle statuses */
export const PRE_BOOKING_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CONVERTED: 'converted',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

export const PRE_BOOKING_STATUS_LABELS = {
  [PRE_BOOKING_STATUSES.PENDING]: 'Pending',
  [PRE_BOOKING_STATUSES.CONFIRMED]: 'Confirmed',
  [PRE_BOOKING_STATUSES.CONVERTED]: 'Converted',
  [PRE_BOOKING_STATUSES.EXPIRED]: 'Expired',
  [PRE_BOOKING_STATUSES.CANCELLED]: 'Cancelled',
};

/** Pre-bookings that still hold inventory */
export const PRE_BOOKING_OPEN_STATUSES = [
  PRE_BOOKING_STATUSES.PENDING,
  PRE_BOOKING_STATUSES.CONFIRMED,
];

/** First-party delivery (jobs + sales); when set, public tracking shows this timeline only */
export const DELIVERY_STATUSES = {
  READY_FOR_DELIVERY: 'ready_for_delivery',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
};

export const DELIVERY_STATUS_LABELS = {
  [DELIVERY_STATUSES.READY_FOR_DELIVERY]: 'Ready for delivery',
  [DELIVERY_STATUSES.OUT_FOR_DELIVERY]: 'Out for delivery',
  [DELIVERY_STATUSES.DELIVERED]: 'Delivered',
  [DELIVERY_STATUSES.RETURNED]: 'Returned',
};

export const DELIVERY_STATUS_ORDER = [
  DELIVERY_STATUSES.READY_FOR_DELIVERY,
  DELIVERY_STATUSES.OUT_FOR_DELIVERY,
  DELIVERY_STATUSES.DELIVERED,
  DELIVERY_STATUSES.RETURNED,
];

// Shop Types (from backend config)
export const SHOP_TYPES = {
  SUPERMARKET: 'supermarket',
  HARDWARE: 'hardware',
  ELECTRONICS: 'electronics',
  CLOTHING: 'clothing',
  FURNITURE: 'furniture',
  BOOKSTORE: 'bookstore',
  AUTO_PARTS: 'auto_parts',
  CONVENIENCE: 'convenience',
  BEAUTY: 'beauty',
  SPORTS: 'sports',
  TOYS: 'toys',
  PET: 'pet',
  STATIONERY: 'stationery',
  RESTAURANT: 'restaurant',
  OTHER: 'other',
};

// Shop Type Display Labels
export const SHOP_TYPE_LABELS = {
  [SHOP_TYPES.SUPERMARKET]: 'Supermarket/Grocery',
  [SHOP_TYPES.HARDWARE]: 'Hardware Store',
  [SHOP_TYPES.ELECTRONICS]: 'Electronics Store',
  [SHOP_TYPES.CLOTHING]: 'Clothing/Fashion',
  [SHOP_TYPES.FURNITURE]: 'Furniture Store',
  [SHOP_TYPES.BOOKSTORE]: 'Bookstore',
  [SHOP_TYPES.AUTO_PARTS]: 'Auto Parts',
  [SHOP_TYPES.CONVENIENCE]: 'Convenience Store',
  [SHOP_TYPES.BEAUTY]: 'Beauty/Cosmetics',
  [SHOP_TYPES.SPORTS]: 'Sports Store',
  [SHOP_TYPES.TOYS]: 'Toy Store',
  [SHOP_TYPES.PET]: 'Pet Store',
  [SHOP_TYPES.STATIONERY]: 'Stationery',
  [SHOP_TYPES.RESTAURANT]: 'Restaurant',
  [SHOP_TYPES.OTHER]: 'Other',
};

// Conditional Fields by Shop Type
export const SHOP_TYPE_FIELDS = {
  // Fields for supermarket and convenience stores
  [SHOP_TYPES.SUPERMARKET]: ['expiryDate', 'batchNumber', 'isPerishable'],
  [SHOP_TYPES.CONVENIENCE]: ['expiryDate', 'batchNumber', 'isPerishable'],
  
  // Fields for electronics stores (model = variant e.g. SKU/model number)
  [SHOP_TYPES.ELECTRONICS]: ['serialNumber', 'warrantyPeriod', 'specifications', 'hasVariants', 'models'],
  
  // Fields for hardware stores (model = variant e.g. pump model, tool model)
  [SHOP_TYPES.HARDWARE]: ['dimensions', 'weight', 'material', 'hasVariants', 'models'],
  
  // Fields for clothing and beauty (variants)
  [SHOP_TYPES.CLOTHING]: ['hasVariants', 'sizes', 'colors'],
  [SHOP_TYPES.BEAUTY]: ['expiryDate', 'batchNumber', 'hasVariants', 'sizes'],
  
  // Fields for auto parts (model = variant e.g. part model)
  [SHOP_TYPES.AUTO_PARTS]: ['partNumber', 'compatibility', 'vehicleModels', 'hasVariants', 'models'],
  
  // Fields for bookstore and stationery
  [SHOP_TYPES.BOOKSTORE]: ['isbn', 'author', 'publisher'],
  [SHOP_TYPES.STATIONERY]: ['isbn', 'brand'],
  
  // Fields for furniture
  [SHOP_TYPES.FURNITURE]: ['dimensions', 'weight', 'material', 'assemblyRequired'],
  
  // Sports store
  [SHOP_TYPES.SPORTS]: ['size', 'warrantyPeriod'],
  
  // Toy store
  [SHOP_TYPES.TOYS]: ['ageRange', 'batteryRequired'],
  
  // Pet store (pet food similar to supermarket)
  [SHOP_TYPES.PET]: ['expiryDate', 'isPerishable', 'batchNumber'],
  
  // Restaurant (size for pizza, etc.: small, medium, large, XL; hasVariants for size-based pricing; optionalFoods = add-ons)
  [SHOP_TYPES.RESTAURANT]: ['expiryDate', 'isPerishable', 'allergens', 'optionalFoods', 'size', 'hasVariants'],
  
  [SHOP_TYPES.OTHER]: ['hasVariants', 'models'],
};

// Fields to hide per shop type (simplify form)
// Note: sku, barcode, brand, reorderLevel, reorderQuantity, supplier show when Track stock is ON (all shop types)
export const SHOP_TYPE_HIDDEN_FIELDS = {};

// Shop-type-specific placeholder examples for form fields
export const SHOP_TYPE_PLACEHOLDERS = {
  [SHOP_TYPES.SUPERMARKET]: {
    productName: 'e.g., Milo 400g, Peak Milk 400g',
    category: 'e.g., Beverages, Dairy, Snacks',
    description: 'e.g., Nestle Milo chocolate malt drink',
  },
  [SHOP_TYPES.CONVENIENCE]: {
    productName: 'e.g., Coca-Cola 500ml, Bread',
    category: 'e.g., Drinks, Snacks, Essentials',
    description: 'e.g., Refreshing cola drink',
  },
  [SHOP_TYPES.HARDWARE]: {
    productName: 'e.g., PVC Pipe 2 inch, Cement 50kg',
    category: 'e.g., Plumbing, Building Materials',
    description: 'e.g., High-quality PVC pipe for plumbing',
  },
  [SHOP_TYPES.ELECTRONICS]: {
    productName: 'e.g., Samsung TV 55", iPhone Charger',
    category: 'e.g., TVs, Phones, Accessories',
    description: 'e.g., Smart TV with 4K resolution',
  },
  [SHOP_TYPES.CLOTHING]: {
    productName: 'e.g., Cotton T-Shirt, Jeans',
    category: 'e.g., Men, Women, Kids',
    description: 'e.g., Comfortable cotton t-shirt',
  },
  [SHOP_TYPES.FURNITURE]: {
    productName: 'e.g., Office Chair, Dining Table',
    category: 'e.g., Living Room, Bedroom, Office',
    description: 'e.g., Ergonomic office chair with lumbar support',
  },
  [SHOP_TYPES.BOOKSTORE]: {
    productName: 'e.g., Things Fall Apart, WAEC Past Questions',
    category: 'e.g., Fiction, Education, Textbooks',
    description: 'e.g., Classic African literature novel',
  },
  [SHOP_TYPES.AUTO_PARTS]: {
    productName: 'e.g., Brake Pad Toyota, Engine Oil 5W-30',
    category: 'e.g., Brakes, Engine Parts, Filters',
    description: 'e.g., Compatible with Toyota Corolla 2015-2020',
  },
  [SHOP_TYPES.BEAUTY]: {
    productName: 'e.g., Shea Butter Cream, Lipstick',
    category: 'e.g., Skincare, Makeup, Hair',
    description: 'e.g., Natural shea butter moisturizing cream',
  },
  [SHOP_TYPES.SPORTS]: {
    productName: 'e.g., Football, Running Shoes',
    category: 'e.g., Balls, Footwear, Equipment',
    description: 'e.g., Official size 5 football',
  },
  [SHOP_TYPES.TOYS]: {
    productName: 'e.g., Building Blocks, Doll House',
    category: 'e.g., Educational, Dolls, Games',
    description: 'e.g., Colorful building blocks for ages 3+',
  },
  [SHOP_TYPES.PET]: {
    productName: 'e.g., Dog Food 5kg, Cat Litter',
    category: 'e.g., Dog, Cat, Fish',
    description: 'e.g., Premium dry dog food for adult dogs',
  },
  [SHOP_TYPES.STATIONERY]: {
    productName: 'e.g., A4 Paper Ream, Bic Pen',
    category: 'e.g., Paper, Pens, Office Supplies',
    description: 'e.g., 500 sheets A4 white paper',
  },
  [SHOP_TYPES.RESTAURANT]: {
    productName: 'e.g., Jollof Rice, Fried Chicken',
    category: 'e.g., Main Dishes, Sides, Drinks',
    description: 'e.g., Delicious West African jollof rice',
  },
  [SHOP_TYPES.OTHER]: {
    productName: 'Enter product name',
    category: 'Select or create category',
    description: 'Enter product description',
  },
  default: {
    productName: 'Enter product name',
    category: 'Select or create category',
    description: 'Enter product description',
  },
};

// Product Field Labels
export const PRODUCT_FIELD_LABELS = {
  expiryDate: 'Expiry Date (optional)',
  batchNumber: 'Batch Number (optional)',
  isPerishable: 'Perishable (optional)',
  serialNumber: 'Serial Number (optional)',
  warrantyPeriod: 'Warranty Period (optional)',
  specifications: 'Specifications (optional)',
  dimensions: 'Dimensions (optional)',
  weight: 'Weight (optional)',
  material: 'Material (optional)',
  hasVariants: 'Has Variants',
  sizes: 'Available Sizes',
  colors: 'Available Colors',
  models: 'Available Models (optional)',
  partNumber: 'Part Number (optional)',
  compatibility: 'Compatibility (optional)',
  vehicleModels: 'Vehicle Models (optional)',
  isbn: 'ISBN/Code (optional)',
  author: 'Author (optional)',
  publisher: 'Publisher (optional)',
  assemblyRequired: 'Assembly Required (optional)',
  allergens: 'Allergens (optional)',
  optionalFoods: 'Optional foods / add-ons (optional)',
  size: 'Size (optional)',
  ageRange: 'Age Range (optional)',
  batteryRequired: 'Battery Required (optional)',
};

// Common Size Options (for clothing/beauty)
export const SIZE_OPTIONS = [
  { value: 'XS', label: 'Extra Small (XS)' },
  { value: 'S', label: 'Small (S)' },
  { value: 'M', label: 'Medium (M)' },
  { value: 'L', label: 'Large (L)' },
  { value: 'XL', label: 'Extra Large (XL)' },
  { value: 'XXL', label: 'Double XL (XXL)' },
  { value: '3XL', label: 'Triple XL (3XL)' },
];

// Common Color Options
export const COLOR_OPTIONS = [
  { value: 'black', label: 'Black' },
  { value: 'white', label: 'White' },
  { value: 'red', label: 'Red' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'orange', label: 'Orange' },
  { value: 'purple', label: 'Purple' },
  { value: 'pink', label: 'Pink' },
  { value: 'brown', label: 'Brown' },
  { value: 'grey', label: 'Grey' },
  { value: 'navy', label: 'Navy Blue' },
  { value: 'beige', label: 'Beige' },
];

// Warranty Period Options (in months)
export const WARRANTY_OPTIONS = [
  { value: 0, label: 'No Warranty' },
  { value: 3, label: '3 Months' },
  { value: 6, label: '6 Months' },
  { value: 12, label: '1 Year' },
  { value: 24, label: '2 Years' },
  { value: 36, label: '3 Years' },
];

// Stock Status Helpers
export const STOCK_STATUS = {
  IN_STOCK: 'in_stock',
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
};

export const getStockStatus = (quantity, reorderLevel) => {
  const qty = parseFloat(quantity) || 0;
  const reorder = parseFloat(reorderLevel) || 0;
  
  if (qty <= 0) return STOCK_STATUS.OUT_OF_STOCK;
  if (qty <= reorder) return STOCK_STATUS.LOW_STOCK;
  return STOCK_STATUS.IN_STOCK;
};

export const getStockStatusConfig = (quantity, reorderLevel) => {
  const status = getStockStatus(quantity, reorderLevel);
  
  switch (status) {
    case STOCK_STATUS.OUT_OF_STOCK:
      return { color: 'destructive', label: 'Out of Stock' };
    case STOCK_STATUS.LOW_STOCK:
      return { color: 'secondary', label: 'Low Stock' };
    default:
      return { color: 'default', label: 'In Stock' };
  }
};

/** Keys must stay in sync with Backend/services/notificationPreferenceHelper.js */
export const NOTIFICATION_PREFERENCE_CATEGORY_ORDER = [
  'job',
  'lead',
  'invoice',
  'payment',
  'order',
  'quote',
  'alert',
  'expense',
  'user',
];

export const NOTIFICATION_PREFERENCE_CATEGORY_LABELS = {
  job: 'Jobs',
  lead: 'Leads',
  invoice: 'Invoices',
  payment: 'Payments',
  order: 'Orders (kitchen / POS)',
  quote: 'Quotes',
  alert: 'Alerts & low stock',
  expense: 'Expenses',
  user: 'Team & invitations',
};

/** Channels that cannot be toggled off in Settings → Notifications (sync with notificationPreferenceHelper.js). */
export const NOTIFICATION_PREFERENCE_LOCKED_CHANNELS = {
  user: { in_app: 'not_applicable', email: 'always_on' },
};
