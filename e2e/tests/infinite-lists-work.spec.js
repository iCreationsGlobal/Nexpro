import { test, expect } from '@playwright/test';
import { mockWorkspaceApi, mockBody, ALL_FEATURES } from './helpers/mockApi.js';

/**
 * Work lists (jobs, leads, team, shops, studios, campaigns) load more rows as you scroll on phones
 * and tablets instead of paging; desktops keep their page buttons.
 * Run with: npx playwright test -c playwright.mobile.config.js tests/infinite-lists-work.spec.js
 */

const isDesktop = (testInfo) => testInfo.project.name === 'desktop';
const isPhone = (testInfo) => ['phone', 'iphone'].includes(testInfo.project.name);

const TOTAL = 45;
const pad = (n) => String(n).padStart(2, '0');
const many = (makeRow) => Array.from({ length: TOTAL }, (_, i) => makeRow(pad(i + 1), i + 1));
const CREATED_AT = '2026-09-01T10:00:00Z';
/** No shop to pick (shop scoping only applies with the Shops module). */
const NO_SHOP_SCOPING = ALL_FEATURES.filter((key) => key !== 'shopsModule');
/** Studio workspaces (printing press) may see every studio. */
const STUDIO_ACCESS = { canAccessAll: true, locations: [] };

/** One page of `rows` for the request's page/limit, like the API. */
function slice(url, rows) {
  const page = Number(url.searchParams.get('page') || 1);
  const limit = Number(url.searchParams.get('limit') || 10);
  return { page, limit, data: rows.slice((page - 1) * limit, page * limit), totalPages: Math.ceil(rows.length / limit) };
}

/** `{ success, count, pagination, data }` — jobs, leads, employees, users, shops, studio locations. */
const countBody = (url, rows) => {
  const { page, limit, data, totalPages } = slice(url, rows);
  return mockBody({ success: true, count: rows.length, pagination: { page, limit, totalPages }, data });
};

const LISTS = [
  {
    name: 'jobs',
    path: '/jobs',
    api: '/jobs',
    options: { businessType: 'printing_press', features: NO_SHOP_SCOPING },
    other: { '/studio-locations/access': STUDIO_ACCESS },
    label: /^JOB-\d\d$/,
    text: (n) => `JOB-${n}`,
    rows: many((n) => ({ id: `j${n}`, jobNumber: `JOB-${n}`, title: `Banner ${n}`, status: 'new', priority: 'medium', createdAt: CREATED_AT })),
    body: countBody,
  },
  {
    name: 'leads',
    path: '/leads',
    api: '/leads',
    options: { features: NO_SHOP_SCOPING },
    label: /^Lead \d\d$/,
    text: (n) => `Lead ${n}`,
    rows: many((n) => ({ id: `l${n}`, name: `Lead ${n}`, status: 'new', priority: 'medium', isActive: true, createdAt: CREATED_AT })),
    body: countBody,
  },
  {
    name: 'employees',
    path: '/employees',
    api: '/employees',
    options: { features: NO_SHOP_SCOPING },
    label: /^Employee \d\d$/,
    text: (n) => `Employee ${n}`,
    rows: many((n) => ({ id: `e${n}`, firstName: 'Employee', lastName: n, status: 'active', employmentType: 'full_time', createdAt: CREATED_AT })),
    body: countBody,
    // Desktop only ever shows the first page here (it re-slices the server page by the page number).
    desktopPager: { pageText: /Page 1 of \d+/, next: false },
  },
  {
    name: 'team members',
    path: '/users',
    api: '/users',
    options: { features: NO_SHOP_SCOPING },
    label: /^Member \d\d$/,
    text: (n) => `Member ${n}`,
    rows: many((n) => ({ id: `m${n}`, name: `Member ${n}`, email: `member${n}@example.com`, role: 'staff', isActive: true, createdAt: CREATED_AT })),
    body: countBody,
  },
  {
    name: 'shops',
    path: '/shops',
    api: '/shops',
    options: { businessType: 'shop' },
    other: { '/shops/access': { shops: [{ id: 's1', name: 'Main branch', isDefault: true }], canAccessAll: true } },
    label: /^Shop \d\d$/,
    text: (n) => `Shop ${n}`,
    rows: many((n) => ({ id: `s${n}`, name: `Shop ${n}`, isActive: true, createdAt: CREATED_AT })),
    body: countBody,
  },
  {
    name: 'studios',
    path: '/studio-locations',
    api: '/studio-locations',
    options: { businessType: 'printing_press', features: NO_SHOP_SCOPING },
    other: { '/studio-locations/access': STUDIO_ACCESS },
    label: /^Studio \d\d$/,
    text: (n) => `Studio ${n}`,
    rows: many((n) => ({ id: `sl${n}`, name: `Studio ${n}`, isActive: true, createdAt: CREATED_AT })),
    body: countBody,
  },
  {
    name: 'campaigns',
    path: '/marketing',
    api: '/marketing/campaigns',
    options: { features: NO_SHOP_SCOPING },
    label: /^Campaign \d\d$/,
    text: (n) => `Campaign ${n}`,
    rows: many((n) => ({ id: `mc${n}`, name: `Campaign ${n}`, status: 'draft', audienceType: 'customer', channels: ['sms'], updatedAt: CREATED_AT })),
    // `{ data: { campaigns, total, totalPages, currentPage, limit } }`
    body: (url, rows) => {
      const { page, limit, data, totalPages } = slice(url, rows);
      return mockBody({ success: true, data: { campaigns: data, total: rows.length, totalPages, currentPage: page, limit, offset: (page - 1) * limit } });
    },
  },
  {
    name: 'campaign recipients',
    path: '/marketing/campaigns/c1',
    api: '/marketing/campaigns/c1/recipients',
    options: { features: NO_SHOP_SCOPING },
    other: {
      '/marketing/campaigns/c1': {
        id: 'c1', name: 'Big sale', status: 'sent', audienceType: 'customer', channels: ['sms'],
        stats: { totalQueued: TOTAL, totalSent: TOTAL }, createdAt: CREATED_AT,
      },
    },
    label: /^Recipient \d\d$/,
    text: (n) => `Recipient ${n}`,
    rows: many((n) => ({ id: `r${n}`, recipientName: `Recipient ${n}`, address: `02440000${n}`, channel: 'sms', status: 'sent', sentAt: CREATED_AT })),
    // `{ data: { recipients, total, totalPages, currentPage, limit } }`
    body: (url, rows) => {
      const { page, limit, data, totalPages } = slice(url, rows);
      return mockBody({ success: true, data: { recipients: data, total: rows.length, totalPages, currentPage: page, limit } });
    },
    desktopPageSize: 25,
  },
];

/** Every request to the list endpoint as `${page}x${limit}`. */
function trackListRequests(page, list) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === `/api${list.api}`) requests.push(`${url.searchParams.get('page')}x${url.searchParams.get('limit')}`);
  });
  return requests;
}

/**
 * Opens the list with 45 rows behind it. Pages after the first wait for `releaseMore()`, so the
 * test can see the first 20 before the footer (already near the screen on short lists) asks for more.
 */
async function openList(page, baseURL, list) {
  let releaseMore;
  const morePages = new Promise((resolve) => { releaseMore = resolve; });
  await mockWorkspaceApi(page, {
    baseURL,
    ...list.options,
    responses: (path, url) => {
      if (path === list.api) return list.body(url, list.rows);
      return list.other?.[path];
    },
  });
  // Registered last, so it runs first; then hands over to the mock above.
  await page.route((url) => url.pathname === `/api${list.api}`, async (route) => {
    const requested = Number(new URL(route.request().url()).searchParams.get('page') || 1);
    if (requested > 1) await morePages;
    await route.fallback();
  });
  await page.goto(list.path);
  await expect(page.locator('header').first()).toBeVisible();
  return { releaseMore };
}

test.describe('app shell', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isPhone(testInfo), 'phones'));

  for (const list of LISTS) {
    test(`${list.name}: loads more as you scroll`, async ({ page, baseURL }) => {
      const requests = trackListRequests(page, list);
      const { releaseMore } = await openList(page, baseURL, list);
      const labels = page.getByText(list.label);
      await expect(labels.first()).toBeVisible();
      await expect(labels).toHaveCount(20);
      await expect(page.getByText(/Page \d+ of \d+/)).toHaveCount(0);

      releaseMore();
      await expect.poll(async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        return labels.count();
      }).toBe(TOTAL);
      await expect(page.getByText(list.text(pad(TOTAL)), { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
      expect([...new Set(requests)]).toEqual(['1x20', '2x20', '3x20']);
    });
  }
});

test.describe('desktop', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isDesktop(testInfo), 'desktop only'));

  for (const list of LISTS) {
    const pageSize = list.desktopPageSize ?? 10;
    const pager = list.desktopPager ?? { pageText: `Page 1 of ${Math.ceil(TOTAL / pageSize)}`, next: true };

    test(`${list.name}: keeps its page buttons`, async ({ page, baseURL }) => {
      const requests = trackListRequests(page, list);
      const { releaseMore } = await openList(page, baseURL, list);
      releaseMore();
      const labels = page.getByText(list.label);
      await expect(page.getByText(pager.pageText)).toBeVisible();
      await expect(labels).toHaveCount(pageSize);
      await expect(page.getByRole('button', { name: /Next/ })).toBeVisible();
      await expect(page.getByText('Show more')).toHaveCount(0);

      const expected = [`1x${pageSize}`];
      if (pager.next) {
        await page.getByRole('button', { name: /Next/ }).click();
        await expect(page.getByText(list.text(pad(pageSize + 1)), { exact: true })).toBeVisible();
        await expect(page.getByText(list.text(pad(1)), { exact: true })).toHaveCount(0);
        expected.push(`2x${pageSize}`);
      }
      expect([...new Set(requests)]).toEqual(expected);
    });
  }
});

test.describe('rentals (the API returns every rental)', () => {
  test.beforeEach(({}, testInfo) => test.skip(isDesktop(testInfo), 'phones and tablets only'));

  test('phones and tablets show the whole list without page buttons', async ({ page, baseURL }) => {
    const rows = many((n) => ({
      id: `r${n}`,
      rentalNumber: `RNT-${n}`,
      status: 'active',
      customer: { id: `c${n}`, name: `Renter ${n}` },
      items: [],
      startDate: '2026-10-01T09:00:00Z',
      endDate: '2026-10-08T09:00:00Z',
      createdAt: CREATED_AT,
    }));
    await mockWorkspaceApi(page, {
      baseURL,
      businessType: 'rental',
      features: NO_SHOP_SCOPING,
      responses: (path) => (path === '/rentals' ? mockBody({ success: true, data: rows }) : undefined),
    });
    await page.goto('/rentals');
    const renters = page.getByText(/^Renter \d\d$/);
    await expect(renters.first()).toBeVisible();
    await expect(renters).toHaveCount(TOTAL);
    await expect(page.getByText(/Page \d+ of \d+/)).toHaveCount(0);
    await expect(page.getByText(`All ${TOTAL} items`)).toBeVisible();
  });
});
