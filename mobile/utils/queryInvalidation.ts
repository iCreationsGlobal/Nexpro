import type { QueryClient } from '@tanstack/react-query';

/**
 * Recommended stale times for mobile React Query screens.
 * Transactional data should stay fresh; metadata can cache longer.
 */
export const QUERY_STALE = {
  /** Sales, products, expenses, dashboard, orders */
  TRANSACTIONAL: 30 * 1000,
  /** List screens with search */
  LIST: 60 * 1000,
  /** Dropdowns, settings, access lists */
  METADATA: 5 * 60 * 1000,
  /** Rarely changing category catalogs */
  SLOW: 10 * 60 * 1000,
} as const;

type QueryKeyPrefix = readonly string[];

async function invalidatePrefixes(queryClient: QueryClient, prefixes: QueryKeyPrefix[]) {
  await Promise.all(
    prefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );
}

async function markPrefixesStale(queryClient: QueryClient, prefixes: QueryKeyPrefix[]) {
  await Promise.all(
    prefixes.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, refetchType: 'none' })
    )
  );
}

async function refetchActivePrefixes(queryClient: QueryClient, prefixes: QueryKeyPrefix[]) {
  await Promise.all(
    prefixes.map((queryKey) =>
      queryClient.refetchQueries({ queryKey, type: 'active' })
    )
  );
}

/**
 * Mark related queries stale and refetch any that are currently mounted.
 */
export async function refreshRelatedQueries(
  queryClient: QueryClient,
  prefixes: QueryKeyPrefix[]
) {
  await invalidatePrefixes(queryClient, prefixes);
  await refetchActivePrefixes(queryClient, prefixes);
}

/** POS checkout, offline sync, sale payment */
export async function refreshAfterSale(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [
    ['sales'],
    ['sale'],
    ['products'],
    ['product'],
    ['invoices'],
    ['invoice'],
    ['customers'],
    ['customer'],
    ['dealers'],
    ['dealer'],
    ['dashboard'],
    ['orders'],
    ['deliveries-queue'],
  ]);
}

/**
 * POS checkout should feel instant on mobile: mark dependent data stale, but do not
 * refetch mounted dashboard/products/sales screens immediately after POST /sales.
 */
export async function markAfterSaleStale(queryClient: QueryClient) {
  await markPrefixesStale(queryClient, [
    ['sales'],
    ['sale'],
    ['products'],
    ['product'],
    ['invoices'],
    ['invoice'],
    ['customers'],
    ['customer'],
    ['dealers'],
    ['dealer'],
    ['dashboard'],
    ['orders'],
    ['deliveries-queue'],
  ]);
}

/**
 * Expense create/update/archive.
 * Refetch list + stats once (skip categories metadata). Mark dashboard stale without
 * blocking on a dashboard round-trip — callers should not await this before closing UI.
 */
export async function refreshAfterExpense(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ['expenses'],
      predicate: (query) => query.queryKey[1] !== 'categories',
    }),
    queryClient.invalidateQueries({ queryKey: ['expense'] }),
  ]);
  await markPrefixesStale(queryClient, [['dashboard']]);
}

/** Product create/update/delete */
export async function refreshAfterInventoryChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [
    ['products'],
    ['product'],
  ]);
  await markPrefixesStale(queryClient, [['dashboard']]);
}

/** Invoice payment / status */
export async function refreshAfterInvoicePayment(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [
    ['invoices'],
    ['invoice'],
    ['sales'],
    ['sale'],
    ['customers'],
    ['customer'],
    ['dashboard'],
  ]);
}

/** Quote status change */
export async function refreshAfterQuoteChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [['quotes'], ['quote'], ['dashboard']]);
}

/** Quote converted to job */
export async function refreshAfterQuoteToJob(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [
    ['quotes'],
    ['quote'],
    ['jobs'],
    ['job'],
    ['dashboard'],
  ]);
}

/** Job create / status */
export async function refreshAfterJobChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [['jobs'], ['job'], ['dashboard']]);
}

/** Customer create/update / find-or-create at checkout */
export async function refreshAfterCustomerChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [['customers'], ['customer'], ['dashboard']]);
}

/** Dealer create/update / payment / dealer sale */
export async function refreshAfterDealerChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [['dealers'], ['dealer'], ['dashboard']]);
}

/** Lead / task workspace updates */
export async function refreshAfterLeadChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [['leads'], ['lead']]);
}

export async function refreshAfterTaskChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [
    ['user-workspace', 'tasks'],
    ['user-workspace', 'task-detail'],
    ['user-workspace', 'task-comments'],
  ]);
}

/** Restaurant order status */
export async function refreshAfterOrderChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [['orders'], ['sales'], ['dashboard']]);
}

/** Online store order status update */
export async function refreshAfterOnlineOrderChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [
    ['store', 'online-orders'],
    ['store', 'order'],
    ['store', 'dashboard'],
    ['store', 'setup-status'],
    ['deliveries-queue'],
    ['sales'],
    ['dashboard'],
  ]);
}

/** List/query prefixes tied to shop or studio branch scope */
const SCOPED_WORKSPACE_PREFIXES: QueryKeyPrefix[] = [
  ['customers'],
  ['customer'],
  ['sales'],
  ['sale'],
  ['products'],
  ['product'],
  ['expenses'],
  ['expense'],
  ['dashboard'],
  ['orders'],
  ['jobs'],
  ['job'],
  ['quotes'],
  ['quote'],
  ['invoices'],
  ['invoice'],
  ['leads'],
  ['lead'],
  ['dealers'],
  ['dealer'],
  ['deliveries-queue'],
  ['store', 'online-orders'],
  ['store', 'setup-status'],
  ['store', 'service-listings'],
];

/**
 * Mark branch-scoped list data stale (shop/studio switch).
 */
export async function invalidateScopedWorkspaceData(queryClient: QueryClient) {
  await invalidatePrefixes(queryClient, SCOPED_WORKSPACE_PREFIXES);
}

/**
 * After shop or studio branch change: invalidate scoped lists and refetch mounted screens.
 * Matches web ShopContext / StudioLocationContext behavior.
 */
export async function refreshAfterWorkspaceScopeChange(queryClient: QueryClient) {
  await invalidateScopedWorkspaceData(queryClient);
  await refetchActivePrefixes(queryClient, SCOPED_WORKSPACE_PREFIXES);
  await queryClient.invalidateQueries({ queryKey: ['shops'] });
  await queryClient.invalidateQueries({ queryKey: ['studio-locations'] });
}

/**
 * Drop cached Online Store operational data (orders/stats/listings) when
 * checklist.hasSettings is false so wiped settings cannot keep showing orphan rows.
 */
export async function clearOnlineStoreOperationalQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.removeQueries({ queryKey: ['store', 'dashboard', 'order-stats'] }),
    queryClient.removeQueries({ queryKey: ['store', 'dashboard', 'recent-online-orders'] }),
    queryClient.removeQueries({ queryKey: ['store', 'online-orders'] }),
    queryClient.removeQueries({ queryKey: ['store', 'order'] }),
    queryClient.removeQueries({ queryKey: ['store', 'service-listings'] }),
  ]);
}
