import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import { getMenuItems, flattenNavItems } from '@/config/navigation';
import { getSimpleModeConfig, buildSimpleModeNav } from '@/config/simpleMode';
import {
  buildMoreMenuSections,
  buildTabBarItems,
  findActiveNavId,
  isNavPathActive,
} from '@/config/appShellNav';
import { getAppShellRouteMeta } from '@/config/appShellRoutes';
import { sanitizeFocusAreaIds } from '@/config/focusAreas';
import { APP_SHELL_MEDIA_QUERY, PHONE_MEDIA_QUERY } from '@/hooks/useDeviceMode';

const ALL_FEATURES = [
  'crm', 'products', 'paymentsExpenses', 'invoices', 'expenses', 'dealersAccount', 'orders', 'watch',
  'jobAutomation', 'quoteAutomation', 'leadPipeline', 'tasks', 'deliveries', 'rentals', 'materials',
  'automations', 'marketing', 'vendors', 'payroll', 'accounting', 'reports', 'advancedReporting',
  'graEvat', 'roleManagement', 'shopsModule', 'pharmacyOps', 'pricingTemplates', 'studioLocationsModule',
];

const features = (list = ALL_FEATURES) => {
  const set = new Set(list);
  return (key) => set.has(key);
};

/** Owner-level nav for a business, as useAppShellNav builds it. */
function shell({
  businessType = 'shop',
  shopType = null,
  hasFeature = features(),
  isDriver = false,
  isManager = true,
  focusAreas = [],
  simple = false,
} = {}) {
  const allMenuItems = getMenuItems(businessType, isManager, isManager, isDriver, shopType, hasFeature, false);
  const config = simple ? getSimpleModeConfig(businessType) : null;
  const simpleMode = { isRestricted: Boolean(config), config };
  const menuItems = config ? buildSimpleModeNav(config, allMenuItems) : allMenuItems;
  const tabItems = buildTabBarItems({
    businessType,
    isDriver,
    simpleMode,
    allMenuItems,
    menuItems,
    focusAreas: sanitizeFocusAreaIds(focusAreas, businessType, hasFeature),
  });
  const moreSections = buildMoreMenuSections({ menuItems, tabItems, isDriver, simpleMode });
  return { menuItems, tabItems, moreSections };
}

const tabSummary = (tabItems) => tabItems.map((tab) => (tab.action === 'more' ? 'More' : `${tab.label}:${tab.to}`));
const moreTargets = (moreSections) => moreSections.flatMap((section) => section.items.map((item) => item.to));

describe('buildTabBarItems (mirrors mobile/app/(tabs)/_layout.tsx)', () => {
  it('shop: Dashboard · Customers · Sell · Invoices · More', () => {
    expect(tabSummary(shell().tabItems)).toEqual([
      'Dashboard:/dashboard',
      'Customers:/customers',
      'Sell:/sales?openPOS=1',
      'Invoices:/invoices',
      'More',
    ]);
  });

  it('pharmacy: no Sell button while the web point of sale is shop-only', () => {
    expect(tabSummary(shell({ businessType: 'pharmacy' }).tabItems)).toEqual([
      'Dashboard:/dashboard',
      'Customers:/customers',
      'Invoices:/invoices',
      'More',
    ]);
  });

  it('studio types add a job from the centre', () => {
    for (const businessType of ['printing_press', 'barber', 'studio']) {
      const tabs = shell({ businessType }).tabItems;
      expect(tabs.find((tab) => tab.center)).toMatchObject({ label: 'Add Job', to: '/jobs?add=1' });
    }
  });

  it('rental: New rental in the centre and no Invoices tab (like native)', () => {
    expect(tabSummary(shell({ businessType: 'rental' }).tabItems)).toEqual([
      'Dashboard:/dashboard',
      'Customers:/customers',
      'New rental:/rentals?add=1',
      'More',
    ]);
  });

  it('drops tabs the plan does not include', () => {
    const tabs = shell({ hasFeature: features(['paymentsExpenses', 'products']) }).tabItems;
    expect(tabSummary(tabs)).toEqual(['Dashboard:/dashboard', 'Sell:/sales?openPOS=1', 'More']);
  });

  it('first focus area takes slot 2; "Sell online" swaps Invoices for Orders', () => {
    expect(tabSummary(shell({ focusAreas: ['expenses'] }).tabItems)[1]).toBe('Expenses:/expenses');
    const online = tabSummary(shell({ focusAreas: ['online_store'] }).tabItems);
    expect(online[1]).toBe('Products:/products');
    expect(online[3]).toBe('Orders:/online-store/orders');
  });

  it('focus areas that do not apply to the business type are ignored', () => {
    // Dealers only applies to shops; Rentals only to rental businesses.
    expect(tabSummary(shell({ businessType: 'pharmacy', focusAreas: ['dealers'] }).tabItems)[1]).toBe('Customers:/customers');
    expect(tabSummary(shell({ focusAreas: ['rentals'] }).tabItems)[1]).toBe('Customers:/customers');
  });

  it('"Jobs & quotes" falls back to Quotes when the workspace has no jobs', () => {
    const hasFeature = features(ALL_FEATURES.filter((key) => key !== 'jobAutomation'));
    const tabs = shell({ businessType: 'pharmacy', hasFeature, focusAreas: ['jobs_quotes'] }).tabItems;
    expect(tabSummary(tabs)[1]).toBe('Quotes:/quotes');
  });

  it('drivers get Deliveries · Account', () => {
    expect(tabSummary(shell({ isDriver: true }).tabItems)).toEqual(['Deliveries:/deliveries', 'Account:/profile']);
    expect(shell({ isDriver: true }).moreSections).toEqual([]);
  });

  it('Simple Mode: Home · Sales · Sell · Expenses · More, with the rest as tiles', () => {
    const { tabItems, moreSections } = shell({ simple: true });
    expect(tabSummary(tabItems)).toEqual([
      'Home:/dashboard',
      'Sales:/sales',
      'Sell:/sales?openPOS=1',
      'Expenses:/expenses',
      'More',
    ]);
    expect(tabItems[1].tone).toBeTruthy();
    expect(moreTargets(moreSections)).toEqual(['/customers', '/products', '/reports/overview', '/settings']);
  });
});

describe('buildMoreMenuSections', () => {
  const scenarios = [
    { name: 'shop', args: {} },
    { name: 'restaurant', args: { shopType: 'restaurant' } },
    { name: 'pharmacy', args: { businessType: 'pharmacy' } },
    { name: 'printing press', args: { businessType: 'printing_press' } },
    { name: 'rental', args: { businessType: 'rental' } },
    { name: 'shop, staff member', args: { isManager: false } },
    { name: 'shop, online focus', args: { focusAreas: ['online_store', 'leads'] } },
    { name: 'shop, small plan', args: { hasFeature: features(['crm', 'paymentsExpenses', 'products', 'expenses']) } },
    { name: 'simple mode', args: { simple: true } },
  ];

  it.each(scenarios)('$name: every menu page is on the tab bar or in More', ({ args }) => {
    const { menuItems, tabItems, moreSections } = shell(args);
    const reachable = new Set([
      ...tabItems.filter((tab) => tab.to && !tab.center).map((tab) => tab.to),
      ...moreTargets(moreSections),
    ]);
    const missing = flattenNavItems(menuItems)
      .map((item) => item.key)
      .filter((key) => !reachable.has(key));
    expect(missing).toEqual([]);
  });

  it.each(scenarios)('$name: no page is listed twice in More', ({ args }) => {
    const targets = moreTargets(shell(args).moreSections);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('follows the native sections, with web-only pages under Business tools', () => {
    const sections = shell().moreSections;
    expect(sections.map((section) => section.title || section.id)).toEqual([
      'main', 'Store', 'Work', 'Reports', 'Business tools', 'Account',
    ]);
    const tools = sections.find((section) => section.id === 'tools').items.map((item) => item.to);
    expect(tools).toEqual(expect.arrayContaining(['/accounting', '/payroll', '/employees', '/vendors', '/marketing', '/users']));
    const account = sections.find((section) => section.id === 'account').items.map((item) => item.to);
    expect(account).toEqual(['/profile', '/settings']);
  });

  it('keeps Customers reachable when a focus area takes its tab', () => {
    const main = shell({ focusAreas: ['expenses'] }).moreSections.find((section) => section.id === 'main');
    expect(main.items.map((item) => item.to)).toEqual(['/dashboard', '/customers']);
  });

  it('gives group children a label that makes sense on its own', () => {
    const labels = shell().moreSections.flatMap((section) => section.items).map((item) => item.label);
    expect(labels).toContain('Online store');
    expect(labels).toContain('Online orders');
    expect(labels).toContain('Reports');
    expect(labels).not.toContain('Overview');
    expect(labels).not.toContain('Storefront');
  });
});

describe('active tab matching', () => {
  it('matches the page and its sub-pages', () => {
    expect(isNavPathActive('/', '/dashboard')).toBe(true);
    expect(isNavPathActive('/customers', '/customers')).toBe(true);
    expect(isNavPathActive('/customers/', '/customers')).toBe(true);
    expect(isNavPathActive('/sales/returns', '/sales?openPOS=1')).toBe(true);
    expect(isNavPathActive('/salesforce', '/sales')).toBe(false);
  });

  it('prefers the most specific entry and never marks the centre action', () => {
    const items = [
      { id: 'store', to: '/store' },
      { id: 'listings', to: '/store/listings' },
      { id: 'sell', to: '/sales?openPOS=1', center: true },
    ];
    expect(findActiveNavId('/store/listings/1/edit', items)).toBe('listings');
    expect(findActiveNavId('/store', items)).toBe('store');
    expect(findActiveNavId('/sales', items)).toBeNull();
  });
});

describe('getAppShellRouteMeta', () => {
  const { tabItems, moreSections } = shell();
  const destinations = [
    ...tabItems.filter((tab) => tab.to && !tab.center),
    ...moreSections.filter((section) => section.id !== 'account').flatMap((section) => section.items),
  ];
  const meta = (path) => getAppShellRouteMeta(path, { destinations });

  it('tab and More destinations get the app header', () => {
    expect(meta('/dashboard').kind).toBe('root');
    expect(meta('/customers')).toMatchObject({ kind: 'root', title: 'Customers' });
    expect(meta('/accounting').kind).toBe('root');
    expect(meta('/messages/templates').kind).toBe('root');
  });

  it('inner pages get a back button, title and parent', () => {
    expect(meta('/settings')).toMatchObject({ kind: 'inner', title: 'Settings', backTo: '/dashboard' });
    expect(meta('/settings/payments')).toMatchObject({ kind: 'inner', title: 'Payments', backTo: '/settings' });
    expect(meta('/profile')).toMatchObject({ kind: 'inner', title: 'Profile' });
    expect(meta('/dealers/42/prices')).toMatchObject({ kind: 'inner', backTo: '/dealers' });
    expect(meta('/sales/returns')).toMatchObject({ kind: 'inner', title: 'Returns', backTo: '/sales' });
  });

  it('editors with their own action bar hide the tab bar', () => {
    expect(meta('/store/listings/9/edit').hideTabBar).toBe(true);
    expect(meta('/customers').hideTabBar).toBe(false);
  });

  it('unknown sub-pages go back to the closest destination', () => {
    expect(meta('/expenses/something')).toMatchObject({ kind: 'inner', title: 'Expenses', backTo: '/expenses' });
  });

  it("a driver's Account tab is a root page", () => {
    const driver = shell({ isDriver: true });
    const driverMeta = getAppShellRouteMeta('/profile', { destinations: driver.tabItems });
    expect(driverMeta.kind).toBe('root');
  });
});

describe('layout media queries', () => {
  it('useDeviceMode and the Tailwind shell:/desk: variants use the same queries', () => {
    const require = createRequire(import.meta.url);
    const { layoutMedia } = require('../../../tailwind.config.js');
    expect(layoutMedia.APP_SHELL_MEDIA).toBe(APP_SHELL_MEDIA_QUERY);
    expect(layoutMedia.PHONE_MEDIA).toBe(PHONE_MEDIA_QUERY);
  });
});
