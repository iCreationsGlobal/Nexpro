import { defineConfig, devices } from '@playwright/test';

/**
 * Phone/tablet app-shell UI tests: `npx playwright test -c playwright.mobile.config.js`
 *
 * No backend or database: tests/helpers/mockApi.js answers every API call in the browser, and the
 * dev server's API URL points at a dead port so nothing can reach a real server.
 * Only Chromium is needed (iPhone/iPad projects emulate the screen, touch and user agent).
 */
const PORT = 5199;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  testMatch: /(mobile-shell|infinite-lists-[a-z-]+)\.spec\.js/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'html' : 'list',
  // The dev server compiles pages on first visit; give slow or busy machines room.
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'ipad-portrait', use: { ...devices['iPad Mini'], browserName: 'chromium' } },
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'], browserName: 'chromium' } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `cd ../Frontend && VITE_API_URL=http://127.0.0.1:59999 npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        cwd: __dirname,
      },
});
