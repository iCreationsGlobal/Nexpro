import {
  BarChart3,
  Banknote,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react';

/**
 * What Simple Mode shows per business type. Only listed business types support Simple Mode;
 * add pharmacy/studio here when they get their own simplified experience.
 *
 * - nav: sidebar items, in order. `key` matches the full menu's route key; label/icon override
 *   entries that live inside a group in the full menu (e.g. Reports → Overview).
 * - allowedPaths: route prefixes reachable while advanced features are hidden. Anything else
 *   redirects to the dashboard.
 */
/**
 * Light background per menu item so each one is easy to recognise by colour.
 * Full class strings (not built dynamically) so Tailwind keeps them in the build.
 */
const NAV_TONES = Object.freeze({
  sky: 'bg-sky-50 text-sky-900 hover:bg-sky-100 [&_svg]:text-sky-700',
  emerald: 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 [&_svg]:text-emerald-700',
  amber: 'bg-amber-50 text-amber-900 hover:bg-amber-100 [&_svg]:text-amber-700',
  violet: 'bg-violet-50 text-violet-900 hover:bg-violet-100 [&_svg]:text-violet-700',
  orange: 'bg-orange-50 text-orange-900 hover:bg-orange-100 [&_svg]:text-orange-700',
  teal: 'bg-teal-50 text-teal-900 hover:bg-teal-100 [&_svg]:text-teal-700',
  slate: 'bg-slate-100 text-slate-900 hover:bg-slate-200 [&_svg]:text-slate-700',
});

const SHOP_SIMPLE_MODE = Object.freeze({
  nav: [
    { key: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, tone: NAV_TONES.sky },
    { key: '/sales', label: 'Sales', icon: ShoppingCart, tone: NAV_TONES.emerald },
    { key: '/expenses', label: 'Expenses', icon: Banknote, tone: NAV_TONES.amber },
    { key: '/customers', label: 'Customers', icon: Users, tone: NAV_TONES.violet },
    { key: '/products', label: 'Products', icon: Package, tone: NAV_TONES.orange },
    { key: '/reports/overview', label: 'Reports', icon: BarChart3, tone: NAV_TONES.teal },
    { key: '/settings', label: 'Settings', icon: Settings, tone: NAV_TONES.slate },
  ],
  allowedPaths: [
    '/dashboard',
    '/sales',
    '/expenses',
    '/customers',
    '/products',
    '/reports/overview',
    '/settings',
    '/profile',
  ],
});

const SIMPLE_MODE_BY_BUSINESS_TYPE = Object.freeze({
  shop: SHOP_SIMPLE_MODE,
});

/**
 * @param {string|null|undefined} businessType
 * @returns {typeof SHOP_SIMPLE_MODE|null}
 */
export function getSimpleModeConfig(businessType) {
  return SIMPLE_MODE_BY_BUSINESS_TYPE[businessType] || null;
}

/** Whether `pathname` is reachable in Simple Mode (prefix match on whole path segments). */
export function isSimpleModePathAllowed(config, pathname = '') {
  if (!config) return true;
  return config.allowedPaths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Reduce the full sidebar to the Simple Mode menu. Items are looked up anywhere in the full
 * menu (including inside groups) so features the plan doesn't include stay hidden.
 */
export function buildSimpleModeNav(config, fullMenuItems = []) {
  if (!config) return fullMenuItems;
  const available = new Set();
  const collect = (items) => items.forEach((item) => {
    if (item.children?.length) collect(item.children);
    else available.add(item.key);
  });
  collect(fullMenuItems);
  return config.nav
    .filter((entry) => available.has(entry.key))
    .map((entry) => ({ key: entry.key, label: entry.label, icon: entry.icon, tooltip: entry.label, tone: entry.tone }));
}
