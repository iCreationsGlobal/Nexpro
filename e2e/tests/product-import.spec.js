import { test, expect } from '@playwright/test';
import { mockWorkspaceApi, mockBody, ALL_FEATURES } from './helpers/mockApi.js';

/**
 * Product import: check the file first (nothing changes), then add, then undo.
 * Run with: npx playwright test -c playwright.mobile.config.js tests/product-import.spec.js
 */

/** No shop or studio to pick, so Products loads straight away. */
const FEATURES = ALL_FEATURES.filter((key) => !['shopsModule', 'studioLocationsModule'].includes(key));

const PREVIEW = {
  success: true,
  summary: { total: 4, add: 2, skip: 1, error: 1 },
  rows: [
    { row: 2, name: 'Rice 5kg', status: 'add' },
    { row: 3, name: 'Milo 400g', status: 'skip', reason: 'SKU M1 is already used by "Milo tin"' },
    { row: 5, name: 'Beans', status: 'add' },
  ],
  newCategories: ['Grains'],
  errors: [{ row: 4, message: 'Selling Price cannot be negative' }],
};

const IMPORTED = {
  success: false,
  batchId: 'batch-1',
  successCount: 2,
  skippedCount: 1,
  errorCount: 1,
  created: [{ row: 2, id: 'p1', name: 'Rice 5kg' }, { row: 5, id: 'p2', name: 'Beans' }],
  skipped: [{ row: 3, name: 'Milo 400g', reason: 'SKU M1 is already used by "Milo tin"' }],
  errors: [{ row: 4, message: 'Selling Price cannot be negative' }],
  newCategories: ['Grains'],
};

const UNDONE = {
  success: true,
  removedCount: 1,
  keptCount: 1,
  removed: [{ id: 'p1', name: 'Rice 5kg' }],
  kept: [{ id: 'p2', name: 'Beans', reason: 'Already sold' }],
};

test('check the file, add the products, then undo the import', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The dialog is the same on every screen; checked once on desktop.');

  const calls = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/products/import')) calls.push(`${request.method()} ${pathname.replace('/api', '')}`);
  });
  await mockWorkspaceApi(page, {
    baseURL,
    features: FEATURES,
    responses: (path) => {
      if (path === '/products/import/preview') return mockBody(PREVIEW);
      if (path === '/products/import') return mockBody(IMPORTED);
      if (path === '/products/import/batch-1') return mockBody(UNDONE);
      return undefined;
    },
  });
  await page.goto('/products');

  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('menuitem', { name: 'Import products' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import products' });
  await dialog.getByLabel('Select CSV or Excel file').setInputFiles({
    name: 'stock.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Product Name,SKU,Selling Price\nRice 5kg,,40\nMilo 400g,M1,30\nOil,,-1\nBeans,,12\n'),
  });

  // Step 1: the check shows what will happen; nothing is added yet.
  await dialog.getByRole('button', { name: 'Check file' }).click();
  await expect(dialog.getByText('2 to add · 1 already in your products or repeated · 1 with problems')).toBeVisible();
  await expect(dialog.getByText('Create a new category: Grains')).toBeVisible();
  await expect(dialog.getByText('Row 3: Milo 400g: SKU M1 is already used by "Milo tin"')).toBeVisible();
  await expect(dialog.getByText('Row 4: Selling Price cannot be negative')).toBeVisible();
  expect(calls).toEqual(['POST /products/import/preview']);

  // Step 2: add.
  await dialog.getByRole('button', { name: 'Add 2 products' }).click();
  await expect(dialog.getByText('2 added · 1 skipped · 1 with problems')).toBeVisible();

  // Undo removes what nothing has used and says what it kept.
  await dialog.getByRole('button', { name: 'Undo import' }).click();
  await expect(dialog.getByText('Import undone: 1 removed, 1 kept')).toBeVisible();
  await expect(dialog.getByText('Beans: Already sold')).toBeVisible();
  expect(calls).toEqual(['POST /products/import/preview', 'POST /products/import', 'DELETE /products/import/batch-1']);
});
