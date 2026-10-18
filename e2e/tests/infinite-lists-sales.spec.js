import { test, expect } from '@playwright/test';
import { mockWorkspaceApi, mockBody, ALL_FEATURES } from './helpers/mockApi.js';

/**
 * Money lists (sales, returns, invoices, expenses, quotes, journal, payroll): phones and tablets
 * load 20 more as you scroll; desktops keep their page buttons and page size.
 * Run with: npx playwright test -c playwright.mobile.config.js tests/infinite-lists-sales.spec.js
 */

const isDesktop = (testInfo) => testInfo.project.name === 'desktop';
const TOTAL = 45;
const pad = (n) => String(n).padStart(2, '0');
/** No shop to pick, so every list loads straight away. */
const FEATURES = ALL_FEATURES.filter((key) => key !== 'shopsModule');

async function openApp(page, baseURL, path, options = {}) {
  await mockWorkspaceApi(page, { baseURL, ...options });
  await page.goto(path);
  await expect(page.locator('header').first()).toBeVisible();
}

const monthStart = (i) => new Date(Date.UTC(2022, i, 1, 12));
const monthEnd = (i) => new Date(Date.UTC(2022, i + 1, 0, 12));
const isoDay = (date) => date.toISOString().slice(0, 10);

/**
 * One entry per list: the API path, a row, the response body in that endpoint's real shape,
 * the text that identifies a row on screen, and the desktop page size / page count.
 * `serverDefaultLimit` is what the API sends when the request has no `limit`.
 */
const LISTS = [
  {
    name: 'sales',
    path: '/sales',
    api: '/sales',
    rowText: /^SAL-\d\d$/,
    row: (n) => ({
      id: `s${n}`, saleNumber: `SAL-${pad(n)}`, total: 10, amountPaid: 10, status: 'completed',
      paymentMethod: 'cash', createdAt: '2026-09-01T10:00:00Z', items: [],
    }),
    body: (data, page, limit) => ({
      success: true,
      count: TOTAL,
      summary: { totalSales: TOTAL, completedCount: TOTAL, pendingCount: 0, kitchenPendingCount: 0, completedRevenue: 450 },
      pagination: { page, limit, totalPages: Math.ceil(TOTAL / limit) },
      data,
    }),
    desktop: { rows: 10, pager: 'Page 1 of 5' },
  },
  {
    name: 'sale returns',
    path: '/sales/returns',
    api: '/returns',
    rowText: /^RET-\d\d$/,
    row: (n) => ({
      id: `r${n}`, returnNumber: `RET-${pad(n)}`, type: 'refund', refundAmount: 5, collectAmount: 0,
      status: 'completed', createdAt: '2026-09-01T10:00:00Z', originalSale: { saleNumber: `SAL-${pad(n)}` },
    }),
    body: (data, page, limit) => ({
      success: true,
      data,
      pagination: { page, limit, total: TOTAL, pages: Math.ceil(TOTAL / limit) },
    }),
    // Returns page 20 at a time on desktop too.
    desktop: { rows: 20, pager: 'Page 1 of 3' },
  },
  {
    name: 'invoices',
    path: '/invoices',
    api: '/invoices',
    rowText: /^INV-\d\d$/,
    row: (n) => ({
      id: `i${n}`, invoiceNumber: `INV-${pad(n)}`, status: 'sent', totalAmount: 100, amountPaid: 0, balance: 100,
      invoiceDate: '2026-09-01', dueDate: '2026-10-01', createdAt: '2026-09-01T10:00:00Z',
      customer: { id: 'c1', name: 'Kofi Mensah' }, items: [],
    }),
    body: (data, page, limit) => ({
      success: true,
      count: TOTAL,
      pagination: { page, limit, totalPages: Math.ceil(TOTAL / limit) },
      data,
    }),
    desktop: { rows: 10, pager: 'Page 1 of 5' },
  },
  {
    name: 'expenses',
    path: '/expenses',
    api: '/expenses',
    rowText: /^EXP-\d\d$/,
    row: (n) => ({
      id: `e${n}`, expenseNumber: `EXP-${pad(n)}`, category: 'Transport', amount: 5, status: 'paid',
      approvalStatus: 'approved', expenseDate: '2026-09-01', createdAt: '2026-09-01T10:00:00Z',
    }),
    body: (data, page, limit) => ({
      success: true,
      count: TOTAL,
      pagination: { page, limit, totalPages: Math.ceil(TOTAL / limit) },
      data,
    }),
    desktop: { rows: 10, pager: 'Page 1 of 5' },
  },
  {
    name: 'quotes',
    path: '/quotes',
    api: '/quotes',
    rowText: /^QTE-\d\d$/,
    row: (n) => ({
      id: `q${n}`, quoteNumber: `QTE-${pad(n)}`, title: `Quote ${pad(n)}`, status: 'draft', totalAmount: 100,
      validUntil: '2026-10-01', createdAt: '2026-09-01T10:00:00Z', customer: { id: 'c1', name: 'Kofi Mensah' }, items: [],
    }),
    body: (data, page, limit) => ({
      success: true,
      count: TOTAL,
      pagination: { page, limit, totalPages: Math.ceil(TOTAL / limit) },
      data,
    }),
    desktop: { rows: 10, pager: 'Page 1 of 5' },
  },
  {
    name: 'journal entries',
    path: '/accounting',
    tab: 'Journal',
    api: '/accounting/journal',
    rowText: /^JRN-\d\d$/,
    serverDefaultLimit: 20,
    row: (n) => ({
      id: `j${n}`, reference: `JRN-${pad(n)}`, description: `Entry ${pad(n)}`, entryDate: '2026-09-01',
      status: 'posted', source: 'manual', lines: [],
    }),
    body: (data, page, limit) => ({
      success: true,
      count: TOTAL,
      pagination: { page, limit, totalPages: Math.ceil(TOTAL / limit) },
      data,
    }),
    // Desktop asks once without page/limit (the server's first 20) and shows them all, as before.
    desktop: { rows: 20, pager: 'Page 1 of 2', unpagedRequest: true },
  },
  {
    name: 'payroll runs',
    path: '/payroll',
    api: '/payroll/runs',
    // "Jan 01 - Jan 31, 2022"
    rowText: /^[A-Z][a-z]{2} 01 - [A-Z][a-z]{2} \d\d, \d{4}$/,
    serverDefaultLimit: 20,
    row: (n) => ({
      id: `p${n}`, periodStart: isoDay(monthStart(n - 1)), periodEnd: isoDay(monthEnd(n - 1)),
      payDate: isoDay(monthEnd(n - 1)), status: 'draft', totalEmployees: 1, totalGross: 100, totalNet: 90, entries: [],
    }),
    body: (data, page, limit) => ({
      success: true,
      count: TOTAL,
      pagination: { page, limit, totalPages: Math.ceil(TOTAL / limit) },
      data,
    }),
    // Desktop asks once without page/limit (the server's first 20) and pages them 10 at a time, as before.
    desktop: { rows: 10, pager: 'Page 1 of 2', unpagedRequest: true },
  },
];

/** 45 rows for the list's endpoint, paged by the request's page/limit like the API. */
function withManyRows(list) {
  const all = Array.from({ length: TOTAL }, (_, i) => list.row(i + 1));
  return {
    features: FEATURES,
    responses: (path, url) => {
      if (path !== list.api) return undefined;
      const pageNumber = Number(url.searchParams.get('page') || 1);
      const limit = Number(url.searchParams.get('limit') || list.serverDefaultLimit || 10);
      const data = all.slice((pageNumber - 1) * limit, pageNumber * limit);
      return mockBody(list.body(data, pageNumber, limit));
    },
  };
}

/** `page x limit` of every request to the list's endpoint (`nullxnull` when it sends neither). */
function recordListRequests(page, list) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === `/api${list.api}`) requests.push(`${url.searchParams.get('page')}x${url.searchParams.get('limit')}`);
  });
  return requests;
}

async function openList(page, baseURL, list, options = {}) {
  await openApp(page, baseURL, list.path, { ...withManyRows(list), ...options });
  if (list.tab) await page.getByRole('tab', { name: list.tab }).click();
}

const scrollToBottom = (page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

for (const list of LISTS) {
  test.describe(list.name, () => {
    test('phones and tablets: load more as you scroll', async ({ page, baseURL }, testInfo) => {
      test.skip(isDesktop(testInfo), 'phones and tablets only');
      const requests = recordListRequests(page, list);
      await openList(page, baseURL, list);
      const rows = page.getByText(list.rowText);
      await expect(rows.first()).toBeVisible();
      await expect(page.getByText(/Page \d+ of \d+/)).toHaveCount(0);
      await expect(rows).toHaveCount(20);
      await expect.poll(async () => {
        await scrollToBottom(page);
        return rows.count();
      }).toBe(TOTAL);
      await expect(page.getByText(`All ${TOTAL} items`)).toBeVisible();
      expect([...new Set(requests)]).toEqual(['1x20', '2x20', '3x20']);
    });

    test('desktop: keeps the page buttons', async ({ page, baseURL }, testInfo) => {
      test.skip(!isDesktop(testInfo), 'desktop only');
      const requests = recordListRequests(page, list);
      await openList(page, baseURL, list);
      await expect(page.getByText(list.desktop.pager)).toBeVisible();
      await expect(page.getByRole('button', { name: /Next/ })).toBeVisible();
      await expect(page.getByText(list.rowText)).toHaveCount(list.desktop.rows);
      expect([...new Set(requests)]).toEqual([list.desktop.unpagedRequest ? 'nullxnull' : `1x${list.desktop.rows}`]);
    });
  });
}

test.describe('pages that page on desktop', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isDesktop(testInfo), 'desktop only'));

  test('sales: Next asks the server for page 2', async ({ page, baseURL }) => {
    const sales = LISTS.find((list) => list.name === 'sales');
    const requests = recordListRequests(page, sales);
    await openList(page, baseURL, sales);
    await expect(page.getByText('SAL-01', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Next/ }).click();
    await expect(page.getByText('SAL-11', { exact: true })).toBeVisible();
    await expect(page.getByText('SAL-01', { exact: true })).toHaveCount(0);
    expect([...new Set(requests)]).toEqual(['1x10', '2x10']);
  });
});

/** Simple Mode keeps its own plain lists; they scroll for more the same way. */
const SIMPLE_LISTS = [
  { ...LISTS.find((list) => list.name === 'sales'), name: 'Simple Mode sales', rowButton: /^Open receipt for /, noun: 'sales' },
  { ...LISTS.find((list) => list.name === 'expenses'), name: 'Simple Mode expenses', rowButton: /^Edit Transport /, noun: 'expenses' },
];

for (const list of SIMPLE_LISTS) {
  test.describe(list.name, () => {
    const simple = { interfaceMode: 'simple' };

    test('phones and tablets: load more as you scroll', async ({ page, baseURL }, testInfo) => {
      test.skip(isDesktop(testInfo), 'phones and tablets only');
      const requests = recordListRequests(page, list);
      await openList(page, baseURL, list, simple);
      const rows = page.getByRole('button', { name: list.rowButton });
      await expect(rows.first()).toBeVisible();
      await expect(page.getByText(/Page \d+ of \d+/)).toHaveCount(0);
      await expect(rows).toHaveCount(20);
      await expect.poll(async () => {
        await scrollToBottom(page);
        return rows.count();
      }).toBe(TOTAL);
      await expect(page.getByText(`All ${TOTAL} ${list.noun}`)).toBeVisible();
      expect([...new Set(requests)]).toEqual(['1x20', '2x20', '3x20']);
    });

    test('desktop: keeps the page buttons', async ({ page, baseURL }, testInfo) => {
      test.skip(!isDesktop(testInfo), 'desktop only');
      const requests = recordListRequests(page, list);
      await openList(page, baseURL, list, simple);
      await expect(page.getByText('Page 1 of 5')).toBeVisible();
      await expect(page.getByRole('button', { name: list.rowButton })).toHaveCount(10);
      expect([...new Set(requests)]).toEqual(['1x10']);
    });
  });
}
