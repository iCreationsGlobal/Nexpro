import { resolveBusinessType } from '@/constants';
import { getTabRouteSegment } from '@/utils/tabRouteSearch';

/**
 * Primary tab routes where the header shows workspace scope (company / shop / studio),
 * not the screen title.
 */
export const WORKSPACE_SCOPE_TAB_SEGMENTS = new Set(['index', 'customers', 'invoices']);

/** Human-readable titles for tab screens that use a page title in the header. */
export const TAB_PAGE_TITLES: Record<string, string> = {
  scan: 'Scan',
  more: 'More',
  products: 'Products',
  sales: 'Sales',
  expenses: 'Expenses',
  quotes: 'Quotes',
  leads: 'Leads',
  tasks: 'Tasks',
  deliveries: 'Deliveries',
  jobs: 'Jobs',
  orders: 'Orders',
  chat: 'Ayebia',
  cart: 'Cart',
  store: 'Online Store',
  'online-orders': 'Online Store',
  'store-services': 'Studio Services',
};

/**
 * True when the current route is a primary tab that should show workspace scope in the header.
 */
export function shouldShowWorkspaceScopeInHeader(pathname: string | null | undefined): boolean {
  const segment = getTabRouteSegment(pathname);
  return WORKSPACE_SCOPE_TAB_SEGMENTS.has(segment);
}

/**
 * Page title for tab routes that are not workspace-scope routes.
 */
export function resolveHeaderPageTitle(
  pathname: string | null | undefined,
  businessType?: string
): string {
  const segment = getTabRouteSegment(pathname);
  if (!segment) return 'ABS';

  if (segment === 'scan') {
    return resolveBusinessType(businessType) === 'studio' ? 'Add Job' : 'Scan';
  }

  return TAB_PAGE_TITLES[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}
