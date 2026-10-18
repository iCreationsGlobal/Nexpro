import { test, expect } from '@playwright/test';
import { mockWorkspaceApi, mockBody, ALL_FEATURES } from './helpers/mockApi.js';

/**
 * Catalog and supplier lists (products, materials, equipment, vendors, pricing, dealers, online
 * orders): phones and tablets load 20 more rows as you scroll; desktop keeps its page buttons.
 * Run with: npx playwright test -c playwright.mobile.config.js tests/infinite-lists-catalog.spec.js
 */

const isDesktop = (testInfo) => testInfo.project.name === 'desktop';
const TOTAL = 45;
const nn = (i) => String(i + 1).padStart(2, '0');

/** No shop or studio to pick, so every list loads straight away. */
const FEATURES = ALL_FEATURES.filter((key) => !['shopsModule', 'studioLocationsModule'].includes(key));

/**
 * One case per list: its page, API path, a row in the endpoint's real shape (`row`), the text that
 * identifies a row on screen (`title`, matched by `label`). Every endpoint answers
 * `{ success, count, pagination: { page, limit, totalPages }, data }`.
 * `desktopPages`: pages the desktop pager shows for 45 rows (null where it doesn't count them).
 */
const LISTS = [
  {
    name: 'products',
    path: '/products',
    endpoint: '/products',
    title: (i) => `Product ${nn(i)}`,
    row: (i, title) => ({
      id: `p${i + 1}`, name: title(i), sku: `SKU-${nn(i)}`, sellingPrice: 10, costPrice: 5,
      quantityOnHand: 50, reorderLevel: 5, unit: 'pcs', isActive: true, trackStock: true,
      category: { id: 'cat1', name: 'General' },
    }),
    label: /^Product \d\d$/,
    desktopPages: 5,
  },
  {
    name: 'materials',
    path: '/materials',
    endpoint: '/materials/items',
    title: (i) => `Material ${nn(i)}`,
    row: (i, title) => ({
      id: `m${i + 1}`, name: title(i), sku: `MAT-${nn(i)}`, unit: 'pcs', quantityOnHand: 20,
      reorderLevel: 2, unitCost: 3, isActive: true, category: { id: 'mc1', name: 'Paper' },
    }),
    label: /^Material \d\d$/,
    desktopPages: 5,
  },
  {
    name: 'equipment',
    path: '/equipment',
    endpoint: '/equipment/items',
    title: (i) => `Equipment ${nn(i)}`,
    row: (i, title) => ({
      id: `e${i + 1}`, name: title(i), status: 'active', purchaseValue: 100,
      purchaseDate: '2026-01-01', location: 'Office', isActive: true,
    }),
    label: /^Equipment \d\d$/,
    desktopPages: 5,
  },
  {
    name: 'vendors',
    path: '/vendors',
    endpoint: '/vendors',
    title: (i) => `Vendor ${nn(i)}`,
    row: (i, title) => ({
      id: `v${i + 1}`, name: title(i), company: 'Acme Supplies', email: `vendor${i + 1}@example.com`,
      phone: `02440011${nn(i)}`, category: 'Supplies', isActive: true,
    }),
    label: /^Vendor \d\d$/,
    desktopPages: 5,
  },
  {
    name: 'pricing templates',
    path: '/pricing',
    endpoint: '/pricing',
    title: (i) => `Template ${nn(i)}`,
    row: (i, title) => ({
      id: `t${i + 1}`, name: title(i), category: 'Printing', pricingMethod: 'unit',
      pricePerUnit: 5, isActive: true, createdAt: '2026-09-01T10:00:00Z',
    }),
    label: /^Template \d\d$/,
    // Desktop counts only the rows on screen, so its pager never offers a second page.
    desktopPages: null,
  },
  {
    name: 'dealers',
    path: '/dealers',
    endpoint: '/dealers',
    title: (i) => `Dealer ${nn(i)}`,
    row: (i, title) => ({
      id: `d${i + 1}`, businessName: title(i), contactName: 'Ama Owusu', phone: `02440022${nn(i)}`,
      isActive: true, balance: 0, creditLimit: 1000, availableCredit: 1000,
    }),
    label: /^Dealer \d\d$/,
    desktopPages: 5,
  },
  {
    name: 'online orders',
    path: '/online-store/orders',
    endpoint: '/store/orders',
    title: (i) => `ORD-${nn(i)}`,
    row: (i, title) => ({
      id: `o${i + 1}`, orderNumber: title(i), customerName: 'Ama Owusu', total: 20,
      fulfillmentStatus: 'pending', paymentStatus: 'paid', createdAt: '2026-09-01T10:00:00Z', items: [],
    }),
    label: /^ORD-\d\d$/,
    noun: 'orders',
    // Desktop reads page counts from a field this endpoint doesn't send, so it shows one page.
    desktopPages: null,
  },
];

/** 45 rows for the list's endpoint, paged by the request's page/limit like the API. */
const withManyRows = (list) => {
  const rows = Array.from({ length: TOTAL }, (_, i) => list.row(i, list.title));
  return {
    features: FEATURES,
    responses: (path, url) => {
      if (path !== list.endpoint) return undefined;
      const pageNumber = Number(url.searchParams.get('page') || 1);
      const limit = Number(url.searchParams.get('limit') || 10);
      const data = rows.slice((pageNumber - 1) * limit, pageNumber * limit);
      return mockBody({
        success: true,
        count: rows.length,
        pagination: { page: pageNumber, limit, totalPages: Math.ceil(rows.length / limit) },
        data,
      });
    },
  };
};

/** `page x limit` of every request to the list's endpoint. */
const recordListRequests = (page, endpoint) => {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === `/api${endpoint}`) requests.push(`${url.searchParams.get('page')}x${url.searchParams.get('limit')}`);
  });
  return requests;
};

async function openApp(page, baseURL, path = '/dashboard', options = {}) {
  await mockWorkspaceApi(page, { baseURL, ...options });
  await page.goto(path);
  await expect(page.locator('header').first()).toBeVisible();
}

test.describe('app shell', () => {
  test.beforeEach(({}, testInfo) => test.skip(isDesktop(testInfo), 'phones and tablets only'));

  for (const list of LISTS) {
    test(`${list.name} load more as you scroll`, async ({ page, baseURL }) => {
      const requests = recordListRequests(page, list.endpoint);
      await openApp(page, baseURL, list.path, withManyRows(list));
      const rows = page.getByText(list.label).filter({ visible: true });
      await expect(rows.first()).toBeVisible();
      await expect(page.getByText(/Page \d+ of \d+/)).toHaveCount(0);
      await expect(rows).toHaveCount(20);
      await expect.poll(async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        return rows.count();
      }).toBe(TOTAL);
      await expect(page.getByText(`All ${TOTAL} ${list.noun || 'items'}`)).toBeVisible();
      expect([...new Set(requests)]).toEqual(['1x20', '2x20', '3x20']);
    });
  }

  test('Simple Mode products load more as you scroll', async ({ page, baseURL }) => {
    const products = LISTS[0];
    const requests = recordListRequests(page, products.endpoint);
    await openApp(page, baseURL, products.path, { ...withManyRows(products), interfaceMode: 'simple' });
    await expect(page.getByRole('button', { name: 'Add product' })).toBeVisible();
    const rows = page.getByText(products.label).filter({ visible: true });
    await expect(rows).toHaveCount(20);
    await expect(page.getByText(/Page \d+ of \d+/)).toHaveCount(0);
    await expect.poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      return rows.count();
    }).toBe(TOTAL);
    await expect(page.getByText(`All ${TOTAL} products`)).toBeVisible();
    expect([...new Set(requests)]).toEqual(['1x20', '2x20', '3x20']);
  });
});

test.describe('desktop', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isDesktop(testInfo), 'desktop only'));

  for (const list of LISTS) {
    test(`${list.name} keep their page buttons`, async ({ page, baseURL }) => {
      const requests = recordListRequests(page, list.endpoint);
      await openApp(page, baseURL, list.path, withManyRows(list));
      const rows = page.getByText(list.label).filter({ visible: true });
      await expect(rows).toHaveCount(10);
      await expect(page.getByText(/^Page 1 of \d+/)).toBeVisible();
      await expect(page.getByRole('button', { name: /Previous/ })).toBeVisible();
      const next = page.getByRole('button', { name: /Next/ });
      await expect(next).toBeVisible();
      expect([...new Set(requests)]).toEqual(['1x10']);
      if (!list.desktopPages) return;

      await expect(page.getByText(`Page 1 of ${list.desktopPages}`)).toBeVisible();
      await next.click();
      await expect(page.getByText(`Page 2 of ${list.desktopPages}`)).toBeVisible();
      await expect(rows.first()).toHaveText(list.label);
      await expect(rows).toHaveCount(10);
      await expect(page.getByText(list.title(10), { exact: true }).filter({ visible: true })).toBeVisible();
      await expect(page.getByText(list.title(0), { exact: true }).filter({ visible: true })).toHaveCount(0);
      expect([...new Set(requests)]).toEqual(['1x10', '2x10']);
    });
  }
});
