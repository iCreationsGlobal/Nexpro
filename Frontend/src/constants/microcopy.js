/**
 * Centralized Microcopy Constants
 * 
 * All user-facing text in the application should be defined here.
 * This enables consistent messaging, easier localization, and UX improvements.
 * 
 * Guidelines applied:
 * - Every error message answers "What went wrong?" + "How to fix it?"
 * - Button labels use specific action verbs (not generic "Submit", "OK")
 * - Empty states include title + description + CTA
 * - Placeholders show searchable fields, not "Search for X"
 * - Avoid casual language in error states (no "Oops!")
 * - Use imperative mood for validation messages
 */

// =============================================
// ERROR MESSAGES
// =============================================

export const ERROR_MESSAGES = {
  // Network/Connection errors
  NETWORK_ERROR: 'Connection lost. Check your internet and try again.',
  TIMEOUT_ERROR: 'Taking longer than expected. Try again or check your connection.',
  
  // Permission errors
  UNAUTHORIZED: "You don't have permission for this. Contact your admin if needed.",
  
  // Resource errors
  NOT_FOUND: "We couldn't find that. It may have been moved or deleted.",
  
  // Validation errors
  VALIDATION_ERROR: 'Please review the highlighted fields.',
  
  // Server errors
  SERVER_ERROR: 'Something went wrong on our end. Please try again shortly.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
  
  // Authentication errors
  INVALID_CREDENTIALS: 'Wrong email or password. Check and try again.',
  SESSION_EXPIRED: 'Your session expired. Please log in again.',
  
  // Data loading errors
  LOAD_FAILED: (entity) => `Couldn't load ${entity}. Pull down to refresh.`,
  
  // Action errors
  CREATE_FAILED: (entity) => `Couldn't create ${entity}. Please try again.`,
  UPDATE_FAILED: (entity) => `Couldn't update ${entity}. Please try again.`,
  DELETE_FAILED: (entity) => `Couldn't delete ${entity}. Please try again.`,
  SAVE_FAILED: 'Changes couldn\'t be saved. Please try again.',
  
  // Specific action errors
  PAYMENT_FAILED: 'Payment didn\'t go through. Check your details and try again.',
  UPLOAD_FAILED: 'Upload failed. Please try again.',
  DOWNLOAD_FAILED: 'Download failed. Please try again.',
  SEND_FAILED: 'Couldn\'t send. Please try again.',
  
  // Cart/POS errors
  CART_EMPTY: 'Your cart is empty. Add items to continue.',
  
  // File errors
  FILE_TOO_LARGE: (maxSizeMB) => `File too large. Maximum size is ${maxSizeMB}MB.`,
  INVALID_FILE_TYPE: 'This file type isn\'t supported.',
};

// =============================================
// SUCCESS MESSAGES
// =============================================

export const SUCCESS_MESSAGES = {
  // Generic (use contextual versions when possible)
  CREATED: (entity) => `${entity} created`,
  UPDATED: (entity) => `${entity} updated`,
  DELETED: (entity) => `${entity} deleted`,
  SAVED: 'Changes saved',
  
  // Specific entity messages
  CUSTOMER_ADDED: (name) => name ? `${name} added` : 'Customer added',
  JOB_CREATED: (jobNumber) => jobNumber ? `Job #${jobNumber} created` : 'Job created',
  INVOICE_PAID: (invoiceNumber) => invoiceNumber ? `Invoice #${invoiceNumber} paid` : 'Invoice marked as paid',
  RECEIPT_SENT: (destination) => destination ? `Receipt sent to ${destination}` : 'Receipt sent',
  STOCK_UPDATED: (product, quantity, unit) => 
    product ? `${product}: now ${quantity} ${unit || 'units'}` : 'Stock updated',
  
  // Action-specific
  PAYMENT_RECORDED: 'Payment recorded',
  SETTINGS_UPDATED: 'Settings updated',
  PROFILE_UPDATED: 'Profile updated',
  PASSWORD_CHANGED: 'Password changed',
  INVITE_SENT: 'Invite sent',
  INVITE_COPIED: 'Invite link copied',
  
  // File operations
  UPLOADED: 'Uploaded',
  DOWNLOADED: 'Downloaded',
  
  // Sync
  SYNCED: (count) => count > 1 ? `Synced ${count} items` : 'Synced',
};

// =============================================
// SEARCH PLACEHOLDERS
// =============================================

export const SEARCH_PLACEHOLDERS = {
  GLOBAL: 'Type to search...',
  CUSTOMERS: 'Name, email, or phone...',
  REVIEWS: 'Comment, email, phone, or rating...',
  CUSTOMER_FEEDBACK: 'Comment, email, phone, or rating...',
  INVOICES: 'Invoice #, customer, or amount...',
  LEADS: 'Name, company, or email...',
  JOBS: 'Job #, title, or customer...',
  QUOTES: 'Quote #, customer, or title...',
  VENDORS: 'Name, company, or category...',
  ASSETS: 'Name, tag, or location...',
  MATERIALS: 'Name, SKU, or category...',
  EQUIPMENT: 'Name, serial #, or location...',
  RENTALS: 'Customer, product, or status...',
  PRE_BOOKINGS: 'Customer, product, or status...',
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
  ADMIN_USERS: 'Name or email...',
  ADMIN_LEADS: 'Name, company, email, or phone...',
  ADMIN_JOBS: 'Title, description, or job #...',
  ADMIN_EXPENSES: 'Number, description, or category...',
  ADMIN_CUSTOMERS: 'Name, company, email, or phone...',
};

export const FEATURE_NOT_AVAILABLE = {
  SHOP_ONLY: {
    title: 'Feature not available',
    description: 'This feature is only available for shop business types.',
  },
  RESTAURANT_ONLY: {
    title: 'Feature not available',
    description: 'Order tracking is only available for restaurant tenants.',
  },
};

// =============================================
// EMPTY STATES
// =============================================

export const EMPTY_STATES = {
  // Customers
  CUSTOMERS: {
    imageKey: 'CUSTOMERS',
    icon: 'Users',
    title: 'No customers yet',
    description: 'Add your first customer to start tracking sales and building relationships.',
    primaryAction: 'Add Customer',
    secondaryAction: 'Import CSV',
  },
  CUSTOMERS_FILTERED: {
    icon: 'Users',
    title: 'No matching customers',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  
  // Jobs
  JOBS: {
    imageKey: 'JOBS',
    icon: 'Briefcase',
    title: 'No active jobs',
    description: 'Create a job to track orders and generate invoices automatically.',
    primaryAction: 'Create Job',
  },
  JOBS_FILTERED: {
    icon: 'Briefcase',
    title: 'No matching jobs',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },

  DELIVERIES: {
    imageKey: 'DELIVERIES',
    icon: 'Truck',
    title: 'Nothing here yet',
    description: 'Deliveries will appear when jobs or sales need delivery.',
  },

  TASKS: {
    imageKey: 'TASKS',
    icon: 'Clock',
    title: 'No tasks yet',
    description: 'Create tasks to track work in your workspace.',
    primaryAction: 'Add Task',
  },
  
  // Invoices
  INVOICES: {
    imageKey: 'INVOICES',
    icon: 'FileText',
    title: 'No invoices yet',
    description: 'Invoices are created automatically when you complete jobs.',
    primaryAction: 'View Jobs',
    secondaryAction: 'Create Invoice',
  },
  INVOICES_FILTERED: {
    icon: 'FileText',
    title: 'No matching invoices',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  INVOICES_SHOP: {
    imageKey: 'INVOICES',
    icon: 'FileText',
    title: 'No invoices yet',
    description: 'Create invoices from your sales or orders to track payments.',
    primaryAction: 'Create Invoice',
  },
  
  // Products
  PRODUCTS: {
    imageKey: 'PRODUCTS',
    icon: 'Package',
    title: 'Your catalog is empty',
    description: 'Add products to start selling.',
    primaryAction: 'Add Product',
    secondaryAction: 'Import CSV',
  },
  PRODUCTS_FILTERED: {
    icon: 'Package',
    title: 'No matching products',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  
  // Sales
  SALES: {
    imageKey: 'SALES',
    icon: 'ShoppingCart',
    title: 'No sales yet',
    description: 'Complete your first sale to see it here.',
    primaryAction: 'Point of Sale',
  },
  SALES_FILTERED: {
    icon: 'ShoppingCart',
    title: 'No matching sales',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  SALES_NO_PRODUCTS: {
    imageKey: 'SALES_NO_PRODUCTS',
    icon: 'Package',
    title: 'Add products before selling',
    description: "You haven't added any products yet. Add your products first before you can start selling.",
    primaryAction: 'Add Your First Product',
  },
  
  // Expenses
  EXPENSES: {
    imageKey: 'EXPENSES',
    icon: 'Receipt',
    title: 'No expenses yet',
    description: 'Track your business expenses to manage cash flow.',
    primaryAction: 'Add Expense',
  },
  EXPENSES_FILTERED: {
    icon: 'Receipt',
    title: 'No matching expenses',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  EXPENSES_APPROVED: {
    icon: 'Receipt',
    title: 'No approved expenses',
    description: 'Approved expenses will appear here.',
    primaryAction: 'Clear Filters',
  },
  EXPENSES_PENDING: {
    icon: 'Receipt',
    title: 'No pending requests',
    description: 'Expense requests awaiting approval will appear here.',
    primaryAction: 'Clear Filters',
  },
  
  // Leads
  LEADS: {
    imageKey: 'LEADS',
    icon: 'UserPlus',
    title: 'No leads yet',
    description: 'Track potential customers and convert them to sales.',
    primaryAction: 'Add Lead',
  },
  LEADS_FILTERED: {
    icon: 'UserPlus',
    title: 'No matching leads',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  
  // Vendors
  VENDORS: {
    icon: 'Truck',
    title: 'No vendors yet',
    description: 'Add suppliers to track purchases and compare prices.',
    primaryAction: 'Add Vendor',
  },
  VENDORS_FILTERED: {
    icon: 'Truck',
    title: 'No matching vendors',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  
  // Employees
  EMPLOYEES: {
    imageKey: 'EMPLOYEES',
    icon: 'Users',
    title: 'No employees yet',
    description: 'Add team members to manage payroll and schedules.',
    primaryAction: 'Add Employee',
  },
  EMPLOYEES_FILTERED: {
    icon: 'Users',
    title: 'No matching employees',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  
  // Users
  USERS: {
    icon: 'UserCog',
    title: 'No team members yet',
    description: 'Invite users to collaborate on your workspace.',
    primaryAction: 'Invite User',
  },
  USERS_FILTERED: {
    icon: 'UserCog',
    title: 'No matching users',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  
  // Quotes
  QUOTES: {
    imageKey: 'QUOTES',
    icon: 'FileText',
    title: 'No quotes yet',
    description: 'Create quotes to share pricing with potential customers.',
    primaryAction: 'Create Quote',
  },
  QUOTES_FILTERED: {
    icon: 'FileText',
    title: 'No matching quotes',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  
  // Equipment
  EQUIPMENT: {
    imageKey: 'EQUIPMENT',
    icon: 'Monitor',
    title: 'No equipment yet',
    description: 'Track company assets like computers, vehicles, and furniture.',
    primaryAction: 'Add Equipment',
  },
  EQUIPMENT_FILTERED: {
    icon: 'Monitor',
    title: 'No matching equipment',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },

  // Rentals
  WATCH: {
    icon: 'Eye',
    title: 'No watch incidents yet',
    description: 'Ingest counter activity from a phone MP4 or camera. ABS will compare it with recorded sales.',
    primaryAction: 'Refresh',
  },
  WATCH_FILTERED: {
    icon: 'Eye',
    title: 'No matching incidents',
    description: 'Try another bucket or clear the status filter.',
    primaryAction: 'Clear Filters',
  },

  RENTALS: {
    icon: 'Clock',
    title: 'No rentals yet',
    description: 'Hire out equipment, vehicles, or event items and track returns.',
    primaryAction: 'New Rental',
  },
  RENTALS_FILTERED: {
    icon: 'Clock',
    title: 'No matching rentals',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  PRE_BOOKINGS: {
    icon: 'Calendar',
    title: 'No pre-bookings yet',
    description: 'Reserve inventory for future rentals before confirming the hire.',
    primaryAction: 'New Pre-booking',
  },
  PRE_BOOKINGS_FILTERED: {
    icon: 'Calendar',
    title: 'No matching pre-bookings',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  RENTAL_NO_PRODUCTS: {
    icon: 'Package',
    title: 'Add rentable products first',
    description: 'Add items with daily rental rates before you create your first rental.',
    primaryAction: 'Add Rentable Product',
  },
  RENTAL_PRODUCTS: {
    icon: 'Package',
    title: 'Your rental catalog is empty',
    description: 'Add items with daily rates so customers can hire them out.',
    primaryAction: 'Add Rentable Product',
    secondaryAction: 'Import CSV',
  },
  
  // Materials
  MATERIALS: {
    imageKey: 'MATERIALS',
    icon: 'Layers',
    title: 'No materials yet',
    description: 'Track raw materials and supplies for your operations.',
    primaryAction: 'Add Material',
  },
  MATERIALS_FILTERED: {
    icon: 'Layers',
    title: 'No matching materials',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  
  // Pricing Templates
  PRICING_TEMPLATES: {
    imageKey: 'PRICING_TEMPLATES',
    icon: 'DollarSign',
    title: 'No pricing templates',
    description: 'Create templates to quickly apply standard pricing to jobs.',
    primaryAction: 'Create Template',
  },
  PRICING: {
    imageKey: 'PRICING_TEMPLATES',
    icon: 'DollarSign',
    title: 'No pricing templates',
    description: 'Create templates to quickly apply standard pricing to jobs.',
    primaryAction: 'Create Template',
  },
  PRICING_FILTERED: {
    icon: 'DollarSign',
    title: 'No matching templates',
    description: 'Try adjusting your filters or search terms.',
    primaryAction: 'Clear Filters',
  },
  
  // Pharmacy-specific
  DRUGS: {
    icon: 'Pill',
    title: 'No drugs yet',
    description: 'Add medications to your pharmacy catalog.',
    primaryAction: 'Add Drug',
  },
  PRESCRIPTIONS: {
    icon: 'ClipboardList',
    title: 'No prescriptions yet',
    description: 'Prescriptions will appear here when created.',
    primaryAction: 'Create Prescription',
  },
  PHARMACIES: {
    icon: 'Building2',
    title: 'No pharmacies yet',
    description: 'Add pharmacy locations to manage multiple branches.',
    primaryAction: 'Add Pharmacy',
  },
  
  // Shops
  SHOPS: {
    icon: 'Store',
    title: 'No shops yet',
    description: 'Add shop locations to manage multiple branches.',
    primaryAction: 'Add Shop',
  },
  STUDIO_LOCATIONS: {
    imageKey: 'STUDIO_LOCATIONS',
    icon: 'Building2',
    title: 'No studios yet',
    description: 'Add your first studio branch to separate customers and jobs by location.',
    primaryAction: 'Add Studio',
  },
  STUDIO_LOCATIONS_FILTERED: {
    icon: 'Building2',
    title: 'No matching studios',
    description: 'Try adjusting your search terms.',
  },
  
  // Accounting
  ACCOUNTS: {
    icon: 'Calculator',
    title: 'No accounts yet',
    description: 'Set up your chart of accounts to track finances.',
    primaryAction: 'Add Account',
  },
  JOURNAL_ENTRIES: {
    icon: 'BookOpen',
    title: 'No journal entries',
    description: 'Create journal entries to record transactions.',
    primaryAction: 'New Entry',
  },
  
  // Payroll
  PAYROLL: {
    imageKey: 'PAYROLL',
    icon: 'Wallet',
    title: 'No payroll runs',
    description: 'Create a payroll run to process employee payments.',
    primaryAction: 'Create Run',
  },
  
  // Reports
  REPORTS: {
    imageKey: 'REPORTS',
    icon: 'BarChart3',
    title: 'No reports yet',
    description: 'Generate reports to analyze your business performance.',
    primaryAction: 'Create Report',
  },
  REVIEWS: {
    imageKey: 'REVIEWS',
    icon: 'Star',
    title: 'No reviews yet',
    description: 'Customer reviews will appear here when people submit feedback from your review link.',
  },
  REVIEWS_FILTERED: {
    icon: 'Star',
    title: 'No matching reviews',
    description: 'Try adjusting your filters or search terms.',
  },
  
  // Notifications
  NOTIFICATIONS: {
    imageKey: 'NOTIFICATIONS',
    icon: 'Bell',
    title: 'No notifications',
    description: 'You\'re all caught up!',
  },
  
  // Search results
  SEARCH_NO_RESULTS: {
    imageKey: 'SEARCH_NO_RESULTS',
    icon: 'Search',
    title: 'No results found',
    description: 'Try different keywords or check spelling.',
    primaryAction: 'Clear Search',
  },
  
  // Offline state
  OFFLINE: {
    icon: 'WifiOff',
    title: 'You\'re offline',
    description: 'Connect to the internet to load data.',
    primaryAction: 'Retry',
  },
  
  // Generic
  NO_DATA: {
    icon: 'Inbox',
    title: 'No data available',
    description: 'There\'s nothing to show here yet.',
  },
  NO_ITEMS: {
    icon: 'Inbox',
    title: 'No items found',
    description: 'There\'s nothing to show here yet.',
  },
  
  // Activity/History
  NO_ACTIVITY: {
    icon: 'Clock',
    title: 'No activity yet',
    description: 'Activity will appear here as it happens.',
  },
  
  // Attachments/Files
  NO_ATTACHMENTS: {
    icon: 'Paperclip',
    title: 'No attachments',
    description: 'Upload files to attach them here.',
    primaryAction: 'Upload',
  },
  
  // Admin-specific
  ADMIN_TENANTS: {
    icon: 'Building',
    title: 'No tenants yet',
    description: 'Tenants will appear here when they sign up.',
  },
  ADMIN_ROLES: {
    icon: 'Shield',
    title: 'No roles yet',
    description: 'Create roles to manage permissions.',
    primaryAction: 'Create Role',
  },
};

// =============================================
// CONFIRMATION DIALOGS
// =============================================

export const CONFIRMATIONS = {
  // Delete actions (permanent)
  DELETE: {
    title: (entityName) => `Delete ${entityName}?`,
    description: "This can't be undone.",
    cancelLabel: 'Keep',
    confirmLabel: 'Delete',
  },
  DELETE_WITH_NAME: {
    title: 'Delete this item?',
    description: (name) => `"${name}" will be permanently deleted.`,
    cancelLabel: 'Keep',
    confirmLabel: 'Delete',
  },
  
  // Archive actions (reversible)
  ARCHIVE: {
    title: (entityName) => `Archive ${entityName}?`,
    description: 'You can restore it anytime from filters.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Archive',
  },
  
  // Cancel actions
  CANCEL_INVOICE: {
    title: (invoiceNumber) => `Cancel invoice${invoiceNumber ? ` #${invoiceNumber}` : ''}?`,
    description: 'The customer won\'t be charged.',
    cancelLabel: 'Keep',
    confirmLabel: 'Cancel Invoice',
  },
  
  // Convert actions
  CONVERT_LEAD: {
    title: 'Convert to customer?',
    description: 'This creates a customer record you can edit later.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Convert',
  },
  CONVERT_QUOTE_TO_JOB: {
    title: 'Convert to job?',
    description: 'This creates a job from this quote.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Convert',
  },
  CONVERT_QUOTE_TO_SALE: {
    title: 'Convert to sale?',
    description: 'This creates a sale from this quote.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Convert',
  },
  
  // Deactivate actions
  DEACTIVATE: {
    title: (entityName) => `Deactivate ${entityName}?`,
    description: 'You can reactivate it later.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Deactivate',
  },
  
  // Revoke actions
  REVOKE_INVITE: {
    title: 'Revoke invite?',
    description: 'The invite link will no longer work.',
    cancelLabel: 'Keep',
    confirmLabel: 'Revoke',
  },
  
  // Remove actions
  REMOVE_ATTACHMENT: {
    title: 'Remove attachment?',
    description: "This can't be undone.",
    cancelLabel: 'Keep',
    confirmLabel: 'Remove',
  },
  REMOVE_ROLE: {
    title: (roleName, userName) => `Remove ${roleName} from ${userName}?`,
    description: 'Their permissions will be updated.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Remove',
  },
  
  // Unsaved changes
  UNSAVED_CHANGES: {
    title: 'Unsaved changes',
    description: 'You have unsaved changes. Discard them?',
    cancelLabel: 'Keep Editing',
    confirmLabel: 'Discard',
  },
  
  // Logout
  LOGOUT: {
    title: 'Log out?',
    description: 'You\'ll need to sign in again to access your account.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Log Out',
  },
};

// =============================================
// VALIDATION MESSAGES
// =============================================

export const VALIDATION = {
  // Required fields (imperative mood)
  REQUIRED: (fieldName) => `Enter ${fieldName}`,
  REQUIRED_SELECT: (fieldName) => `Select ${fieldName}`,
  
  // Specific required fields
  EMAIL_REQUIRED: 'Enter your email',
  PASSWORD_REQUIRED: 'Enter your password',
  NAME_REQUIRED: 'Enter a name',
  PHONE_REQUIRED: 'Enter a phone number',
  AMOUNT_REQUIRED: 'Enter an amount',
  
  // Format validation
  EMAIL_INVALID: 'Enter a valid email',
  PHONE_INVALID: 'Enter a valid phone number',
  URL_INVALID: 'Enter a valid URL',
  
  // Password validation
  PASSWORD_MIN_LENGTH: 'Use at least 6 characters',
  PASSWORD_COMPLEXITY: 'Use uppercase, lowercase, and a number',
  PASSWORD_MISMATCH: "Passwords don't match",
  
  // Numeric validation
  MIN_VALUE: (min) => `Must be ${min} or more`,
  MAX_VALUE: (max) => `Must be ${max} or less`,
  POSITIVE_NUMBER: 'Enter a positive number',
  QUANTITY_MIN: 'Quantity must be 1 or more',
  AMOUNT_POSITIVE: 'Enter an amount greater than 0',
  
  // Length validation
  MIN_LENGTH: (min) => `Use at least ${min} characters`,
  MAX_LENGTH: (max) => `Use ${max} characters or fewer`,
  
  // Array validation
  MIN_ITEMS: (min, itemName) => `Add at least ${min} ${itemName}`,
  
  // Custom
  JOURNAL_BALANCE: 'Total debits must equal total credits',
  JOURNAL_MIN_LINES: 'Add at least 2 journal lines',
};

// =============================================
// BUTTON LABELS
// =============================================

export const BUTTON_LABELS = {
  // Primary actions
  SAVE: 'Save',
  CREATE: 'Create',
  ADD: 'Add',
  UPDATE: 'Update',
  SUBMIT: 'Submit',
  CONFIRM: 'Confirm',
  DONE: 'Done',
  
  // Secondary actions
  CANCEL: 'Cancel',
  CLOSE: 'Close',
  BACK: 'Back',
  SKIP: 'Skip',
  
  // Destructive actions
  DELETE: 'Delete',
  REMOVE: 'Remove',
  ARCHIVE: 'Archive',
  
  // Loading states (use three dots, not ellipsis character)
  SAVING: 'Saving...',
  CREATING: 'Creating...',
  UPDATING: 'Updating...',
  DELETING: 'Deleting...',
  LOADING: 'Loading...',
  SUBMITTING: 'Submitting...',
  PROCESSING: 'Processing...',
  CONVERTING: 'Converting...',
  ARCHIVING: 'Archiving...',
  UPLOADING: 'Uploading...',
  DOWNLOADING: 'Downloading...',
  SENDING: 'Sending...',
  
  // Contextual actions
  ADD_CUSTOMER: 'Add Customer',
  CREATE_JOB: 'Create Job',
  CREATE_QUOTE: 'Create Quote',
  CREATE_INVOICE: 'Create Invoice',
  ADD_PRODUCT: 'Add Product',
  ADD_EXPENSE: 'Add Expense',
  POINT_OF_SALE: 'Point of Sale',
  
  // Filter actions
  FILTER: 'Filter',
  CLEAR_FILTERS: 'Clear Filters',
  APPLY_FILTERS: 'Apply Filters',
  RESET: 'Reset',
  
  // Refresh
  REFRESH: 'Refresh',
  RETRY: 'Retry',
  
  // Import/Export
  IMPORT: 'Import',
  EXPORT: 'Export',
  DOWNLOAD: 'Download',
  UPLOAD: 'Upload',
  
  // Convert actions
  CONVERT_TO_CUSTOMER: 'Convert to Customer',
  CONVERT_TO_JOB: 'Convert to Job',
  CONVERT_TO_SALE: 'Convert to Sale',
  
  // Mark actions
  MARK_AS_PAID: 'Mark as Paid',
  MARK_AS_SENT: 'Mark as Sent',
  
  // Approval actions
  APPROVE: 'Approve',
  REJECT: 'Reject',
};

// =============================================
// TOOLTIPS
// =============================================

export const TOOLTIPS = {
  // Filter buttons
  FILTER: 'Filter results',
  FILTER_BY: (options) => `Filter by ${options}`,
  
  // Refresh buttons
  REFRESH: 'Refresh list',
  REFRESH_DATA: 'Reload data',
  
  // Add buttons
  ADD_NEW: (entity) => `Add new ${entity}`,
  
  // Export buttons
  EXPORT: 'Download as CSV or PDF',
  DOWNLOAD_PDF: 'Download as PDF',
  DOWNLOAD_CSV: 'Download as CSV',
  
  // Print
  PRINT: 'Print',
  PRINT_RECEIPT: 'Print receipt',
  
  // Send
  SEND: 'Send',
  SEND_EMAIL: 'Send via email',
  SEND_SMS: 'Send via SMS',
  SEND_WHATSAPP: 'Send via WhatsApp',
  
  // View toggles
  LIST_VIEW: 'List view',
  CARD_VIEW: 'Card view',
  GRID_VIEW: 'Grid view',
  
  // Navigation
  GO_BACK: 'Go back',
  GO_TO: (page) => `Go to ${page}`,
  
  // Actions
  EDIT: 'Edit',
  DELETE: 'Delete',
  COPY: 'Copy',
  COPY_LINK: 'Copy link',
  
  // Help
  LEARN_MORE: 'Learn more',
  HELP: 'Help',
};

// =============================================
// FORM HINTS (Pre-validation)
// =============================================

export const FORM_HINTS = {
  // Password hints
  PASSWORD: 'Use 6+ characters with uppercase, lowercase, and a number',
  PASSWORD_CONFIRM: 'Enter the same password again',
  
  // Phone hints
  PHONE: 'e.g., 024 123 4567',
  PHONE_WITH_CODE: 'e.g., +233 24 123 4567',
  
  // Email hints
  EMAIL: 'e.g., name@example.com',
  EMAIL_CONFIRMATION: "We'll send a confirmation link",
  
  // URL hints
  WEBSITE: 'e.g., https://example.com',
  
  // Business hints
  BUSINESS_EMAIL: 'Used on invoices and receipts',
  BUSINESS_NAME: 'Your registered business name',
  
  // Product hints
  TRACK_STOCK: 'Turn off for made-to-order items',
  BARCODE: 'Scan at POS. No barcode? Use Generate QR.',
  REORDER_LEVEL: 'Alert when stock falls below this',
  SKU: 'Unique product identifier',
  
  // Financial hints
  PAYMENT_TERMS: 'e.g., Net 30, Due on Receipt',
  INVOICE_FOOTER: 'Custom message shown on all invoices',
  
  // Settings hints
  SUPPORT_EMAIL: 'Used when users click "Contact support"',
};

// =============================================
// LOADING STATES
// =============================================

export const LOADING = {
  DEFAULT: 'Loading...',
  DATA: 'Loading data...',
  PRODUCTS: 'Loading products...',
  CUSTOMERS: 'Loading customers...',
  GENERATING: 'Generating...',
  GENERATING_PDF: 'Generating PDF...',
  GENERATING_REPORT: 'Generating report...',
  PROCESSING: 'Processing...',
  PLEASE_WAIT: 'Please wait...',
};

// =============================================
// INFO MESSAGES
// =============================================

export const INFO = {
  INSTANT_SERVICE: 'Instant service - Due date set to today',
  DISCOUNT_APPLIED: (percent, quantity) => `${percent}% discount applied for quantity ${quantity}!`,
  EXISTING_INVITE: 'User already has an active invite.',
  OFFLINE_SAVED: 'Saved offline. Will sync when connected.',
};

// =============================================
// WARNING MESSAGES
// =============================================

export const WARNINGS = {
  LOW_STOCK: (product) => `${product} is running low`,
  OUT_OF_STOCK: (product) => `${product} is out of stock!`,
  UNSAVED_CHANGES: 'You have unsaved changes',
  SESSION_EXPIRING: 'Your session is about to expire',
  CATEGORY_EXISTS: 'This category already exists',
  NO_REPORT_DATA: 'No report data to download',
};
