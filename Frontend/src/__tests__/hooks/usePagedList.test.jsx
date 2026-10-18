import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const deviceMode = { isAppShell: true };
vi.mock('@/hooks/useDeviceMode', () => ({
  useDeviceMode: () => deviceMode,
  matchesAppShell: () => deviceMode.isAppShell,
}));

import { APP_SHELL_LIST_PAGE_SIZE, usePagedList } from '@/hooks/usePagedList';
import InfiniteListFooter from '@/components/InfiniteListFooter';

const ALL = Array.from({ length: 45 }, (_, i) => ({ id: `c${i + 1}`, name: `Customer ${i + 1}` }));

/** Server stand-in: offset pages over ALL, `{ data, count }` like the customers endpoint. */
const fetchPage = vi.fn(async ({ page, limit, search }) => {
  const matching = search ? ALL.filter((row) => row.name.includes(search)) : ALL;
  return { data: matching.slice((page - 1) * limit, page * limit), count: matching.length };
});

let client;
function wrapper({ children }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const useCustomers = (overrides = {}) => usePagedList({
  queryKey: (params) => ['customers', 'list', params],
  fetchPage,
  getRows: (response) => response?.data ?? [],
  getTotal: (response) => response?.count,
  page: 1,
  pageSize: 10,
  ...overrides,
});

describe('usePagedList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deviceMode.isAppShell = true;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('phones/tablets: loads 20 at a time and stops at the end of the list', async () => {
    const { result } = renderHook(() => useCustomers(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(APP_SHELL_LIST_PAGE_SIZE));
    expect(fetchPage).toHaveBeenLastCalledWith({ page: 1, limit: APP_SHELL_LIST_PAGE_SIZE });
    expect(result.current.total).toBe(45);
    expect(result.current.infinite.hasMore).toBe(true);

    act(() => result.current.infinite.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(40));
    act(() => result.current.infinite.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(45));
    expect(result.current.infinite.hasMore).toBe(false);
    expect(result.current.rows.map((row) => row.id)).toEqual(ALL.map((row) => row.id));
  });

  it('phones/tablets: a refetch refreshes every loaded page, so edits show everywhere', async () => {
    const { result } = renderHook(() => useCustomers(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(20));
    act(() => result.current.infinite.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(40));

    ALL[0].name = 'Renamed on page 1';
    await act(() => client.invalidateQueries({ queryKey: ['customers'] }));
    await waitFor(() => expect(result.current.rows[0].name).toBe('Renamed on page 1'));
    expect(result.current.rows).toHaveLength(40);
    ALL[0].name = 'Customer 1';
  });

  it('phones/tablets: drops a row that shifted onto the next page', async () => {
    const shifting = vi.fn(async ({ page }) => ({
      data: page === 1 ? ALL.slice(0, 20) : ALL.slice(19, 39),
      count: 45,
    }));
    const { result } = renderHook(() => useCustomers({ fetchPage: shifting }), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(20));
    act(() => result.current.infinite.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(39));
    expect(new Set(result.current.rows.map((row) => row.id)).size).toBe(39);
  });

  it('desktop: one page at a time, no infinite scroll', async () => {
    deviceMode.isAppShell = false;
    const { result, rerender } = renderHook(({ page }) => useCustomers({ page }), {
      wrapper,
      initialProps: { page: 1 },
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(10));
    expect(result.current.infinite).toBeNull();
    expect(result.current.total).toBe(45);

    rerender({ page: 5 });
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual(['c41', 'c42', 'c43', 'c44', 'c45']));
    expect(fetchPage).toHaveBeenLastCalledWith({ page: 5, limit: 10 });
  });

  it("keeps the app's default staleTime when the page doesn't set one", async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 120000 } } });
    const { result } = renderHook(() => useCustomers(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(20));
    const query = client.getQueryCache().findAll({ queryKey: ['customers'] })[0];
    expect(query.isStale()).toBe(false);
  });

  it('starts over when the search changes', async () => {
    const { result, rerender } = renderHook(({ params }) => useCustomers({ params }), {
      wrapper,
      initialProps: { params: {} },
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(20));
    rerender({ params: { search: 'Customer 4' } });
    await waitFor(() => expect(result.current.total).toBe(7));
    expect(result.current.rows.map((row) => row.id)).toEqual(['c4', 'c40', 'c41', 'c42', 'c43', 'c44', 'c45']);
    expect(result.current.infinite.hasMore).toBe(false);
  });
});

describe('InfiniteListFooter', () => {
  it('shows progress, a manual button, and the end of the list', () => {
    const loadMore = vi.fn();
    const { rerender } = render(<InfiniteListFooter hasMore loadMore={loadMore} isLoadingMore={false} count={20} />);
    screen.getByRole('button', { name: 'Show more' }).click();
    expect(loadMore).toHaveBeenCalled();

    rerender(<InfiniteListFooter hasMore loadMore={loadMore} isLoadingMore count={20} />);
    expect(screen.getByRole('status').textContent).toContain('Loading more');

    rerender(<InfiniteListFooter hasMore={false} loadMore={loadMore} isLoadingMore={false} count={45} noun="customers" />);
    expect(screen.getByText('All 45 customers')).toBeTruthy();
  });
});
