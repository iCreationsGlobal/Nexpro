# African Business Suite End-to-End Tests

Comprehensive end-to-end testing suite for the African Business Suite application using Playwright.

## Setup

1. Install dependencies:
```bash
cd e2e
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Configuration

The test configuration is in `playwright.config.js`. It:
- Runs tests in parallel
- Starts both backend and frontend servers automatically
- Generates HTML reports
- Takes screenshots on failure
- Records videos on failure

## Running Tests

### Run all tests:
```bash
npm test
```

### Run tests with UI mode (interactive):
```bash
npm run test:ui
```

### Run tests in headed mode (see browser):
```bash
npm run test:headed
```

### Run specific test suite:
```bash
npm run test:dashboard
npm run test:jobs
npm run test:leads
npm run test:customers
npm run test:financial
npm run test:resources
npm run test:reports
npm run test:settings
npm run test:full
```

### Phone/tablet app shell (no backend needed):
```bash
npx playwright test -c playwright.mobile.config.js
```
Starts only the Frontend dev server; every API call is answered in the browser
(`tests/helpers/mockApi.js`). Runs desktop, Pixel 7, iPhone 13, iPad Mini and
iPad Pro landscape projects on Chromium.

### Debug tests:
```bash
npm run test:debug
```

## Test Structure

Tests are organized by feature/module:

- `00-full-flow.spec.js` - Complete application flow test
- `01-dashboard.spec.js` - Dashboard functionality
- `02-jobs.spec.js` - Jobs management
- `03-leads.spec.js` - Leads management
- `04-customers.spec.js` - Customers management
- `05-financial.spec.js` - Financial module (Quotes, Invoices, Expenses, etc.)
- `06-resources.spec.js` - Resources module (Inventory, Employees)
- `07-reports.spec.js` - Reports functionality
- `08-settings.spec.js` - Settings and configuration

## Helpers

Test helpers are in `tests/helpers/`:

- `auth.js` - Authentication helpers (login, logout)
- `navigation.js` - Navigation helpers (menu navigation)
- `common.js` - Common utilities (clicking, filling forms, etc.)

## Test Order

Tests follow the sidebar navigation order:

1. Dashboard
2. Jobs
3. Leads
4. Customers
5. Sales & Operations
   - Vendors
6. Financial
   - Quotes
   - Invoices
   - Expenses
   - Pricing
   - Payroll
   - Accounting
7. Resources
   - Inventory
   - Employees
8. Reports
9. Settings

## Environment Variables

Set these in your environment or `.env` file:

- `PLAYWRIGHT_BASE_URL` - Base URL for the frontend (default: http://localhost:3000)
- `TEST_USER_EMAIL` - Test user email (default: superadmin@nexpro.com)
- `TEST_USER_PASSWORD` - Test user password (default: 111111@1A)

## Reports

After running tests, view the HTML report:
```bash
npm run report
```

## Screenshots

Screenshots are saved in `screenshots/` directory on test failures.

## CI/CD

For CI/CD pipelines, tests run in headless mode automatically. Set `CI=true` environment variable.
