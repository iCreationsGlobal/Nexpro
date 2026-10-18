/**
 * Tour Configuration
 * Defines all tour steps for different business types
 */

import { STUDIO_LIKE_TYPES } from '../constants';

// Tour step definitions
export const TOUR_STEPS = {
  // Universal steps (all business types)
  WELCOME: {
    id: 'welcome',
    target: '[data-tour="dashboard-main"]',
    content: 'Welcome to African Business Suite! This is your dashboard. Here you’ll see your summary cards (revenue, expenses, profit), recent sales or jobs, and the notice board with updates. Use the steps ahead to explore the rest of the app.',
    placement: 'bottom',
    disableBeacon: true
  },
  DASHBOARD_STATS: {
    id: 'dashboard-stats',
    target: '[data-tour="dashboard-stats"]',
    content: 'These cards show your key business metrics at a glance. Click any card to see detailed breakdowns.',
    placement: 'bottom',
    disableBeacon: true
  },
  DATE_FILTERS: {
    id: 'date-filters',
    target: '[data-tour="date-filters"]',
    content: 'Filter your dashboard data by date range - Today, This Week, This Month, or custom ranges.',
    placement: 'bottom',
    disableBeacon: true
  },
  SIDEBAR: {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    content: 'Use the sidebar to navigate between different sections of your app. Click any menu item to explore.',
    placement: 'right',
    disableBeacon: true
  },
  QUICK_ACTIONS: {
    id: 'quick-actions',
    target: '[data-tour="quick-actions"]',
    content: 'Quick actions let you perform common tasks faster - like creating a new sale or adding a customer.',
    placement: 'right',
    disableBeacon: true,
    conditional: true // Only show if quick actions exist
  },
  HEADER_SEARCH: {
    id: 'header-search',
    target: '[data-tour="header-search"]',
    content: 'Search across your entire database - customers, products, jobs, invoices, and more.',
    placement: 'bottom',
    disableBeacon: true
  },
  HEADER_NOTIFICATIONS: {
    id: 'header-notifications',
    target: '[data-tour="header-notifications"]',
    content: 'Click here to see important notifications and updates about your business.',
    placement: 'bottom',
    disableBeacon: true
  },
  RECENT_ACTIVITY: {
    id: 'recent-activity',
    target: '[data-tour="recent-activity"]',
    content: 'View your recent transactions and activities here. This helps you stay on top of what\'s happening.',
    placement: 'top',
    disableBeacon: true
  },
  NOTICE_BOARD: {
    id: 'notice-board',
    target: '[data-tour="notice-board"]',
    content: 'Important updates and notifications appear here. Check this regularly for business insights.',
    placement: 'left',
    disableBeacon: true
  },

  // Shop-specific steps
  PRODUCTS_ONBOARDING: {
    id: 'products-onboarding',
    target: '[data-tour="nav-products"]',
    content: 'Start by adding your products. Click Products to set them up with names, prices, and stock levels. You can also view and edit products here.',
    placement: 'right',
    disableBeacon: true,
    businessTypes: ['shop', 'pharmacy']
  },
  SALES_ENTRY: {
    id: 'sales-entry',
    target: '[data-tour="nav-sales"]',
    content: 'After adding products, use Sales to record what you sell and take payment at the Point of Sale.',
    placement: 'right',
    disableBeacon: true,
    businessTypes: ['shop', 'pharmacy']
  },
  CUSTOMERS_ENTRY: {
    id: 'customers-entry',
    target: '[data-tour="nav-customers"]',
    content: 'Keep track of who buys from you. Use Customers to save customer details so you can understand and grow your business.',
    placement: 'right',
    disableBeacon: true,
    businessTypes: ['shop', 'pharmacy', 'printing_press', 'mechanic', 'barber', 'salon', 'studio']
  },
  EXPENSES_ENTRY: {
    id: 'expenses-entry',
    target: '[data-tour="nav-expenses"]',
    content: 'Track operating costs. Use Expenses for rent, salaries, utilities, and similar spending — not inventory purchases (those are counted as COGS when products sell).',
    placement: 'right',
    disableBeacon: true,
    businessTypes: ['shop', 'pharmacy', 'printing_press', 'mechanic', 'barber', 'salon', 'studio']
  },
  WORKSPACE_ENTRY: {
    id: 'workspace-entry',
    target: '[data-tour="personal-list"]',
    content: 'Use My Workspace to keep a simple list of what you want to focus on this week and tasks you need to complete.',
    placement: 'right',
    disableBeacon: true,
    businessTypes: ['shop', 'pharmacy', 'printing_press', 'mechanic', 'barber', 'salon', 'studio']
  },
  SETTINGS_ENTRY: {
    id: 'settings-entry',
    target: '[data-tour="nav-settings"]',
    content: 'Important configurations live here: business name and contact, currency, tax settings, receipt and invoice defaults, and SMS and WhatsApp integration for receipts and notifications. Use Settings when you need to change how your business appears, how sales and reports are calculated, or to connect your messaging channels.',
    placement: 'right',
    disableBeacon: true,
    businessTypes: ['shop', 'pharmacy', 'printing_press', 'mechanic', 'barber', 'salon', 'studio']
  },
  REPORTS_ENTRY: {
    id: 'reports-entry',
    target: '[data-tour="nav-reports"]',
    content: 'View Reports to see your business summary, smart reports, and compliance reports.',
    placement: 'right',
    disableBeacon: true,
    businessTypes: ['shop', 'pharmacy', 'printing_press', 'mechanic', 'barber', 'salon', 'studio']
  },

  SALES_LIST: {
    id: 'sales-list',
    target: '[data-tour="sales-list"]',
    content: 'View all your sales transactions here. Filter by date, customer, or payment method.',
    placement: 'top',
    disableBeacon: true,
    businessTypes: ['shop', 'pharmacy']
  },
  SALES_ADD: {
    id: 'sales-add',
    target: '[data-tour="sales-add-button"]',
    content: 'Click here to record a new sale. You can also use the Point of Sale (POS) for quick checkout.',
    placement: 'bottom',
    disableBeacon: true,
    businessTypes: ['shop', 'pharmacy']
  },
  PRODUCTS_LIST: {
    id: 'products-list',
    target: '[data-tour="products-list"]',
    content: 'Manage your product catalog here. Add products, set prices, and track inventory levels.',
    placement: 'top',
    disableBeacon: true,
    businessTypes: ['shop']
  },
  MATERIALS_ITEMS: {
    id: 'materials-items',
    target: '[data-tour="materials-items"]',
    content: 'Track stock levels, set reorder points, and manage materials. Color-coded indicators show stock status.',
    placement: 'top',
    disableBeacon: true,
    businessTypes: ['shop', 'pharmacy']
  },

  // Studio-specific steps (sidebar nav targets for main tour)
  JOBS_ENTRY: {
    id: 'jobs-entry',
    target: '[data-tour="nav-jobs"]',
    content: 'Start here with Jobs. Create orders for customers, add line items, set due dates, and track status. You can turn quotes into jobs when they\'re approved.',
    placement: 'right',
    disableBeacon: true,
    businessTypes: ['printing_press', 'mechanic', 'barber', 'salon', 'studio']
  },
  QUOTES_ENTRY: {
    id: 'quotes-entry',
    target: '[data-tour="nav-quotes"]',
    content: 'Create and send quotes to customers. When they approve, convert a quote into a job in one click.',
    placement: 'right',
    disableBeacon: true,
    businessTypes: ['printing_press']
  },
  INVOICES_ENTRY: {
    id: 'invoices-entry',
    target: '[data-tour="nav-invoices"]',
    content: 'Send invoices from completed jobs or sales. Track what\'s paid and what\'s due here.',
    placement: 'right',
    disableBeacon: true,
    businessTypes: ['printing_press', 'mechanic', 'barber', 'salon', 'studio']
  },

  // Studio-specific steps (page-level targets, used when includeCommon is true)
  JOBS_LIST: {
    id: 'jobs-list',
    target: '[data-tour="jobs-list"]',
    content: 'Manage all your jobs here. Track status, deadlines, and assignments. Create new jobs for customers.',
    placement: 'top',
    disableBeacon: true,
    businessTypes: ['printing_press', 'mechanic', 'barber', 'salon', 'studio']
  },
  JOBS_ADD: {
    id: 'jobs-add',
    target: '[data-tour="jobs-add"]',
    content: 'Create a new job for a customer. Add items, set priorities, and assign team members.',
    placement: 'bottom',
    disableBeacon: true,
    businessTypes: ['printing_press', 'mechanic', 'barber', 'salon', 'studio']
  },
  QUOTES_LIST: {
    id: 'quotes-list',
    target: '[data-tour="quotes-list"]',
    content: 'Create and manage quotes for potential customers. Convert approved quotes directly into jobs.',
    placement: 'top',
    disableBeacon: true,
    businessTypes: ['printing_press']
  },
  PRICING_TEMPLATES: {
    id: 'pricing-templates',
    target: '[data-tour="pricing-templates"]',
    content: 'Create reusable pricing templates for common jobs. This speeds up job creation significantly.',
    placement: 'top',
    disableBeacon: true,
    businessTypes: ['printing_press']
  },

  // Pharmacy-specific steps
  PRESCRIPTIONS_LIST: {
    id: 'prescriptions-list',
    target: '[data-tour="prescriptions-list"]',
    content: 'Manage customer prescriptions and track medication dispensing. Create new prescriptions as needed.',
    placement: 'top',
    disableBeacon: true,
    businessTypes: ['pharmacy']
  },
  DRUGS_LIST: {
    id: 'drugs-list',
    target: '[data-tour="drugs-list"]',
    content: 'Manage your pharmaceutical inventory and drug catalog. View detailed information about each drug.',
    placement: 'top',
    disableBeacon: true,
    businessTypes: ['pharmacy']
  },

  // Common features
  CUSTOMERS_LIST: {
    id: 'customers-list',
    target: '[data-tour="customers-list"]',
    content: 'Manage your customer database. Add, edit, and view customer information and transaction history.',
    placement: 'top',
    disableBeacon: true
  },
  INVOICES_LIST: {
    id: 'invoices-list',
    target: '[data-tour="invoices-list"]',
    content: 'View and manage all invoices. Generate invoices from jobs or sales, and track payment status.',
    placement: 'top',
    disableBeacon: true
  },
  EXPENSES_LIST: {
    id: 'expenses-list',
    target: '[data-tour="expenses-list"]',
    content: 'Track all business expenses to monitor your spending. Categorize expenses for better reporting.',
    placement: 'top',
    disableBeacon: true
  }
};

/**
 * Get tour steps for a specific business type
 * @param {string} businessType - Business type (shop, pharmacy, printing_press, etc.)
 * @param {boolean} includeCommon - Include common feature tours
 * @returns {Array} Array of tour step objects
 */
export const getTourSteps = (businessType, includeCommon = false) => {
  const steps = [];

  // For shops and pharmacies: 1–6 core, 7–10 Settings, Reports, Quick actions, My workspace.
  if (businessType === 'shop' || businessType === 'pharmacy') {
    steps.push(
      TOUR_STEPS.WELCOME,
      TOUR_STEPS.PRODUCTS_ONBOARDING,
      TOUR_STEPS.SALES_ENTRY,
      TOUR_STEPS.CUSTOMERS_ENTRY,
      TOUR_STEPS.EXPENSES_ENTRY,
      TOUR_STEPS.HEADER_SEARCH,
      TOUR_STEPS.SETTINGS_ENTRY,
      TOUR_STEPS.REPORTS_ENTRY,
      TOUR_STEPS.QUICK_ACTIONS,
      TOUR_STEPS.WORKSPACE_ENTRY
    );

    if (includeCommon) {
      // Optionally extend with wider app exploration steps
      steps.push(
        TOUR_STEPS.DASHBOARD_STATS,
        TOUR_STEPS.DATE_FILTERS,
        TOUR_STEPS.SIDEBAR,
        TOUR_STEPS.QUICK_ACTIONS,
        TOUR_STEPS.RECENT_ACTIVITY,
        TOUR_STEPS.NOTICE_BOARD,
        TOUR_STEPS.CUSTOMERS_LIST,
        TOUR_STEPS.INVOICES_LIST,
        TOUR_STEPS.EXPENSES_LIST
      );
    }
  } else if (STUDIO_LIKE_TYPES.includes(businessType)) {
    // Studio tour: same structure as shop – sidebar-focused flow with Jobs, optional Quotes, Customers, Invoices, Expenses, then Search, Settings, Reports, Quick actions, Workspace.
    const studioSteps = [
      TOUR_STEPS.WELCOME,
      TOUR_STEPS.JOBS_ENTRY,
      ...(businessType === 'printing_press' ? [TOUR_STEPS.QUOTES_ENTRY] : []),
      TOUR_STEPS.CUSTOMERS_ENTRY,
      TOUR_STEPS.INVOICES_ENTRY,
      TOUR_STEPS.EXPENSES_ENTRY,
      TOUR_STEPS.HEADER_SEARCH,
      TOUR_STEPS.SETTINGS_ENTRY,
      TOUR_STEPS.REPORTS_ENTRY,
      TOUR_STEPS.QUICK_ACTIONS,
      TOUR_STEPS.WORKSPACE_ENTRY
    ];
    steps.push(...studioSteps);
  } else {
    // Default dashboard tour for other business types
    steps.push(
      TOUR_STEPS.WELCOME,
      TOUR_STEPS.DASHBOARD_STATS,
      TOUR_STEPS.DATE_FILTERS,
      TOUR_STEPS.SIDEBAR,
      TOUR_STEPS.QUICK_ACTIONS,
      TOUR_STEPS.HEADER_SEARCH,
      TOUR_STEPS.HEADER_NOTIFICATIONS,
      TOUR_STEPS.RECENT_ACTIVITY,
      TOUR_STEPS.NOTICE_BOARD
    );

    if (includeCommon) {
      if (businessType === 'pharmacy') {
        steps.push(
          TOUR_STEPS.SALES_LIST,
          TOUR_STEPS.SALES_ADD,
          TOUR_STEPS.PRESCRIPTIONS_LIST,
          TOUR_STEPS.DRUGS_LIST,
          TOUR_STEPS.MATERIALS_ITEMS
        );
      } else if (STUDIO_LIKE_TYPES.includes(businessType)) {
        steps.push(
          TOUR_STEPS.JOBS_LIST,
          TOUR_STEPS.JOBS_ADD
        );
        
        if (businessType === 'printing_press') {
          steps.push(
            TOUR_STEPS.QUOTES_LIST,
            TOUR_STEPS.PRICING_TEMPLATES
          );
        }
      }

      steps.push(
        TOUR_STEPS.CUSTOMERS_LIST,
        TOUR_STEPS.INVOICES_LIST,
        TOUR_STEPS.EXPENSES_LIST
      );
    }
  }

  // Filter out steps that don't match business type and add step numbers
  return steps
    .filter(step => {
      // If step has businessTypes array, check if current type matches
      if (step.businessTypes && !step.businessTypes.includes(businessType)) {
        return false;
      }
      return true;
    })
    .map((step, index) => ({
      ...step,
      stepIndex: index + 1,
      totalSteps: 0 // Will be set after filtering
    }))
    .map((step, index, array) => ({
      ...step,
      totalSteps: array.length
    }));
};

/**
 * Tour IDs
 */
export const TOUR_IDS = {
  MAIN_TOUR: 'mainTour',
  DASHBOARD_TOUR: 'dashboardTour',
  SALES_TOUR: 'salesTour',
  JOBS_TOUR: 'jobsTour',
  MATERIALS_TOUR: 'materialsTour',
  CUSTOMERS_TOUR: 'customersTour',
  INVOICES_TOUR: 'invoicesTour',
  EXPENSES_TOUR: 'expensesTour'
};

/**
 * Tour configuration for React Joyride
 */
/**
 * @param {string} businessType
 * @param {boolean} run
 * @param {string} [brandPrimaryHex] - workspace primary (hex), e.g. from organization settings
 */
export const getJoyrideConfig = (businessType, run = false, brandPrimaryHex = '#166534') => {
  const primary = /^#[0-9A-Fa-f]{6}$/.test(brandPrimaryHex || '') ? brandPrimaryHex : '#166534';
  const steps = getTourSteps(businessType, false);

  // Filter out steps whose targets are not present in the DOM to avoid
  // react-joyride crashes when it tries to read properties from null.
  const stepsWithTargets = steps.filter((step) => {
    if (!step.target) return true;
    if (typeof document === 'undefined') return true;
    try {
      return !!document.querySelector(step.target);
    } catch {
      return false;
    }
  });
  
  return {
    steps: stepsWithTargets.map(step => ({
      target: step.target,
      content: step.content,
      placement: step.placement || 'bottom',
      disableBeacon: step.disableBeacon !== false,
      disableOverlayClose: false,
      hideCloseButton: false,
      spotlightClicks: false,
      spotlightPadding: 5,
      stepId: step.id,
    })),
    continuous: true,
    showProgress: true,
    showSkipButton: true,
    run,
    styles: {
      options: {
        primaryColor: primary,
        zIndex: 10000
      },
      tooltip: {
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        minWidth: '420px',
        maxWidth: '520px',
        padding: '20px'
      },
      tooltipContainer: {
        textAlign: 'left'
      },
      buttonNext: {
        backgroundColor: primary,
        borderRadius: '6px',
        border: 'none',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '500',
        padding: '8px 16px'
      },
      buttonBack: {
        color: primary,
        marginRight: '8px',
        fontSize: '14px',
        fontWeight: '500'
      },
      buttonSkip: {
        color: '#6b7280',
        fontSize: '14px'
      },
      beacon: {
        inner: primary,
        outer: primary
      }
    },
    locale: {
      back: 'Back',
      close: 'Close',
      last: 'Finish',
      next: 'Next',
      skip: 'Skip tour'
    }
  };
};
