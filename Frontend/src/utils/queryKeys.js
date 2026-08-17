/**
 * Centralized React Query keys for the web app.
 * Prefixes stay broad so existing invalidation helpers can target whole resource families.
 */
export const queryKeys = {
  sales: {
    all: ['sales'],
    detailRoot: ['sale'],
    list: (tenantId, shopId, params = {}) => ['sales', tenantId, shopId, params],
    detail: (id) => ['sale', id],
  },
  invoices: {
    all: ['invoices'],
    detailRoot: ['invoice'],
    list: (tenantId, shopId, studioLocationId, params = {}) => ['invoices', tenantId, shopId, studioLocationId, params],
    stats: (tenantId, shopId, studioLocationId) => ['invoices', 'stats', tenantId, shopId, studioLocationId],
    detail: (id) => ['invoice', id],
  },
  quotes: {
    all: ['quotes'],
    detailRoot: ['quote'],
    list: (tenantId, shopId, studioLocationId, params = {}) => ['quotes', tenantId, shopId, studioLocationId, params],
    detail: (id) => ['quote', id],
    activities: (id) => ['quote', id, 'activities'],
  },
  customers: {
    all: ['customers'],
    detailRoot: ['customer'],
    list: (tenantId, shopId, studioLocationId, params = {}) => ['customers', tenantId, shopId, studioLocationId, params],
    picker: (tenantId, shopId, studioLocationId, scope = 'picker') => ['customers', scope, tenantId, shopId, studioLocationId],
    stats: (tenantId, shopId, studioLocationId) => ['customers', 'stats', tenantId, shopId, studioLocationId],
    detail: (id) => ['customer', id],
  },
  dealers: {
    all: ['dealers'],
    list: (tenantId, params = {}) => ['dealers', tenantId, params],
    stats: (tenantId) => ['dealers', 'stats', tenantId],
    detail: (id) => ['dealer', id],
    ledger: (id, params = {}) => ['dealer', id, 'ledger', params],
    statement: (id, params = {}) => ['dealer', id, 'statement', params],
  },
  products: {
    all: ['products'],
    detailRoot: ['product'],
    list: (tenantId, shopId, studioLocationId, params = {}) => ['products', tenantId, shopId, studioLocationId, params],
    active: (tenantId, shopId) => ['products', 'active', tenantId, shopId],
    categories: (tenantId, shopId, studioLocationId) => ['products', 'categories', tenantId, shopId, studioLocationId],
    stats: (tenantId, shopId, studioLocationId) => ['products', 'stats', tenantId, shopId, studioLocationId],
    detail: (id, tenantId, shopId, studioLocationId) => ['product', id, tenantId, shopId, studioLocationId],
  },
  expenses: {
    all: ['expenses'],
    detailRoot: ['expense'],
    list: (tenantId, shopId, studioLocationId, params = {}) => ['expenses', tenantId, shopId, studioLocationId, params],
    categories: (tenantId) => ['expenses', 'categories', tenantId],
    stats: (tenantId, shopId, studioLocationId) => ['expenses', 'stats', tenantId, shopId, studioLocationId],
  },
  dashboard: {
    all: ['dashboard'],
    summary: (tenantId, shopId, studioLocationId, params = {}) => ['dashboard', tenantId, shopId, studioLocationId, params],
    overview: (tenantId, shopId, studioLocationId, params = {}) => ['dashboard', 'overview', tenantId, shopId, studioLocationId, params],
    aiInsight: (tenantId, shopId, studioLocationId, params = {}) => ['dashboard', 'ai-insight', tenantId, shopId, studioLocationId, params],
  },
  orders: {
    all: ['orders'],
    detailRoot: ['order'],
    list: (tenantId, shopId, params = {}) => ['orders', tenantId, shopId, params],
    detail: (id) => ['order', id],
  },
  jobs: {
    all: ['jobs'],
    detailRoot: ['job'],
    list: (tenantId, shopId, studioLocationId, params = {}) => ['jobs', tenantId, shopId, studioLocationId, params],
    stats: (tenantId, shopId, studioLocationId) => ['jobs', 'stats', tenantId, shopId, studioLocationId],
    categories: (tenantId, studioLocationId, studioType) => ['jobs', 'categories', tenantId, studioLocationId, studioType],
    detail: (id) => ['job', id],
  },
  leads: {
    all: ['leads'],
    detailRoot: ['lead'],
    list: (tenantId, studioLocationId, params = {}) => ['leads', tenantId, studioLocationId, params],
    summary: (tenantId, studioLocationId) => ['leads', 'summary', tenantId, studioLocationId],
    detail: (id) => ['lead', id],
  },
  store: {
    setupStatus: ['store', 'setup-status'],
    settings: ['store', 'settings'],
    dashboard: ['store', 'dashboard'],
    tradeAssuranceDashboardRoot: ['store', 'trade-assurance-dashboard'],
    tradeAssuranceDashboard: (params = {}) => ['store', 'trade-assurance-dashboard', params],
    onlineOrders: {
      all: ['store', 'online-orders'],
      list: (params = {}) => ['store', 'online-orders', params],
      stats: (params = {}) => ['store', 'online-orders', 'stats', params],
      detail: (id) => ['store', 'online-orders', id],
    },
  },
  evat: {
    status: (tenantId) => ['evat', 'status', tenantId],
  },
  settings: {
    organization: (tenantId) => ['settings', 'organization', tenantId],
    notificationChannels: ['settings', 'notification-channels'],
    customerSources: (tenantId) => ['settings', 'customer-sources', tenantId],
    leadSources: (tenantId) => ['settings', 'lead-sources', tenantId],
  },
};
