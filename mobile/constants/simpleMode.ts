import type { AppIconName } from '@/components/AppIcon';

/**
 * Simple Mode per business type — mirrors Frontend/src/config/simpleMode.js.
 * Only listed business types support Simple Mode (shops for now).
 */

/** Light background + strong icon colour per menu item, the same palette as the web sidebar. */
export type SimpleTone = { background: string; icon: string; text: string };

export const SIMPLE_TONES: Record<string, SimpleTone> = {
  sky: { background: '#f0f9ff', icon: '#0369a1', text: '#0c4a6e' },
  emerald: { background: '#ecfdf5', icon: '#047857', text: '#064e3b' },
  amber: { background: '#fffbeb', icon: '#b45309', text: '#78350f' },
  violet: { background: '#f5f3ff', icon: '#6d28d9', text: '#4c1d95' },
  orange: { background: '#fff7ed', icon: '#c2410c', text: '#7c2d12' },
  teal: { background: '#f0fdfa', icon: '#0f766e', text: '#134e4a' },
  slate: { background: '#f1f5f9', icon: '#334155', text: '#0f172a' },
};

export type SimpleNavItem = {
  id: string;
  label: string;
  icon: AppIconName;
  route: string;
  tone: SimpleTone;
  /** Hidden for staff (the server only allows admins/managers). */
  managerOnly?: boolean;
};

type SimpleModeConfig = {
  /** Bottom tabs (besides the centre Sell button and More). */
  tabs: SimpleNavItem[];
  /** Shown as big coloured tiles in the More sheet. */
  more: SimpleNavItem[];
  /** Route prefixes reachable while advanced features are hidden. */
  allowedPaths: string[];
};

const SHOP_SIMPLE_MODE: SimpleModeConfig = {
  tabs: [
    { id: 'dashboard', label: 'Home', icon: 'home', route: '/(tabs)', tone: SIMPLE_TONES.sky },
    { id: 'sales', label: 'Sales', icon: 'shopping-cart', route: '/(tabs)/sales', tone: SIMPLE_TONES.emerald },
    { id: 'expenses', label: 'Expenses', icon: 'money', route: '/(tabs)/expenses', tone: SIMPLE_TONES.amber },
  ],
  more: [
    { id: 'customers', label: 'Customers', icon: 'users', route: '/(tabs)/customers', tone: SIMPLE_TONES.violet },
    { id: 'products', label: 'Products', icon: 'package', route: '/(tabs)/products', tone: SIMPLE_TONES.orange },
    { id: 'reports', label: 'Reports', icon: 'line-chart', route: '/reports', tone: SIMPLE_TONES.teal, managerOnly: true },
    { id: 'settings', label: 'Settings', icon: 'cog', route: '/settings', tone: SIMPLE_TONES.slate },
  ],
  allowedPaths: [
    '/',
    '/index',
    '/sales',
    '/sale',
    '/expenses',
    '/expense',
    '/customers',
    '/customer',
    '/products',
    '/product',
    '/reports',
    '/settings',
    '/account',
    '/profile',
    '/more',
    '/simple',
    '/cart',
    '/scan',
  ],
};

const SIMPLE_MODE_BY_BUSINESS_TYPE: Record<string, SimpleModeConfig> = {
  shop: SHOP_SIMPLE_MODE,
};

export function getSimpleModeConfig(businessType: string | null | undefined): SimpleModeConfig | null {
  return (businessType && SIMPLE_MODE_BY_BUSINESS_TYPE[businessType]) || null;
}

/** Whether `pathname` is reachable in Simple Mode (prefix match on whole path segments). */
export function isSimpleModePathAllowed(config: SimpleModeConfig | null, pathname = ''): boolean {
  if (!config) return true;
  const path = pathname.replace(/^\/\(tabs\)/, '') || '/';
  return config.allowedPaths.some((prefix) => (
    prefix === '/' ? path === '/' : path === prefix || path.startsWith(`${prefix}/`)
  ));
}
