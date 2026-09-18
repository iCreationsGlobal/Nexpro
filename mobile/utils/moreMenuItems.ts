import type { AppIconName } from '@/components/AppIcon';
import { resolveBusinessType, SHOP_TYPES, isQuotesEnabledForTenant } from '@/constants';

export type MoreMenuItem = {
  id: string;
  label: string;
  icon: AppIconName;
  route: string;
};

export type MoreMenuSection = {
  id: string;
  title?: string;
  items: MoreMenuItem[];
};

type BuildMoreMenuArgs = {
  isDriver: boolean;
  businessType?: string | null;
  shopType?: string | null;
  hasFeature: (feature: string) => boolean;
  hasStoreSettings: boolean;
  isPlatformAdmin?: boolean;
  /** Ranked "what matters most to you" picks — see constants/focusAreas.ts */
  focusAreas?: string[];
};

/**
 * Build More menu sections for the bottom-sheet menu.
 */
export function buildMoreMenuSections({
  isDriver,
  businessType,
  shopType,
  hasFeature,
  hasStoreSettings,
  isPlatformAdmin,
  focusAreas,
}: BuildMoreMenuArgs): MoreMenuSection[] {
  if (isDriver) {
    return [
      {
        id: 'driver',
        items: [
          { id: 'deliveries', label: 'My Deliveries', icon: 'truck', route: '/(tabs)/deliveries' },
          { id: 'account', label: 'Account', icon: 'user', route: '/account' },
        ],
      },
    ];
  }

  const resolvedType = resolveBusinessType(businessType);
  const isShop = resolvedType === 'shop';
  const isPharmacy = resolvedType === 'pharmacy';
  const isStudio = resolvedType === 'studio';
  const isRestaurant = shopType === SHOP_TYPES.RESTAURANT;
  const quotesOk =
    hasFeature('quoteAutomation') && isQuotesEnabledForTenant(businessType, shopType);

  const primaryFocusId = focusAreas?.[0];
  const wantsOnlineOrdersTab = focusAreas?.includes('online_store') === true;

  const main: MoreMenuItem[] = [
    { id: 'home', label: 'Home', icon: 'home', route: '/(tabs)/' },
  ];
  if (hasFeature('crm')) {
    // Customers live on the tab bar by default. Once a focus-area pick displaces that tab
    // slot, Customers would otherwise be unreachable — surface it here instead.
    if (primaryFocusId) {
      main.push({ id: 'customers', label: 'Customers', icon: 'users', route: '/(tabs)/customers' });
    }
  }
  if ((isShop || isPharmacy || isStudio) && hasFeature('invoices') && wantsOnlineOrdersTab) {
    // The "Sell online" focus swaps the Invoices tab slot for Orders — keep Invoices reachable here.
    main.push({ id: 'invoices', label: 'Invoices', icon: 'file-text', route: '/(tabs)/invoices' });
  }

  const store: MoreMenuItem[] = [];
  if ((isShop || isPharmacy) && hasFeature('products')) {
    store.push({ id: 'products', label: 'Products', icon: 'package', route: '/(tabs)/products' });
  }
  if ((isShop || isPharmacy) && hasFeature('paymentsExpenses')) {
    store.push({ id: 'sales', label: 'Sales', icon: 'shopping-cart', route: '/(tabs)/sales' });
    store.push({ id: 'store', label: 'Online store', icon: 'store', route: '/(tabs)/store' });
  }
  if ((isShop || isPharmacy) && hasFeature('dealersAccount')) {
    store.push({ id: 'dealers', label: 'Dealers', icon: 'briefcase', route: '/(tabs)/dealers' });
  }
  if (isStudio && hasFeature('paymentsExpenses')) {
    store.push({ id: 'store', label: 'Studio store', icon: 'store', route: '/(tabs)/store' });
    if (hasStoreSettings) {
      store.push({
        id: 'store-services',
        label: 'Studio services',
        icon: 'cut-outline',
        route: '/(tabs)/store-services',
      });
    }
  }
  if (isRestaurant && hasFeature('orders')) {
    store.push({ id: 'orders', label: 'Orders', icon: 'cutlery', route: '/(tabs)/orders' });
  }
  if (hasFeature('expenses')) {
    store.push({ id: 'expenses', label: 'Expenses', icon: 'minus-circle', route: '/(tabs)/expenses' });
  }

  const work: MoreMenuItem[] = [];
  if (isStudio && hasFeature('jobAutomation')) {
    work.push({ id: 'jobs', label: 'Jobs', icon: 'briefcase', route: '/(tabs)/jobs' });
  }
  if ((isShop || isPharmacy || isStudio) && quotesOk) {
    work.push({ id: 'quotes', label: 'Quotes', icon: 'file-text-o', route: '/(tabs)/quotes' });
  }
  if (hasFeature('leadPipeline')) {
    work.push({ id: 'leads', label: 'Leads', icon: 'user-plus', route: '/(tabs)/leads' });
  }
  if (hasFeature('tasks') && isPlatformAdmin !== true) {
    work.push({ id: 'tasks', label: 'Tasks', icon: 'list', route: '/(tabs)/tasks' });
  }
  if (hasFeature('deliveries')) {
    work.push({ id: 'deliveries', label: 'Deliveries', icon: 'truck', route: '/(tabs)/deliveries' });
  }
  if (businessType === 'rental' && hasFeature('rentals')) {
    work.push({ id: 'rentals', label: 'Rentals', icon: 'calendar', route: '/(tabs)/rentals' });
  }

  const account: MoreMenuItem[] = [
    { id: 'account', label: 'Account', icon: 'user', route: '/account' },
  ];

  const sections: MoreMenuSection[] = [{ id: 'main', items: main }];
  if (store.length) sections.push({ id: 'store', title: 'STORE', items: store });
  if (work.length) sections.push({ id: 'work', title: 'WORK', items: work });
  sections.push({ id: 'account', title: 'ACCOUNT', items: account });
  return sections;
}

/** Whether a menu route matches the current pathname (for selected state). */
export function isMoreMenuRouteActive(pathname: string, route: string): boolean {
  const path = (pathname || '').replace(/\/$/, '') || '/';
  if (route === '/account') {
    return (
      path === '/account'
      || path === '/profile'
      || path === '/settings'
      || path.endsWith('/account')
      || path.endsWith('/profile')
      || path.endsWith('/settings')
    );
  }
  if (route === '/(tabs)/' || route === '/(tabs)' || route === '/') {
    return (
      path === '/'
      || path === '/index'
      || path.endsWith('/(tabs)')
      || path.endsWith('/(tabs)/index')
      || path === ''
    );
  }
  const leaf = route.replace('/(tabs)/', '').replace('/(tabs)', '').replace(/^\//, '');
  if (!leaf) return false;
  return (
    path === `/${leaf}`
    || path.endsWith(`/${leaf}`)
    || path.includes(`/${leaf}/`)
  );
}
