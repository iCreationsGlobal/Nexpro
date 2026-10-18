import {
  BarChart3,
  Boxes,
  Building,
  Building2,
  Calculator,
  CalendarClock,
  ChefHat,
  ClipboardList,
  Contact,
  Download,
  FileBarChart,
  FileCheck2,
  FileText,
  Globe,
  Home,
  LayoutList,
  ListChecks,
  MapPin,
  Megaphone,
  Menu,
  MessageSquare,
  Package,
  PackageCheck,
  Pill,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Tags,
  Truck,
  UserCircle,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { STUDIO_LIKE_TYPES } from '@/constants';
import { flattenNavItems } from '@/config/navigation';
import { getFocusAreaDefinition } from '@/config/focusAreas';

/**
 * Phone/tablet navigation (bottom tab bar + More sheet), mirroring the native app:
 * mobile/app/(tabs)/_layout.tsx and mobile/utils/moreMenuItems.ts.
 *
 * Tabs: Dashboard · focus slot (Customers by default) · centre action · Invoices (or Orders) · More
 * Simple Mode: Home · Sales · Sell · Expenses · More. Drivers: Deliveries · Account.
 *
 * The More sheet lists every page in the member's menu that is not already a tab, so nothing the
 * desktop sidebar offers becomes unreachable on a phone (web-only pages sit under Business tools).
 */

/** Strip query/hash: '/sales?openPOS=1' → '/sales'. */
export const navBasePath = (to = '') => String(to).split(/[?#]/)[0] || '/';

/** Whether `pathname` is at `to` or inside it ('/dashboard' also covers '/'). */
export function isNavPathActive(pathname = '', to = '') {
  const base = navBasePath(to);
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (base === '/dashboard' && (path === '/' || path === '')) return true;
  return path === base || path.startsWith(`${base}/`);
}

/**
 * The item whose path best matches `pathname` (longest match wins, so '/store/listings' beats '/store').
 * @param {string} pathname
 * @param {Array<{ id: string, to?: string, center?: boolean }>} items
 * @returns {string|null}
 */
export function findActiveNavId(pathname, items = []) {
  let best = null;
  let bestLength = -1;
  for (const item of items) {
    if (!item?.to || item.center) continue;
    if (!isNavPathActive(pathname, item.to)) continue;
    const length = navBasePath(item.to).length;
    if (length > bestLength) {
      best = item.id;
      bestLength = length;
    }
  }
  return best;
}

const isStudioType = (businessType) =>
  businessType === 'studio' || STUDIO_LIKE_TYPES.includes(businessType);

const menuPathSet = (menuItems) => new Set(flattenNavItems(menuItems).map((item) => item.key));

const DASHBOARD_TAB = { id: 'dashboard', label: 'Dashboard', icon: Home, to: '/dashboard' };
const MORE_TAB = { id: 'more', label: 'More', icon: Menu, action: 'more' };

/**
 * @param {object} args
 * @param {string|null} args.businessType - Resolved type (shop, pharmacy, rental, printing_press, studio, …)
 * @param {boolean} args.isDriver
 * @param {{ isRestricted: boolean, config: object|null }} args.simpleMode
 * @param {Array} args.allMenuItems - Menu allowed by role and plan (before hide-from-menu choices)
 * @param {Array} args.menuItems - Menu as shown (Simple Mode: the flattened Simple Mode list)
 * @param {string[]} [args.focusAreas] - Ranked focus-area ids (already sanitized)
 * @returns {Array<{ id: string, label: string, icon: unknown, to?: string, action?: 'more', center?: boolean, tone?: string }>}
 */
export function buildTabBarItems({
  businessType,
  isDriver,
  simpleMode,
  allMenuItems = [],
  menuItems = [],
  focusAreas = [],
}) {
  if (isDriver) {
    return [
      { id: 'deliveries', label: 'Deliveries', icon: ClipboardList, to: '/deliveries' },
      { id: 'account', label: 'Account', icon: UserCircle, to: '/profile' },
    ];
  }

  if (simpleMode?.isRestricted && simpleMode.config) {
    const shown = new Map(menuItems.map((item) => [item.key, item]));
    const simpleTab = (key, id, label) => {
      const item = shown.get(key);
      return item ? { id, label, icon: item.icon, to: key, tone: item.tone } : null;
    };
    const sales = simpleTab('/sales', 'sales', 'Sales');
    return [
      simpleTab('/dashboard', 'dashboard', 'Home') || { ...DASHBOARD_TAB, label: 'Home' },
      sales,
      sales ? { id: 'sell', label: 'Sell', icon: ShoppingCart, to: '/sales?openPOS=1', center: true } : null,
      simpleTab('/expenses', 'expenses', 'Expenses'),
      MORE_TAB,
    ].filter(Boolean);
  }

  const paths = menuPathSet(allMenuItems);
  const isRental = businessType === 'rental';
  const isStudio = isStudioType(businessType);
  const isRetail = !isRental && !isStudio; // shop, pharmacy (and unknown types, like native)

  // Slot 2: the member's #1 focus area, else Customers.
  let focusTab = null;
  const primaryFocus = getFocusAreaDefinition(focusAreas[0]);
  if (primaryFocus) {
    if (primaryFocus.id === 'online_store' && paths.has('/products')) {
      // Native swaps "Sell online" for Products here; store orders get slot 4.
      focusTab = { id: 'focus', label: 'Products', icon: Package, to: '/products' };
    } else {
      const to = primaryFocus.paths.find((path) => paths.has(path));
      if (to) {
        focusTab = {
          id: 'focus',
          label: to === '/quotes' ? 'Quotes' : primaryFocus.tabLabel,
          icon: primaryFocus.icon,
          to,
        };
      }
    }
  }
  if (!focusTab && paths.has('/customers')) {
    focusTab = { id: 'customers', label: 'Customers', icon: Users, to: '/customers' };
  }

  // Centre: the main action for this kind of business.
  let centerTab = null;
  if (isRental) {
    if (paths.has('/rentals')) {
      centerTab = { id: 'new-rental', label: 'New rental', icon: Plus, to: '/rentals?add=1', center: true };
    }
  } else if (isStudio) {
    if (paths.has('/jobs')) {
      centerTab = { id: 'add-job', label: 'Add Job', icon: Plus, to: '/jobs?add=1', center: true };
    }
  } else if (paths.has('/sales')) {
    // The web point of sale lives on the Sales page (shops; pharmacies have no web POS yet).
    centerTab = { id: 'sell', label: 'Sell', icon: ShoppingCart, to: '/sales?openPOS=1', center: true };
  }

  // Slot 4: Invoices, or store orders when the member sells online.
  let fourthTab = null;
  if (focusAreas.includes('online_store')) {
    const to = ['/online-store/orders', '/store/orders'].find((path) => paths.has(path));
    if (to) fourthTab = { id: 'orders', label: 'Orders', icon: ClipboardList, to };
  }
  if (!fourthTab && (isRetail || isStudio) && paths.has('/invoices')) {
    fourthTab = { id: 'invoices', label: 'Invoices', icon: Receipt, to: '/invoices' };
  }

  return [DASHBOARD_TAB, focusTab, centerTab, fourthTab, MORE_TAB].filter(Boolean);
}

/** More-sheet labels for entries that are children of a sidebar group (where the group gave context). */
const MORE_LABELS = {
  '/sales': 'Sales',
  '/store': 'Sabito Store',
  '/store/listings': 'Store listings',
  '/store/services': 'Studio services',
  '/store/orders': 'Sabito orders',
  '/store/settings': 'Sabito Store settings',
  '/online-store': 'Online store',
  '/online-store/orders': 'Online orders',
  '/reports/overview': 'Reports',
  '/reports/smart-report': 'Smart report',
  '/export-data': 'Export data',
  '/compliance/statements': 'Statements',
  '/compliance/vat': 'VAT',
  '/compliance/evat': 'e-VAT',
  '/merchandise': 'Merchandise',
};

const MORE_ICONS = {
  '/sales': ShoppingCart,
  '/orders': ChefHat,
  '/quotes': FileText,
  '/leads': UserPlus,
  '/tasks': ListChecks,
  '/deliveries': Truck,
  '/reviews': Star,
  '/messages': MessageSquare,
  '/marketing': Megaphone,
  '/vendors': Contact,
  '/payroll': Wallet,
  '/accounting': Calculator,
  '/employees': Users,
  '/shops': MapPin,
  '/studio-locations': Building,
  '/pharmacies': MapPin,
  '/prescriptions': ClipboardList,
  '/drugs': Pill,
  '/pricing': Tags,
  '/merchandise': PackageCheck,
  '/materials': Boxes,
  '/equipment': Wrench,
  '/store': Store,
  '/store/listings': LayoutList,
  '/store/services': LayoutList,
  '/store/orders': ClipboardList,
  '/store/settings': Settings,
  '/online-store': Globe,
  '/online-store/orders': ClipboardList,
  '/reports/overview': BarChart3,
  '/reports/smart-report': FileBarChart,
  '/export-data': Download,
  '/compliance/statements': FileCheck2,
  '/compliance/vat': ShieldCheck,
  '/compliance/evat': ShieldCheck,
  '/dealers': Building2,
  '/rentals': CalendarClock,
};

/** Native section order (mobile/utils/moreMenuItems.ts), then web-only pages. */
const MAIN_PATHS = ['/customers', '/invoices'];
const STORE_PATHS = [
  '/products',
  '/sales',
  '/orders',
  '/online-store',
  '/online-store/orders',
  '/store',
  '/store/listings',
  '/store/services',
  '/store/orders',
  '/store/settings',
  '/dealers',
  '/expenses',
];
const WORK_PATHS = ['/jobs', '/quotes', '/leads', '/tasks', '/deliveries', '/rentals'];
const isReportsPath = (path) =>
  path.startsWith('/reports') || path.startsWith('/compliance') || path === '/export-data';
const ACCOUNT_PATHS = ['/profile', '/settings'];

/**
 * @param {object} args
 * @param {Array} args.menuItems - Menu as shown to the member
 * @param {Array} args.tabItems - Result of buildTabBarItems
 * @param {boolean} args.isDriver
 * @param {{ isRestricted: boolean }} args.simpleMode
 * @returns {Array<{ id: string, title?: string, items: Array<{ id: string, label: string, icon: unknown, to: string, tone?: string }> }>}
 */
export function buildMoreMenuSections({ menuItems = [], tabItems = [], isDriver, simpleMode }) {
  if (isDriver) return [];

  const tabPaths = new Set(tabItems.filter((tab) => tab.to && !tab.center).map((tab) => navBasePath(tab.to)));
  const leaves = flattenNavItems(menuItems);
  const toEntry = (item) => ({
    id: item.key,
    label: MORE_LABELS[item.key] || item.label,
    icon: MORE_ICONS[item.key] || item.icon,
    to: item.key,
    tone: item.tone,
  });

  if (simpleMode?.isRestricted) {
    // Simple Mode: big coloured tiles for what is not on the tab bar.
    const items = leaves.filter((item) => !tabPaths.has(item.key)).map(toEntry);
    return items.length ? [{ id: 'simple', items }] : [];
  }

  const byPath = new Map(leaves.map((item) => [item.key, item]));
  const take = (path) => {
    const item = byPath.get(path);
    if (!item) return null;
    byPath.delete(path);
    return tabPaths.has(path) ? null : toEntry(item);
  };

  const main = [{ id: 'home', label: 'Home', icon: Home, to: '/dashboard' }];
  byPath.delete('/dashboard');
  MAIN_PATHS.forEach((path) => {
    const entry = take(path);
    if (entry) main.push(entry);
  });
  const store = STORE_PATHS.map(take).filter(Boolean);
  const work = WORK_PATHS.map(take).filter(Boolean);

  const account = [{ id: '/profile', label: 'Profile', icon: UserCircle, to: '/profile' }];
  byPath.delete('/profile');
  const settingsEntry = take('/settings');
  if (settingsEntry) account.push({ ...settingsEntry, icon: Settings });

  // Everything left keeps its menu order: reports, then web-only business tools.
  const rest = [...byPath.values()].filter((item) => !tabPaths.has(item.key) && !ACCOUNT_PATHS.includes(item.key));
  const reports = rest.filter((item) => isReportsPath(item.key)).map(toEntry);
  const tools = rest.filter((item) => !isReportsPath(item.key)).map(toEntry);

  return [
    { id: 'main', items: main },
    { id: 'store', title: 'Store', items: store },
    { id: 'work', title: 'Work', items: work },
    { id: 'reports', title: 'Reports', items: reports },
    { id: 'tools', title: 'Business tools', items: tools },
    { id: 'account', title: 'Account', items: account },
  ].filter((section) => section.items.length > 0);
}
