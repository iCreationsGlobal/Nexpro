import { test, expect } from '@playwright/test';
import { mockWorkspaceApi, ALL_FEATURES } from './helpers/mockApi.js';

/**
 * Phones and tablets get the app shell (bottom tabs, More sheet, app headers) like the native app;
 * desktops keep the sidebar. Run with: npx playwright test -c playwright.mobile.config.js
 */

const tabBar = (page) => page.locator('[data-app-tab-bar]');
const tabLabels = (page) => tabBar(page).locator('li').allInnerTexts();
const isDesktop = (testInfo) => testInfo.project.name === 'desktop';
const isPhone = (testInfo) => ['phone', 'iphone'].includes(testInfo.project.name);
const openOverlays = (page) => page.locator('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');

const CUSTOMER = { id: 'c1', name: 'Kofi Mensah', phone: '0244000000', email: 'kofi@example.com', isActive: true, createdAt: '2026-09-01T10:00:00Z' };
/** One customer in the list, without shop scoping (no shop to pick). */
const withCustomer = {
  features: ALL_FEATURES.filter((key) => key !== 'shopsModule'),
  responses: (path) => {
    if (path === '/customers') return [CUSTOMER];
    if (path === '/customers/c1') return CUSTOMER;
    return undefined;
  },
};

async function openApp(page, baseURL, path = '/dashboard', options = {}) {
  await mockWorkspaceApi(page, { baseURL, ...options });
  await page.goto(path);
  await expect(page.locator('header').first()).toBeVisible();
}

test.describe('desktop', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isDesktop(testInfo), 'desktop only'));

  test('keeps the sidebar and has no tab bar', async ({ page, baseURL }) => {
    await openApp(page, baseURL);
    await expect(page.locator('[data-tour="sidebar"]')).toBeVisible();
    await expect(tabBar(page)).toHaveCount(0);
  });
});

test.describe('app shell', () => {
  test.beforeEach(({}, testInfo) => test.skip(isDesktop(testInfo), 'phones and tablets only'));

  test('shows the native tab slots for a shop', async ({ page, baseURL }) => {
    await openApp(page, baseURL);
    await expect(tabBar(page)).toBeVisible();
    expect(await tabLabels(page)).toEqual(['Dashboard', 'Customers', 'Sell', 'Invoices', 'More']);
    await expect(page.locator('[data-tour="sidebar"]')).toHaveCount(0);
  });

  test('swaps tabs for focus areas, studios, Simple Mode and drivers', async ({ page, baseURL }) => {
    await openApp(page, baseURL, '/dashboard', { focusAreas: ['online_store'] });
    await expect(tabBar(page).getByText('Orders')).toBeVisible();
    expect(await tabLabels(page)).toEqual(['Dashboard', 'Products', 'Sell', 'Orders', 'More']);
  });

  test('studio businesses add a job from the centre', async ({ page, baseURL }) => {
    await openApp(page, baseURL, '/dashboard', { businessType: 'printing_press' });
    expect(await tabLabels(page)).toEqual(['Dashboard', 'Customers', 'Add Job', 'Invoices', 'More']);
  });

  test('Simple Mode: Home · Sales · Sell · Expenses · More', async ({ page, baseURL }) => {
    await openApp(page, baseURL, '/dashboard', { interfaceMode: 'simple' });
    await expect(tabBar(page)).toBeVisible();
    expect(await tabLabels(page)).toEqual(['Home', 'Sales', 'Sell', 'Expenses', 'More']);
  });

  test('drivers: Deliveries · Account', async ({ page, baseURL }) => {
    await openApp(page, baseURL, '/deliveries', { role: 'driver' });
    await expect(tabBar(page)).toBeVisible();
    expect(await tabLabels(page)).toEqual(['Deliveries', 'Account']);
  });

  test('More lists every section, navigates and closes', async ({ page, baseURL }) => {
    await openApp(page, baseURL);
    await tabBar(page).getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    for (const section of ['Store', 'Work', 'Reports', 'Business tools', 'Account']) {
      await expect(sheet.getByRole('heading', { name: section, exact: true })).toBeVisible();
    }
    // Web-only pages stay reachable on phones.
    await expect(sheet.getByRole('link', { name: 'Accounting' })).toBeVisible();
    await sheet.getByRole('link', { name: 'Expenses' }).click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('inner pages have a back button and title', async ({ page, baseURL }) => {
    await openApp(page, baseURL, '/settings/payments');
    const header = page.locator('[data-app-header="inner"]');
    await expect(header.getByRole('heading', { name: 'Payments' })).toBeVisible();
    await header.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('no sideways scroll; 16px search; tab bar steps aside while typing', async ({ page, baseURL }) => {
    await openApp(page, baseURL, '/customers');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const search = page.locator('[data-app-header] input[type="search"]');
    await expect(search).toBeVisible();
    expect(await search.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
    await search.focus();
    await expect(tabBar(page)).toHaveAttribute('aria-hidden', 'true');
    await search.blur();
    await expect(tabBar(page)).not.toHaveAttribute('aria-hidden', 'true');
  });

  test('header menus open on screen after scrolling', async ({ page, baseURL }) => {
    await openApp(page, baseURL);
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.getByRole('button', { name: 'Account menu' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
  });

  test('centre button opens the point of sale', async ({ page, baseURL }) => {
    await openApp(page, baseURL);
    await tabBar(page).getByRole('link', { name: 'Sell' }).click();
    await expect(page).toHaveURL(/\/sales/);
    await expect(page.getByRole('dialog', { name: 'Point of Sale' })).toBeVisible();
  });

  test('back closes the More sheet without leaving the page', async ({ page, baseURL }) => {
    await openApp(page, baseURL);
    await tabBar(page).getByRole('button', { name: 'More' }).click();
    await expect(openOverlays(page)).toHaveCount(1);
    await page.goBack();
    await expect(openOverlays(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('closing a sheet another way leaves history as it was', async ({ page, baseURL }) => {
    await openApp(page, baseURL);
    await tabBar(page).getByRole('link', { name: 'Customers' }).click();
    await expect(page).toHaveURL(/\/customers$/);
    await tabBar(page).getByRole('button', { name: 'More' }).click();
    await expect(openOverlays(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(openOverlays(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('tapping a card opens the record; back closes it', async ({ page, baseURL }, testInfo) => {
    await openApp(page, baseURL, '/customers', withCustomer);
    await expect(page.getByText('Kofi Mensah').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'View', exact: true })).toHaveCount(0);
    await page.getByText('Kofi Mensah').first().click();
    const detail = openOverlays(page).first();
    await expect(detail).toBeVisible();
    if (isPhone(testInfo)) {
      // Phones: a full-screen page with its own back button.
      const box = await detail.boundingBox();
      expect(box.width).toBe(page.viewportSize().width);
      await expect(detail.getByRole('button', { name: 'Back' })).toBeVisible();
    }
    await page.goBack();
    await expect(openOverlays(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/customers$/);
  });

  test('confirmations rise from the bottom on phones; back cancels only the confirm', async ({ page, baseURL }, testInfo) => {
    await openApp(page, baseURL, '/customers', withCustomer);
    await page.getByText('Kofi Mensah').first().click();
    await openOverlays(page).first().getByRole('button', { name: /more/i }).click();
    await page.getByRole('menuitem', { name: /delete/i }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    if (isPhone(testInfo)) {
      const viewport = page.viewportSize();
      // Measured once the slide-up animation has finished.
      await expect.poll(async () => {
        const box = await confirm.boundingBox();
        return box && [Math.round(box.y + box.height), Math.round(box.width)];
      }).toEqual([viewport.height, viewport.width]);
    }
    await page.goBack();
    await expect(confirm).toHaveCount(0);
    await expect(openOverlays(page)).toHaveCount(1);
  });

  test('back closes the point of sale', async ({ page, baseURL }) => {
    await openApp(page, baseURL);
    await tabBar(page).getByRole('link', { name: 'Sell' }).click();
    await expect(page.getByRole('dialog', { name: 'Point of Sale' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog', { name: 'Point of Sale' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/sales/);
  });

  test('/pos opens the point of sale', async ({ page, baseURL }) => {
    await openApp(page, baseURL, '/pos');
    await expect(page.getByRole('dialog', { name: 'Point of Sale' })).toBeVisible();
  });
});
