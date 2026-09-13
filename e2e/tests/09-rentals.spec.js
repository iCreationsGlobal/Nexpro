import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { waitForPageLoad } from './helpers/navigation';

/**
 * Rentals module E2E stub (P2-09).
 * Requires a rental business-type tenant; skips gracefully when /rentals is not available.
 */
test.describe('Rentals Module', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForPageLoad(page);
  });

  test('should load rentals page for rental tenants', async ({ page }) => {
    await page.goto('/rentals');
    await waitForPageLoad(page);

    if (!page.url().includes('/rentals')) {
      test.skip(true, 'Current tenant is not a rental business type');
    }

    await expect(page.getByText('Rentals').first()).toBeVisible();
    await expect(page.getByText(/Hire out stock/i)).toBeVisible();
  });

  test('should show rentals list or empty state', async ({ page }) => {
    await page.goto('/rentals');
    await waitForPageLoad(page);

    if (!page.url().includes('/rentals')) {
      test.skip(true, 'Current tenant is not a rental business type');
    }

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no rentals/i).isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasTable || hasEmptyState).toBeTruthy();
  });
});
