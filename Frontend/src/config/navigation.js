import {
  LayoutDashboard,
  FileText,
  FilePlus,
  Users,
  BarChart3,
  ShieldCheck,
  Settings,
  UserCog,
  Package,
  ShoppingCart,
  Store,
  Receipt,
  Banknote,
  LayoutList,
  PackagePlus,
  PackageCheck,
  UserPlus,
  UserCircle,
  Pill,
  ChefHat,
  Truck,
  Building2,
  Globe,
  CalendarClock,
  Eye,
} from 'lucide-react';
import { isQuotesEnabledForTenant, STUDIO_LIKE_TYPES } from '@/constants';
import { isSabitoStoreEnabled } from '@/utils/sabitoStoreFeature';

/**
 * Workspace navigation: the menu (desktop sidebar, More sheet) and quick actions, decided once
 * by business type, role and plan features. Consumers: Sidebar, AppTabBar, MoreMenuSheet.
 */

/** Hint text for menu items – simple language for market women */
export const MENU_HINTS = {
  '/dashboard': 'See your sales and money today',
  '/sales': 'List of all your sales',
  '/orders': 'Orders from customers',
  '/products': 'Things you sell',
  '/jobs': 'Orders from customers',
  '/deliveries': 'Send finished jobs and sales out to customers',
  '/customers': 'People who buy from you',
  '/dealers': 'Wholesale dealer accounts and balances',
  '/reviews': 'Ratings and comments from your customers',
  '/marketing': 'Email or text many customers at once',
  '/messages': 'Compose SMS, templates, groups, and ABS Credits',
  '/invoices': 'Bills you send to customers',
  '/expenses': 'Money you spent on business',
  '/reports': 'Reports and data analysis',
  '/ask-ai': 'Ask Ayebia about your business data',
  '/data-analysis': 'Reports and data analysis',
  '/export-data': 'Download data as CSV or Excel',
  '/settings': 'Change app settings',
  '/users': 'Manage people who use the app',
  advanced: 'More options',
  '/leads': 'People who might buy',
  '/vendors': 'People who supply you',
  '/payroll': 'Staff salaries',
  '/accounting': 'Money in and out',
  '/materials': 'Materials you use',
  '/equipment': 'Laptops, furniture, vehicles',
  '/rentals': 'Items you hire out to customers',
  '/watch': 'Physical activity compared with recorded sales',
  '/merchandise': 'Stock value of goods you sell',
  assets: 'Stock value of goods for sale, materials, and equipment',
  '/employees': 'Your staff',
  '/shops': 'Your shops and locations',
  '/studio-locations': 'Studio branches in your workspace',
  '/foot-traffic': 'Customers visiting',
  '/pharmacies': 'Your pharmacies',
  '/prescriptions': 'Doctor prescriptions',
  '/drugs': 'Medicines you sell',
  '/quotes': 'Price quotes for customers',
  '/pricing': 'Set your prices',
  '/tasks': 'Track follow-ups, meetings, and team tasks',
  '/automations': 'Set rules that run business actions automatically',
  '/store': 'Manage your Sabito marketplace storefront',
  '/store/listings': 'Products published on Sabito Store',
  '/store/services': 'Services published on your Sabito studio storefront',
  '/store/orders': 'Orders from your Sabito Store (Trade Assurance)',
  '/store/settings': 'Sabito Store setup and contact details',
  '/online-store': 'Your own storefront on your domain (direct pay)',
  '/online-store/orders': 'Orders from your Online Store (direct pay)',
};

/**
 * Drop items the role cannot see; drop parent groups with no visible children.
 */
export const filterNavItems = (items, { isAdmin, isManager }) =>
  items
    .filter((item) => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.managerOnly && !isManager) return false;
      return true;
    })
    .map((item) => {
      if (!item.children?.length) return item;
      const children = filterNavItems(item.children, { isAdmin, isManager });
      return { ...item, children };
    })
    .filter((item) => !item.children || item.children.length > 0);

export const getMenuItems = (
  businessType,
  isAdmin,
  isManager,
  isDriver,
  shopType,
  hasFeature = () => true,
  isPlatformAdmin = false
) => {
  if (isDriver) {
    return [
      { key: '/deliveries', icon: Truck, label: 'Deliveries', tooltip: MENU_HINTS['/deliveries'] },
      { key: '/profile', icon: UserCircle, label: 'Profile', tooltip: MENU_HINTS['/profile'] },
    ];
  }
  // Standalone (most important): Dashboard, Sales, Products, Jobs (printing_press), Customers, Invoices, Expenses
  const baseItems = [
    { key: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', tooltip: MENU_HINTS['/dashboard'] },
  ];

  if ((businessType === 'shop' || businessType === 'rental') && hasFeature('paymentsExpenses')) {
    if (businessType === 'rental' && hasFeature('rentals')) {
      baseItems.push({ key: '/rentals', icon: CalendarClock, label: 'Rentals', tooltip: MENU_HINTS['/rentals'] });
    }
    if (businessType !== 'rental') {
      baseItems.push({ key: '/sales', icon: ShoppingCart, label: 'Sales', tooltip: MENU_HINTS['/sales'] });
    }
    if (shopType === 'restaurant' && hasFeature('orders')) {
      baseItems.push({ key: '/orders', icon: ChefHat, label: 'Orders', tooltip: MENU_HINTS['/orders'] });
    }
    if (hasFeature('products')) {
      baseItems.push({ key: '/products', icon: Package, label: 'Products', tooltip: MENU_HINTS['/products'] });
    }
  }
  if (hasFeature('watch')) {
    baseItems.push({
      key: '/watch',
      icon: Eye,
      label: 'Watch',
      tooltip: MENU_HINTS['/watch'],
    });
  }
  if (!isPlatformAdmin && STUDIO_LIKE_TYPES.includes(businessType) && hasFeature('jobAutomation')) {
    baseItems.push({ key: '/jobs', icon: FileText, label: 'Jobs', tooltip: MENU_HINTS['/jobs'] });
  }
  if (!isPlatformAdmin && hasFeature('crm')) {
    baseItems.push({ key: '/customers', icon: Users, label: 'Customers', tooltip: MENU_HINTS['/customers'] });
  }
  if (
    !isPlatformAdmin &&
    !STUDIO_LIKE_TYPES.includes(businessType) &&
    hasFeature('dealersAccount')
  ) {
    baseItems.push({ key: '/dealers', icon: Building2, label: 'Dealers', tooltip: MENU_HINTS['/dealers'] });
  }
  if (hasFeature('invoices') || hasFeature('expenses')) {
    baseItems.push(
      ...(hasFeature('invoices') ? [{ key: '/invoices', icon: Receipt, label: 'Invoices', tooltip: MENU_HINTS['/invoices'] }] : []),
      ...(hasFeature('expenses') ? [{ key: '/expenses', icon: Banknote, label: 'Expenses', tooltip: MENU_HINTS['/expenses'] }] : []),
    );
  }

  if (!isPlatformAdmin) {
    const isStudioStore = STUDIO_LIKE_TYPES.includes(businessType);
    if (isSabitoStoreEnabled()) {
      // "Sabito Store" = the Sabito marketplace-backed storefront channel (trade assurance,
      // marketplace discovery). Kept separate from "Online Store" (custom domain, direct-pay) below.
      baseItems.push({
        key: 'store',
        icon: Store,
        label: 'Sabito Store',
        tooltip: MENU_HINTS['/store'],
        children: [
          { key: '/store', label: 'Dashboard', tooltip: MENU_HINTS['/store'] },
          ...(isStudioStore
            ? [{ key: '/store/services', label: 'Studio services', tooltip: MENU_HINTS['/store/services'] }]
            : [{ key: '/store/listings', label: 'Store listings', tooltip: MENU_HINTS['/store/listings'] }]),
          ...(!isStudioStore ? [{ key: '/store/orders', label: 'Online orders', tooltip: MENU_HINTS['/store/orders'] }] : []),
          { key: '/store/settings', label: isStudioStore ? 'Studio settings' : 'Store settings', tooltip: MENU_HINTS['/store/settings'], managerOnly: true },
        ],
      });
    }

    // "Online Store" = customer-owned custom domain storefront (not Sabito, not trade assurance).
    baseItems.push({
      key: 'online-store',
      icon: Globe,
      label: 'Online Store',
      tooltip: MENU_HINTS['/online-store'],
      children: [
        { key: '/online-store', label: 'Storefront', tooltip: MENU_HINTS['/online-store'] },
        ...(!isStudioStore
          ? [{ key: '/online-store/orders', label: 'Orders', tooltip: MENU_HINTS['/online-store/orders'] }]
          : []),
      ],
    });
  }

  // Rentals: items hired out to customers (separate from internal Company Assets)
  // Note: rentals are now added above for rental businesses so they appear before Sales
  if (hasFeature('rentals') && businessType !== 'rental') {
    baseItems.push({
      key: '/rentals',
      icon: CalendarClock,
      label: 'Rentals',
      tooltip: MENU_HINTS['/rentals'],
    });
  }

  // Assets: stock value of goods for sale (Merchandise), plus materials and equipment the business uses
  if (hasFeature('materials')) {
    const canSeeMerchandise =
      (businessType === 'shop' && hasFeature('products')) ||
      (businessType === 'pharmacy' && hasFeature('pharmacyOps'));
    baseItems.push({
      key: 'company-assets',
      icon: PackageCheck,
      label: 'Assets',
      tooltip: MENU_HINTS.assets,
      children: [
        ...(canSeeMerchandise
          ? [{ key: '/merchandise', label: 'Merchandise', tooltip: MENU_HINTS['/merchandise'], managerOnly: true }]
          : []),
        { key: '/materials', label: 'Materials', tooltip: MENU_HINTS['/materials'] },
        { key: '/equipment', label: 'Equipment', tooltip: MENU_HINTS['/equipment'] },
      ],
    });
  }

  // Advanced group: everything else (Leads, Vendors, Shops/Pharmacies, Payroll, Accounting, Quotes, Employees, Workspace, etc.)
  const advancedChildren = [
    ...(businessType === 'rental' && hasFeature('paymentsExpenses')
      ? [{ key: '/sales', label: 'Sales (optional)', tooltip: 'Sell items you also offer for hire (optional for rental businesses)' }]
      : []),
    ...(!isPlatformAdmin && hasFeature('crm') ? [{ key: '/reviews', label: 'Reviews', tooltip: MENU_HINTS['/reviews'] }] : []),
    ...(hasFeature('deliveries') ? [{ key: '/deliveries', label: 'Deliveries', tooltip: MENU_HINTS['/deliveries'] }] : []),
    ...(!isPlatformAdmin && hasFeature('tasks') ? [{ key: '/tasks', label: 'Tasks', tooltip: MENU_HINTS['/tasks'] }] : []),
    ...(hasFeature('automations') ? [{ key: '/automations', label: 'Automations', tooltip: MENU_HINTS['/automations'], managerOnly: true }] : []),
    ...(!isPlatformAdmin && hasFeature('leadPipeline') ? [{ key: '/leads', label: 'Leads', tooltip: MENU_HINTS['/leads'] }] : []),
    ...(hasFeature('marketing') ? [{ key: '/messages', label: 'Messages', tooltip: MENU_HINTS['/messages'], managerOnly: true }] : []),
    ...(hasFeature('marketing') ? [{ key: '/marketing', label: 'Marketing', tooltip: MENU_HINTS['/marketing'], managerOnly: true }] : []),
    ...(hasFeature('vendors') ? [{ key: '/vendors', label: 'Vendors', tooltip: MENU_HINTS['/vendors'] }] : []),
    ...(hasFeature('payroll') ? [{ key: '/payroll', label: 'Payroll', tooltip: MENU_HINTS['/payroll'], managerOnly: true }] : []),
    ...(hasFeature('accounting') ? [{ key: '/accounting', label: 'Accounting', tooltip: MENU_HINTS['/accounting'], managerOnly: true }] : []),
    ...(hasFeature('quoteAutomation') && isQuotesEnabledForTenant(businessType, shopType) ? [{ key: '/quotes', label: 'Quotes', tooltip: MENU_HINTS['/quotes'] }] : []),
    ...(hasFeature('payroll') ? [{ key: '/employees', label: 'Employees', tooltip: MENU_HINTS['/employees'], managerOnly: true }] : []),
  ];
  if ((businessType === 'shop' || businessType === 'rental') && hasFeature('shopsModule')) {
    advancedChildren.splice(2, 0, {
      key: '/shops',
      label: businessType === 'rental' ? 'Locations' : 'Shops',
      tooltip: MENU_HINTS['/shops'],
      managerOnly: true,
    });
  }
  if (businessType === 'pharmacy') {
    if (hasFeature('pharmacyOps')) {
      advancedChildren.splice(2, 0, { key: '/pharmacies', label: 'Pharmacies', tooltip: MENU_HINTS['/pharmacies'] });
      advancedChildren.push({ key: '/prescriptions', label: 'Prescriptions', tooltip: MENU_HINTS['/prescriptions'] });
      advancedChildren.push({ key: '/drugs', label: 'Drugs', tooltip: MENU_HINTS['/drugs'] });
    }
    // Foot Traffic temporarily hidden
  }
  // Pricing templates available for all studio-like types (printing press, mechanic, barber, salon, studio)
  if (hasFeature('pricingTemplates') && STUDIO_LIKE_TYPES.includes(businessType)) {
    advancedChildren.push({ key: '/pricing', label: 'Pricing', tooltip: MENU_HINTS['/pricing'] });
  }
  if (STUDIO_LIKE_TYPES.includes(businessType) && hasFeature('studioLocationsModule')) {
    advancedChildren.splice(2, 0, {
      key: '/studio-locations',
      label: 'Studios',
      tooltip: MENU_HINTS['/studio-locations'],
      managerOnly: true,
    });
  }

  if (advancedChildren.length > 0) baseItems.push({
    key: 'advanced',
    icon: LayoutList,
    label: 'Advanced',
    tooltip: MENU_HINTS.advanced,
    children: advancedChildren,
  });

  // Data & Reports section with children (analytics only — Compliance is a separate parent)
  const reportsChildren = [
    ...(hasFeature('reports')
      ? [
          { key: '/reports/overview', label: 'Overview', tooltip: MENU_HINTS['/reports'] },
          { key: '/reports/smart-report', label: 'Smart report', tooltip: 'Generate and view smart reports' },
        ]
      : []),
    ...(hasFeature('advancedReporting')
      ? [{ key: '/export-data', label: 'Export data', tooltip: MENU_HINTS['/export-data'] }]
      : []),
  ];

  if (reportsChildren.length > 0) {
    baseItems.push({
      key: 'reports',
      icon: BarChart3,
      label: 'Data & Reports',
      tooltip: MENU_HINTS['/reports'],
      managerOnly: true,
      children: reportsChildren
    });
  }

  const complianceChildren = hasFeature('graEvat')
    ? [
        { key: '/compliance/statements', label: 'Statements', tooltip: 'Financial statements for authorities and lenders' },
        { key: '/compliance/vat', label: 'VAT', tooltip: 'Period VAT and filing pack' },
        { key: '/compliance/evat', label: 'e-VAT', tooltip: 'GRA certified invoicing setup' },
      ]
    : [];

  if (complianceChildren.length > 0) {
    baseItems.push({
      key: 'compliance',
      icon: ShieldCheck,
      label: 'Compliance',
      tooltip: 'Tax, e-VAT, and statutory reports',
      managerOnly: true,
      children: complianceChildren,
    });
  }
  if (hasFeature('roleManagement')) {
    baseItems.push({ key: '/users', icon: UserCog, label: 'Users', managerOnly: true, tooltip: MENU_HINTS['/users'] });
  }
  baseItems.push({ key: '/settings', icon: Settings, label: 'Settings', tooltip: MENU_HINTS['/settings'] });

  return filterNavItems(baseItems, { isAdmin, isManager });
};

/**
 * Top 3 quick actions per business type and shop type (Point of Sale, Restock, New quote, etc.)
 * Quotes quick action only when isQuotesEnabledForTenant(businessType, shopType).
 * @param {string|null} businessType - 'shop' | 'pharmacy' | 'printing_press' | 'rental'
 * @param {string|null} shopType - Tenant metadata.shopType (for shop only)
 * @returns {Array<{ label: string, path: string, icon: React.Component }>}
 */
export const getQuickActions = (businessType, shopType) => {
  if (!businessType) return [];
  const quotesEnabled = isQuotesEnabledForTenant(businessType, shopType);
  if (businessType === 'shop') {
    return [
      { label: 'Point of Sale', path: '/sales?openPOS=1', icon: ShoppingCart, tooltip: 'Sell products and take payment' },
      ...(quotesEnabled ? [{ label: 'New quote', path: '/quotes?add=1', icon: FilePlus, tooltip: 'Create a quote for a customer' }] : [{ label: 'Restock', path: '/materials', icon: PackagePlus, tooltip: 'Record new stock received' }]),
      { label: 'Add customer', path: '/customers?add=1', icon: UserPlus, tooltip: 'Add a new customer' },
    ];
  }
  if (businessType === 'pharmacy') {
    return [
      { label: 'Point of Sale', path: '/sales?openPOS=1', icon: ShoppingCart, tooltip: 'Sell drugs, scan barcodes' },
      ...(quotesEnabled ? [{ label: 'New quote', path: '/quotes?add=1', icon: FilePlus, tooltip: 'Create a quote for a customer' }] : [{ label: 'Restock', path: '/materials', icon: PackagePlus, tooltip: 'Record new stock received' }]),
      { label: 'New prescription', path: '/prescriptions', icon: Pill, tooltip: 'Create a new prescription' },
    ];
  }
  if (businessType === 'printing_press') {
    return [
      { label: 'New job', path: '/jobs?add=1', icon: FileText, tooltip: 'Create a new job or order' },
      { label: 'New quote', path: '/quotes?add=1', icon: FilePlus, tooltip: 'Create a quote for a customer' },
      { label: 'Add customer', path: '/customers?add=1', icon: UserPlus, tooltip: 'Add a new customer' },
    ];
  }
  if (businessType === 'rental') {
    return [
      { label: 'New Rental', path: '/rentals?add=1', icon: CalendarClock, tooltip: 'Create a new rental booking' },
      { label: 'Add customer', path: '/customers?add=1', icon: UserPlus, tooltip: 'Add a new customer' },
      { label: 'View Rentals', path: '/rentals', icon: Package, tooltip: 'View all rentals' },
    ];
  }
  return [];
};

/**
 * Route → lazy page import, used to prefetch a page when its menu item is hovered or shown.
 * @returns {Record<string, () => Promise<unknown>>}
 */
export const getRoutePrefetchMap = () => ({
  '/dashboard': () => import('../pages/Dashboard'),
  '/ask-ai': () => import('../pages/AskAI'),
  '/customers': () => import('../pages/Customers'),
  '/reviews': () => import('../pages/CustomerFeedback'),
  '/marketing': () => import('../pages/Marketing'),
  '/messages': () => import('../pages/Messages'),
  '/vendors': () => import('../pages/Vendors'),
  '/jobs': () => import('../pages/Jobs'),
  '/sales': () => import('../pages/Sales'),
  '/orders': () => import('../pages/Orders'),
  '/invoices': () => import('../pages/Invoices'),
  '/quotes': () => import('../pages/Quotes'),
  '/expenses': () => import('../pages/Expenses'),
  '/pricing': () => import('../pages/Pricing'),
  '/reports/overview': () => import('../pages/Reports'),
  '/export-data': () => import('../pages/ExportData'),
  '/compliance/statements': () => import('../pages/Reports'),
  '/compliance/vat': () => import('../pages/compliance/ComplianceVat'),
  '/compliance/evat': () => import('../pages/compliance/ComplianceEvat'),
  '/materials': () => import('../pages/Materials'),
  '/equipment': () => import('../pages/Equipment'),
  '/rentals': () => import('../pages/Rentals'),
  '/watch': () => import('../pages/Watch'),
  '/merchandise': () => import('../pages/Merchandise'),
  '/leads': () => import('../pages/Leads'),
  '/users': () => import('../pages/Users'),
  '/settings': () => import('../pages/Settings'),
  '/employees': () => import('../pages/Employees'),
  '/payroll': () => import('../pages/Payroll'),
  '/accounting': () => import('../pages/Accounting'),
  '/shops': () => import('../pages/Shops'),
  '/studio-locations': () => import('../pages/StudioLocations'),
  '/pharmacies': () => import('../pages/Pharmacies'),
  '/products': () => import('../pages/Products'),
  '/drugs': () => import('../pages/Drugs'),
  '/prescriptions': () => import('../pages/Prescriptions'),
  '/tasks': () => import('../pages/Tasks'),
  '/automations': () => import('../pages/Automations'),
  ...(isSabitoStoreEnabled()
    ? {
        '/store': () => import('../pages/StoreDashboard'),
        '/store/listings': () => import('../pages/StoreListings'),
        '/store/services': () => import('../pages/StoreServices'),
        '/store/orders': () => import('../pages/OnlineOrders'),
        '/store/settings': () => import('../pages/StoreSettings'),
      }
    : {}),
  '/online-store': () => import('../pages/OnlineStore'),
  '/online-store/orders': () => import('../pages/OnlineOrders'),
});

/**
 * Leaf menu entries (groups expanded), in menu order.
 * @param {Array<{ key: string, children?: Array }>} items
 * @returns {Array<{ key: string, label: string, icon?: unknown, parentKey?: string, parentLabel?: string }>}
 */
export const flattenNavItems = (items = []) =>
  items.flatMap((item) =>
    item.children?.length
      ? item.children.map((child) => ({
          ...child,
          icon: child.icon || item.icon,
          parentKey: item.key,
          parentLabel: item.label,
        }))
      : [item]
  );
