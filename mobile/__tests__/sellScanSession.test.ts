import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockAddItem = jest.fn((_input: { id: string; selectedVariant?: { id?: string } | null }) => true);
jest.mock('@/context/CartContext', () => ({
  useCart: () => ({ items: [], addItem: mockAddItem }),
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('@/services/productService', () => ({ productService: { getProductByBarcodeCandidates: jest.fn() } }));

import { useSellScanSession, type SellScanSession } from '@/hooks/useSellScanSession';
import type { SellScanProduct } from '@/utils/sellScan';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const consoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    consoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => mockAddItem.mockClear());

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const products: Record<string, SellScanProduct> = {
  slow: { id: 'p-slow', name: 'Slow', sellingPrice: 10, trackStock: false },
  fast: { id: 'p-fast', name: 'Fast', sellingPrice: 20, trackStock: false },
  gown: {
    id: 'p-gown',
    name: 'Gown',
    sellingPrice: 100,
    trackStock: false,
    hasVariants: true,
    variants: [{ id: 'v-m', name: 'M', sellingPrice: 120 }],
  },
};

function renderSession() {
  // Server lookups: "slow" takes longest, so a naive version would add it last.
  const lookup = jest.fn(async (candidates: string[]) => {
    const code = candidates[0];
    await wait(code === 'slow' ? 40 : code === 'gown' ? 5 : 1);
    if (!products[code]) throw { response: { status: 404 } };
    return { success: true, data: products[code] };
  });
  const latest: { current: SellScanSession | null } = { current: null };
  function Probe() {
    latest.current = useSellScanSession({ loadedProducts: [], lookup });
    return null;
  }
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(React.createElement(Probe)); });
  return {
    session: () => latest.current as SellScanSession,
    lookup,
    unmount: () => act(() => { renderer.unmount(); }),
  };
}

async function settle(ms = 80) {
  await act(async () => { await wait(ms); });
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100 && !check(); attempt += 1) {
    await act(async () => { await wait(5); });
  }
  expect(check()).toBe(true);
}

describe('keep-scanning selling session', () => {
  it('adds fast scans to the cart in the order they were scanned', async () => {
    const { session, unmount } = renderSession();
    act(() => { session().open(); });
    act(() => {
      session().onScan('slow');
      session().onScan('fast');
      session().onScan('slow');
    });
    await waitFor(() => mockAddItem.mock.calls.length === 3);
    expect(mockAddItem.mock.calls.map(([input]) => input.id)).toEqual(['p-slow', 'p-fast', 'p-slow']);
    expect(session().lastAdded).toBe('Added: Slow · ₵ 10.00');
    expect(session().visible).toBe(true);
    unmount();
  });

  it('shows a problem on the camera screen and keeps scanning', async () => {
    const { session, unmount } = renderSession();
    act(() => { session().open(); });
    act(() => {
      session().onScan('nobody');
      session().onScan('fast');
    });
    await waitFor(() => mockAddItem.mock.calls.length === 1);
    expect(session().notice).toBe('No product for this barcode');
    expect(mockAddItem.mock.calls.map(([input]) => input.id)).toEqual(['p-fast']);
    expect(session().visible).toBe(true);
    unmount();
  });

  it('waits for the size picker, then carries on with the next scan', async () => {
    const { session, unmount } = renderSession();
    act(() => { session().open(); });
    act(() => {
      session().onScan('gown');
      session().onScan('fast');
    });
    await settle();
    expect(session().pickerProduct?.id).toBe('p-gown');
    expect(session().paused).toBe(true);
    expect(mockAddItem).not.toHaveBeenCalled();

    act(() => { session().chooseVariant({ id: 'v-m', name: 'M', sellingPrice: 120 }); });
    await settle();
    expect(mockAddItem.mock.calls.map(([input]) => [input.id, input.selectedVariant?.id ?? null])).toEqual([
      ['p-gown', 'v-m'],
      ['p-fast', null],
    ]);
    expect(session().pickerProduct).toBeNull();
    expect(session().paused).toBe(false);
    unmount();
  });

  it('Continue waits for scans still being looked up, then closes and goes on', async () => {
    const { session, unmount } = renderSession();
    const next = jest.fn();
    act(() => { session().open(); });
    act(() => { session().onScan('slow'); });
    await act(async () => { await session().finish(next); });
    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith({ cartHasItems: true });
    expect(session().visible).toBe(false);
    unmount();
  });

  it('X closes at once and keeps the cart', async () => {
    const { session, unmount } = renderSession();
    act(() => { session().open(); });
    act(() => { session().onScan('fast'); });
    await settle();
    act(() => { session().close(); });
    expect(session().visible).toBe(false);
    expect(mockAddItem).toHaveBeenCalledTimes(1);
    unmount();
  });
});
