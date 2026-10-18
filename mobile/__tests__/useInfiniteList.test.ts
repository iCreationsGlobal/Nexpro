import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInfiniteList } from '@/hooks/useInfiniteList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const consoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    consoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

type Row = { id: string };
type Options = Parameters<typeof useInfiniteList<Row>>[0];
type Result = ReturnType<typeof useInfiniteList<Row>>;

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `r${from + i}`);
const page = (rowIds: string[], count: number) => ({ success: true, data: rowIds.map((id) => ({ id })), count });

function renderList(options: Options) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const latest: { current: Result | null } = { current: null };
  function Probe(props: Options) {
    latest.current = useInfiniteList<Row>(props);
    return null;
  }
  const tree = (props: Options) => React.createElement(QueryClientProvider, { client }, React.createElement(Probe, props));
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(tree(options));
  });
  return {
    list: () => latest.current as Result,
    rerender: (next: Options) => act(() => { renderer.update(tree(next)); }),
    unmount: () => act(() => { renderer.unmount(); client.clear(); }),
  };
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 50 && !check(); attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  expect(check()).toBe(true);
}

describe('useInfiniteList', () => {
  it('loads 20 at a time as the list scrolls and stops at the total', async () => {
    const fetchPage = jest.fn(async (pageNumber: number) =>
      pageNumber === 1 ? page(ids(1, 20), 25) : page(ids(21, 25), 25));
    const { list, unmount } = renderList({ queryKey: ['customers', 't1'], fetchPage });

    await waitFor(() => list().rows.length === 20);
    expect(fetchPage).toHaveBeenCalledWith(1, 20, expect.anything());
    expect(list().total).toBe(25);
    expect(list().hasNextPage).toBe(true);

    act(() => list().loadMore());
    await waitFor(() => list().rows.length === 25);
    expect(fetchPage).toHaveBeenLastCalledWith(2, 20, expect.anything());
    expect(list().hasNextPage).toBe(false);
    unmount();
  });

  it('shows a row once when a record added meanwhile shifts the next page', async () => {
    const fetchPage = jest.fn(async (pageNumber: number) =>
      pageNumber === 1 ? page(ids(1, 20), 30) : page(ids(20, 30), 31));
    const { list, unmount } = renderList({ queryKey: ['invoices', 't1'], fetchPage });

    await waitFor(() => list().rows.length === 20);
    act(() => list().loadMore());
    await waitFor(() => list().rows.length === 30);
    expect(list().rows.filter((row) => row.id === 'r20')).toHaveLength(1);
    unmount();
  });

  it('a failed "load more" keeps the list and is reported to the footer only', async () => {
    const fetchPage = jest.fn(async (pageNumber: number) => {
      if (pageNumber === 2) throw new Error('offline');
      return page(ids(1, 20), 40);
    });
    const { list, unmount } = renderList({ queryKey: ['jobs', 't1'], fetchPage });

    await waitFor(() => list().rows.length === 20);
    act(() => list().loadMore());
    await waitFor(() => list().isFetchNextPageError);
    expect(list().isError).toBe(false);
    expect(list().rows).toHaveLength(20);

    // Scrolling again does not hammer the server; the footer's retry does.
    const calls = fetchPage.mock.calls.length;
    act(() => list().loadMore());
    expect(fetchPage.mock.calls.length).toBe(calls);
    unmount();
  });

  it('reports a failed first load as a list error', async () => {
    const fetchPage = jest.fn(async () => { throw new Error('server down'); });
    const { list, unmount } = renderList({ queryKey: ['leads', 't1'], fetchPage });

    await waitFor(() => list().isError);
    expect(list().rows).toEqual([]);
    unmount();
  });

  it('keeps the old rows on screen while a new search loads, only when allowed', async () => {
    let resolveSearch: (value: unknown) => void = () => {};
    const fetchPage = jest.fn((_page: number, _limit: number) => Promise.resolve(page(ids(1, 3), 3)));
    const options = (search: string, keep: boolean): Options => ({
      queryKey: ['customers', 't1', search],
      fetchPage: search ? () => new Promise((resolve) => { resolveSearch = resolve; }) : fetchPage,
      ...(keep && { keepPreviousWhen: (key) => key[1] === 't1' }),
    });
    const { list, rerender, unmount } = renderList(options('', true));
    await waitFor(() => list().rows.length === 3);

    rerender(options('ama', true));
    expect(list().isPlaceholderData).toBe(true);
    expect(list().rows).toHaveLength(3);
    await act(async () => { resolveSearch(page(['r2'], 1)); });
    await waitFor(() => list().rows.length === 1);
    expect(list().isPlaceholderData).toBe(false);

    rerender(options('kofi', false));
    expect(list().rows).toEqual([]);
    unmount();
  });
});
