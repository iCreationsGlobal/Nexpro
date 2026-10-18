import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useDeviceMode } from '@/hooks/useDeviceMode';

/** Rows per request while scrolling on phones and tablets (the native app loads 15–20). */
export const APP_SHELL_LIST_PAGE_SIZE = 20;

const rowKey = (row, index) => row?.id ?? row?.key ?? `row-${index}`;

/** Offset pages shift when records are added while scrolling; keep the first copy of each row. */
function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row, index) => {
    const key = rowKey(row, index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A list that pages on desktop and loads as you scroll on phones and tablets.
 *
 * Desktop asks for one page at a time (`page` / `pageSize` from the page's own state).
 * The app shell asks for APP_SHELL_LIST_PAGE_SIZE rows at a time with useInfiniteQuery, the
 * same as the native app, so every loaded page refreshes together after an edit or a pull to
 * refresh. Its key is the list key with `'infinite'` appended, so invalidating the list prefix
 * covers both.
 *
 * @param {Object} options
 * @param {(params: Object) => Array} options.queryKey - Builds the query key from the request params
 * @param {Object} [options.params] - Filters and search, without page/limit
 * @param {(params: Object) => Promise<any>} options.fetchPage - Fetches one page ({ ...params, page, limit })
 * @param {(response: any) => Array} options.getRows - Rows in one response (called with undefined while loading)
 * @param {(response: any, rows: Array) => number} [options.getTotal] - Total matching rows, from the first response
 * @param {number} [options.page] - Desktop page
 * @param {number} [options.pageSize] - Desktop page size
 * @param {boolean} [options.enabled]
 * @param {number} [options.staleTime]
 * @param {number} [options.shellPageSize]
 * @param {Object} [options.queryOptions] - Extra React Query options for both modes (refetchInterval, refetchOnWindowFocus, …)
 * @returns {{
 *   rows: Array, total: number, response: any, isLoading: boolean, isFetching: boolean,
 *   refetch: Function, error: any, isError: boolean,
 *   infinite: null | { hasMore: boolean, loadMore: () => void, isLoadingMore: boolean },
 * }}
 */
export function usePagedList({
  queryKey,
  params = {},
  fetchPage,
  getRows,
  getTotal,
  page = 1,
  pageSize = 10,
  enabled = true,
  staleTime,
  shellPageSize = APP_SHELL_LIST_PAGE_SIZE,
  queryOptions = {},
}) {
  const { isAppShell } = useDeviceMode();
  // An explicit `staleTime: undefined` would override the app's default, so only pass it when set.
  const shared = staleTime === undefined ? queryOptions : { ...queryOptions, staleTime };

  const desktopParams = { ...params, page, limit: pageSize };
  const desktop = useQuery({
    ...shared,
    queryKey: queryKey(desktopParams),
    queryFn: () => fetchPage(desktopParams),
    enabled: enabled && !isAppShell,
  });

  const shellParams = { ...params, limit: shellPageSize };
  const shell = useInfiniteQuery({
    ...shared,
    queryKey: [...queryKey(shellParams), 'infinite'],
    queryFn: ({ pageParam }) => fetchPage({ ...shellParams, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      const lastCount = getRows(lastPage)?.length ?? 0;
      if (lastCount < shellPageSize) return undefined;
      const loaded = allPages.reduce((count, response) => count + (getRows(response)?.length ?? 0), 0);
      const total = Number(getTotal?.(allPages[0], getRows(allPages[0]) ?? []));
      if (Number.isFinite(total) && total > 0 && loaded >= total) return undefined;
      return lastPageParam + 1;
    },
    enabled: enabled && isAppShell,
  });

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = shell;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const shellPages = shell.data?.pages;
  const shellRows = useMemo(
    () => uniqueRows((shellPages ?? []).flatMap((response) => getRows(response) ?? [])),
    // getRows is a pure reader; the pages are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shellPages],
  );
  const desktopRows = useMemo(
    () => getRows(desktop.data) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [desktop.data],
  );

  const infinite = useMemo(
    () => (isAppShell ? { hasMore: Boolean(hasNextPage), loadMore, isLoadingMore: isFetchingNextPage } : null),
    [isAppShell, hasNextPage, loadMore, isFetchingNextPage],
  );

  const active = isAppShell ? shell : desktop;
  const response = isAppShell ? shellPages?.[0] : desktop.data;
  const rows = isAppShell ? shellRows : desktopRows;
  const firstRows = isAppShell ? (getRows(shellPages?.[0]) ?? []) : rows;
  const reportedTotal = Number(getTotal ? getTotal(response, firstRows) : NaN);
  const total = Number.isFinite(reportedTotal) ? Math.max(reportedTotal, rows.length) : rows.length;

  return {
    rows,
    total,
    response,
    isLoading: active.isLoading,
    isFetching: active.isFetching,
    refetch: active.refetch,
    error: active.error,
    isError: active.isError,
    infinite,
  };
}

export default usePagedList;
