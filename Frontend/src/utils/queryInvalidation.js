/**
 * Shared React Query invalidation helpers for web.
 * Keep prefixes broad enough to catch page-specific keys, but avoid full-cache invalidation.
 */
import { queryKeys } from './queryKeys';

export const QUERY_STALE = {
  TRANSACTIONAL: 30 * 1000,
  LIST: 60 * 1000,
  METADATA: 5 * 60 * 1000,
  SLOW: 10 * 60 * 1000,
};

const SCOPED_WORKSPACE_PREFIXES = [
  queryKeys.customers.all,
  queryKeys.customers.detailRoot,
  queryKeys.sales.all,
  queryKeys.sales.detailRoot,
  queryKeys.products.all,
  queryKeys.products.detailRoot,
  queryKeys.expenses.all,
  queryKeys.expenses.detailRoot,
  queryKeys.dashboard.all,
  queryKeys.orders.all,
  queryKeys.jobs.all,
  queryKeys.jobs.detailRoot,
  queryKeys.quotes.all,
  queryKeys.quotes.detailRoot,
  queryKeys.invoices.all,
  queryKeys.invoices.detailRoot,
  queryKeys.leads.all,
  queryKeys.leads.detailRoot,
  ['deliveries-queue'],
  queryKeys.store.onlineOrders.all,
  queryKeys.store.dashboard,
  queryKeys.store.setupStatus,
  ['store', 'service-listings'],
  queryKeys.store.tradeAssuranceDashboardRoot,
];

const invalidatePrefixes = (queryClient, prefixes, options = {}) => Promise.all(
  prefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey, ...options }))
);

const markPrefixesStale = (queryClient, prefixes) => invalidatePrefixes(
  queryClient,
  prefixes,
  { refetchType: 'none' }
);

const refetchActivePrefixes = (queryClient, prefixes) => Promise.all(
  prefixes.map((queryKey) => queryClient.refetchQueries({ queryKey, type: 'active' }))
);

export async function refreshRelatedQueries(queryClient, prefixes) {
  await invalidatePrefixes(queryClient, prefixes);
  await refetchActivePrefixes(queryClient, prefixes);
}

export async function refreshAfterWorkspaceScopeChange(queryClient) {
  await refreshRelatedQueries(queryClient, SCOPED_WORKSPACE_PREFIXES);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['shops'] }),
    queryClient.invalidateQueries({ queryKey: ['studio-locations'] }),
  ]);
}

export async function refreshAfterSale(queryClient) {
  await refreshRelatedQueries(queryClient, [
    queryKeys.sales.all,
    queryKeys.sales.detailRoot,
    queryKeys.products.all,
    queryKeys.products.detailRoot,
    queryKeys.invoices.all,
    queryKeys.invoices.detailRoot,
    queryKeys.customers.all,
    queryKeys.customers.detailRoot,
    queryKeys.dashboard.all,
    queryKeys.orders.all,
    ['deliveries-queue'],
  ]);
}

export async function markAfterSaleStale(queryClient) {
  await markPrefixesStale(queryClient, [
    queryKeys.sales.all,
    queryKeys.sales.detailRoot,
    queryKeys.products.all,
    queryKeys.products.detailRoot,
    queryKeys.invoices.all,
    queryKeys.invoices.detailRoot,
    queryKeys.customers.all,
    queryKeys.customers.detailRoot,
    queryKeys.dashboard.all,
    queryKeys.orders.all,
    ['deliveries-queue'],
  ]);
}

/**
 * Expense create/update/archive.
 * Refetch list + stats once (skip categories). Mark dashboard stale without a forced refetch.
 */
export async function refreshAfterExpense(queryClient) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.all,
      predicate: (query) => query.queryKey[1] !== 'categories',
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detailRoot }),
  ]);
  await markPrefixesStale(queryClient, [queryKeys.dashboard.all]);
}

export async function refreshAfterInvoiceChange(queryClient) {
  await refreshRelatedQueries(queryClient, [
    queryKeys.invoices.all,
    queryKeys.invoices.detailRoot,
    queryKeys.customers.all,
    queryKeys.customers.detailRoot,
    queryKeys.sales.all,
    queryKeys.sales.detailRoot,
    queryKeys.dashboard.all,
  ]);
}

export async function refreshAfterQuoteChange(queryClient) {
  await refreshRelatedQueries(queryClient, [
    queryKeys.quotes.all,
    queryKeys.quotes.detailRoot,
    queryKeys.customers.all,
    queryKeys.customers.detailRoot,
    queryKeys.jobs.all,
    queryKeys.jobs.detailRoot,
    queryKeys.sales.all,
    queryKeys.sales.detailRoot,
    queryKeys.dashboard.all,
  ]);
}

export async function refreshAfterCustomerChange(queryClient) {
  await refreshRelatedQueries(queryClient, [queryKeys.customers.all, queryKeys.customers.detailRoot, queryKeys.dashboard.all]);
}

export async function refreshAfterInventoryChange(queryClient) {
  await refreshRelatedQueries(queryClient, [
    queryKeys.products.all,
    queryKeys.products.detailRoot,
  ]);
  await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all, refetchType: 'none' });
  await queryClient.invalidateQueries({ queryKey: ['notifications'], refetchType: 'active' });
}

export const refreshAfterProductChange = refreshAfterInventoryChange;

export async function refreshAfterJobChange(queryClient) {
  await refreshRelatedQueries(queryClient, [
    queryKeys.jobs.all,
    queryKeys.jobs.detailRoot,
    queryKeys.dashboard.all,
  ]);
}

export async function refreshAfterLeadChange(queryClient) {
  await refreshRelatedQueries(queryClient, [
    queryKeys.leads.all,
    queryKeys.leads.detailRoot,
    queryKeys.customers.all,
    queryKeys.customers.detailRoot,
  ]);
}

export async function refreshAfterOrderChange(queryClient) {
  await refreshRelatedQueries(queryClient, [
    queryKeys.orders.all,
    queryKeys.sales.all,
    queryKeys.dashboard.all,
  ]);
}

export async function refreshAfterOnlineOrderChange(queryClient) {
  await invalidatePrefixes(queryClient, [
    queryKeys.store.onlineOrders.all,
    queryKeys.store.dashboard,
    queryKeys.store.tradeAssuranceDashboardRoot,
    queryKeys.store.setupStatus,
    ['deliveries-queue'],
    queryKeys.sales.all,
    queryKeys.dashboard.all,
  ]);
}

export async function refreshNotifications(queryClient) {
  await refreshRelatedQueries(queryClient, [['notifications']]);
}
