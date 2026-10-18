import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { nextProductPage } from '@/utils/productPagination';
import { parseApiListResponse } from '@/utils/parseApiListResponse';

/** Rows per request while scrolling (same as Products). */
export const LIST_PAGE_SIZE = 20;

type ListResponse = {
  count?: number;
  pagination?: { total?: number };
};

type Options<T> = {
  /** List key without paging. `'infinite'` is appended so a cached single-page list never clashes. */
  queryKey: QueryKey;
  fetchPage: (page: number, limit: number, signal: AbortSignal) => Promise<unknown>;
  getRows?: (response: unknown) => T[];
  pageSize?: number;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  refetchInterval?: number | false;
  retry?: boolean | number;
  retryDelay?: (attempt: number) => number;
  /** Keep the last list on screen while a new key (e.g. a new search) loads, if this approves the old key. */
  keepPreviousWhen?: (previousKey: QueryKey) => boolean;
};

const rowKey = (row: unknown, index: number) => {
  const record = row as { id?: string | number; key?: string | number } | null;
  return String(record?.id ?? record?.key ?? `row-${index}`);
};

/**
 * A list that loads LIST_PAGE_SIZE rows at a time as it scrolls (FlatList `onEndReached` →
 * `loadMore`). Every loaded page refreshes together on pull-to-refresh or after an edit.
 */
export function useInfiniteList<T>({
  queryKey,
  fetchPage,
  getRows = parseApiListResponse as (response: unknown) => T[],
  pageSize = LIST_PAGE_SIZE,
  enabled = true,
  staleTime,
  gcTime,
  refetchInterval,
  retry,
  retryDelay,
  keepPreviousWhen,
}: Options<T>) {
  const query = useInfiniteQuery<unknown, Error, InfiniteData<unknown, number>, QueryKey, number>({
    queryKey: [...queryKey, 'infinite'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, pageSize, signal),
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      nextProductPage(lastPage, lastPageParam, getRows(lastPage).length, pageSize),
    enabled,
    ...(staleTime !== undefined && { staleTime }),
    ...(gcTime !== undefined && { gcTime }),
    ...(refetchInterval !== undefined && { refetchInterval }),
    ...(retry !== undefined && { retry }),
    ...(retryDelay && { retryDelay }),
    ...(keepPreviousWhen && {
      placeholderData: (previous, previousQuery) =>
        previousQuery && keepPreviousWhen(previousQuery.queryKey) ? previous : undefined,
    }),
  });

  const pages = query.data?.pages;
  const rows = useMemo(() => {
    const seen = new Set<string>();
    // Offset pages shift when records are added while scrolling; keep the first copy of each.
    return (pages ?? []).flatMap((page) => getRows(page)).filter((row, index) => {
      const key = rowKey(row, index);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // getRows is a pure reader; the pages are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  const firstPage = pages?.[0];
  const reported = Number((firstPage as ListResponse | undefined)?.pagination?.total ?? (firstPage as ListResponse | undefined)?.count);
  const total = Number.isFinite(reported) ? Math.max(reported, rows.length) : rows.length;

  const { hasNextPage, isFetchingNextPage, isRefetching, isFetchNextPageError, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isRefetching && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isRefetching, isFetchNextPageError, fetchNextPage]);

  return {
    ...query,
    /** The list itself failed to load or refresh; a failed "load more" is `isFetchNextPageError` (footer). */
    isError: query.isError && !isFetchNextPageError,
    rows,
    firstPage,
    total,
    loadMore,
    /** Pull-to-refresh spinner: not while the next page loads. */
    isPullRefreshing: isRefetching && !isFetchingNextPage,
  };
}
