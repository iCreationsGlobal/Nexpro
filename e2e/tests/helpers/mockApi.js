/**
 * Answers every API call in the browser so UI tests run without a backend or database.
 * Used by the phone/tablet app-shell tests (playwright.mobile.config.js).
 */

const ALL_FEATURES = [
  'crm', 'products', 'paymentsExpenses', 'invoices', 'expenses', 'dealersAccount', 'orders', 'watch',
  'jobAutomation', 'quoteAutomation', 'leadPipeline', 'tasks', 'deliveries', 'rentals', 'materials',
  'automations', 'marketing', 'vendors', 'payroll', 'accounting', 'reports', 'advancedReporting',
  'graEvat', 'roleManagement', 'shopsModule', 'pharmacyOps', 'pricingTemplates', 'studioLocationsModule',
];

/**
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {string} options.baseURL - The app's origin (Playwright's `baseURL` fixture)
 * @param {string} [options.businessType] - shop, pharmacy, rental, printing_press, …
 * @param {string} [options.role] - owner, manager, staff, driver
 * @param {'full'|'simple'} [options.interfaceMode]
 * @param {string[]} [options.focusAreas] - Ranked focus-area ids
 * @param {string[]} [options.features] - Plan features switched on (default: all)
 * @param {(path: string) => unknown} [options.responses] - Data for specific API paths ('/customers', …)
 */
export { ALL_FEATURES };

export async function mockWorkspaceApi(page, {
  baseURL,
  businessType = 'shop',
  role = 'owner',
  interfaceMode = 'full',
  focusAreas = [],
  features = ALL_FEATURES,
  responses = () => undefined,
}) {
  const tenant = {
    id: 't1',
    name: 'Test Shop',
    businessType,
    plan: 'pro',
    effectiveFeatureFlags: Object.fromEntries(features.map((key) => [key, true])),
    metadata: { onboarding: { completedAt: '2026-01-01T00:00:00Z' } },
    billingStatus: { canAccessApp: true, billingStatus: 'active' },
  };
  const membership = { tenantId: 't1', isDefault: true, role, tenant, metadata: { interfaceMode } };
  const user = {
    id: 'u1',
    name: 'Test Owner',
    email: 'owner@example.com',
    role,
    emailVerifiedAt: '2026-01-01T00:00:00Z',
    isFirstLogin: false,
  };

  await page.addInitScript(({ user: storedUser, membership: storedMembership }) => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify(storedUser));
    localStorage.setItem('tenantMemberships', JSON.stringify([storedMembership]));
    localStorage.setItem('activeTenantId', 't1');
    // Simple Mode: a device PIN exists and this tab is unlocked.
    localStorage.setItem(`device_pin_hash_${storedUser.id}`, 'test');
    sessionStorage.setItem('simple_mode_unlocked_until', String(Date.now() + 3600e3));
    // No first-run tour prompt.
    sessionStorage.setItem('mainTourPromptedThisSession', 'true');
  }, { user, membership });

  const appOrigin = new URL(baseURL).origin;
  const isMocked = (url) =>
    url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.origin !== appOrigin;

  await page.route(isMocked, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/socket.io')) return route.abort();
    if (!url.pathname.startsWith('/api')) return route.fulfill({ status: 204, body: '' });

    const path = url.pathname.replace(/^\/api/, '');
    const provided = responses(path);
    let data = [];
    if (provided !== undefined) {
      data = provided;
    } else if (path.startsWith('/auth/bootstrap') || path.startsWith('/auth/me')) {
      data = { user, memberships: [membership], activeTenantId: 't1', activeTenant: tenant, workspace: null, access: {}, settings: {}, tenantRole: role };
    } else if (path.startsWith('/settings/focus-areas')) {
      data = { focusAreas, source: focusAreas.length ? 'user' : 'none' };
    } else if (path.startsWith('/settings/sidebar-preferences')) {
      data = { hiddenSidebarKeys: [] };
    } else if (path.includes('subscription')) {
      data = { canAccessApp: true, billingStatus: 'active' };
    } else if (path.startsWith('/notifications/summary')) {
      data = { unread: 0, total: 0 };
    } else if (path.startsWith('/settings/organization')) {
      data = { name: 'Test Shop' };
    } else if (path.startsWith('/public') || path.includes('config')) {
      data = {};
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
    });
  });
}
