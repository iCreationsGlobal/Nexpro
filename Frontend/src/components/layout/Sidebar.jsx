import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  ChevronLeft,
  ChevronRight,
  Menu,
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
  Download,
  Workflow,
  Star,
  Truck,
  Building2,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/context/AuthContext';
import { useBranding } from '@/context/BrandingContext';
import { useStudioLocationOptional } from '@/context/StudioLocationContext';
import { useScopedWorkspaceName } from '@/hooks/useScopedWorkspaceName';
import SidebarScopeSwitcher from '@/components/SidebarScopeSwitcher';
import AppLogo from '@/components/AppLogo';
import { useHintMode } from '@/context/HintModeContext';
import { usePWAInstall } from '@/context/PWAInstallContext';
import { APP_NAME, isQuotesEnabledForTenant, STUDIO_LIKE_TYPES } from '@/constants';
import { filterHiddenNavItems, sanitizeHiddenSidebarKeys } from '@/constants/sidebarMenus';
import { isSabitoStoreEnabled } from '@/utils/sabitoStoreFeature';
import settingsService from '@/services/settingsService';
import { useSidebarPreferences } from '@/hooks/useSidebarPreferences';
import { API_BASE_URL } from '@/services/api';

const DEFAULT_APP_NAME = 'ABS';
const DEFAULT_APP_GREEN = '#166534';

/**
 * Line under the app title in the sidebar: org name for default branding; attribution when app name is white-labeled.
 * @param {string} appName - Resolved display name from branding (same as title above).
 * @param {string} organizationDisplayName - Company / workspace name from settings or tenant.
 * @returns {string} Subtitle text or empty to hide the row.
 */
function sidebarBrandSubtitle(appName, organizationDisplayName) {
  const usingDefaultProductName =
    (appName || '').trim().toLowerCase() === String(APP_NAME || 'ABS').trim().toLowerCase();
  if (usingDefaultProductName) {
    return (organizationDisplayName || '').trim();
  }
  return 'Powered by ABS';
}

/**
 * Renders a menu or quick-action icon. Lucide exports forwardRef components (typeof === 'object'),
 * not plain functions — do not use `typeof Icon === 'function'` or every item becomes LayoutDashboard.
 */
function NavMenuIcon({ icon: Icon, className }) {
  if (Icon == null) {
    return <LayoutDashboard className={className} />;
  }
  return <Icon className={className} />;
}

/** Hint text for menu items – simple language for market women */
const MENU_HINTS = {
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
  '/invoices': 'Bills you send to customers',
  '/expenses': 'Money you spent on business',
  '/reports': 'Reports and data analysis',
  '/ask-ai': 'Ask iBIS about your business data',
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
  '/merchandise': 'Stock value of goods you sell',
  assets: 'Stock value of goods for sale, materials, and equipment',
  '/employees': 'Your staff',
  '/shops': 'Your shops',
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
const filterNavItems = (items, { isAdmin, isManager }) =>
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

const getMenuItems = (
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

  if (businessType === 'shop' && hasFeature('paymentsExpenses')) {
    baseItems.push({ key: '/sales', icon: ShoppingCart, label: 'Sales', tooltip: MENU_HINTS['/sales'] });
    if (shopType === 'restaurant' && hasFeature('orders')) {
      baseItems.push({ key: '/orders', icon: ChefHat, label: 'Orders', tooltip: MENU_HINTS['/orders'] });
    }
    if (hasFeature('products')) {
      baseItems.push({ key: '/products', icon: Package, label: 'Products', tooltip: MENU_HINTS['/products'] });
    }
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
    ...(!isPlatformAdmin && hasFeature('crm') ? [{ key: '/reviews', label: 'Reviews', tooltip: MENU_HINTS['/reviews'] }] : []),
    ...(hasFeature('deliveries') ? [{ key: '/deliveries', label: 'Deliveries', tooltip: MENU_HINTS['/deliveries'] }] : []),
    ...(!isPlatformAdmin && hasFeature('jobAutomation') ? [{ key: '/tasks', label: 'Tasks', tooltip: MENU_HINTS['/tasks'] }] : []),
    ...(hasFeature('automations') ? [{ key: '/automations', label: 'Automations', tooltip: MENU_HINTS['/automations'], managerOnly: true }] : []),
    ...(!isPlatformAdmin && hasFeature('leadPipeline') ? [{ key: '/leads', label: 'Leads', tooltip: MENU_HINTS['/leads'] }] : []),
    ...(hasFeature('marketing') ? [{ key: '/marketing', label: 'Marketing', tooltip: MENU_HINTS['/marketing'], managerOnly: true }] : []),
    ...(hasFeature('vendors') ? [{ key: '/vendors', label: 'Vendors', tooltip: MENU_HINTS['/vendors'] }] : []),
    ...(hasFeature('payroll') ? [{ key: '/payroll', label: 'Payroll', tooltip: MENU_HINTS['/payroll'], managerOnly: true }] : []),
    ...(hasFeature('accounting') ? [{ key: '/accounting', label: 'Accounting', tooltip: MENU_HINTS['/accounting'], managerOnly: true }] : []),
    ...(hasFeature('quoteAutomation') && isQuotesEnabledForTenant(businessType, shopType) ? [{ key: '/quotes', label: 'Quotes', tooltip: MENU_HINTS['/quotes'] }] : []),
    ...(hasFeature('payroll') ? [{ key: '/employees', label: 'Employees', tooltip: MENU_HINTS['/employees'], managerOnly: true }] : []),
  ];
  if (businessType === 'shop' && hasFeature('shopsModule')) {
    advancedChildren.splice(2, 0, {
      key: '/shops',
      label: 'Shops',
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

  const complianceChildren = hasFeature('reports')
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
 * @param {string|null} businessType - 'shop' | 'pharmacy' | 'printing_press'
 * @param {string|null} shopType - Tenant metadata.shopType (for shop only)
 * @returns {Array<{ label: string, path: string, icon: React.Component }>}
 */
const getQuickActions = (businessType, shopType) => {
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
      { label: 'New job', path: '/jobs', icon: FileText, tooltip: 'Create a new job or order' },
      { label: 'New quote', path: '/quotes?add=1', icon: FilePlus, tooltip: 'Create a quote for a customer' },
      { label: 'Add customer', path: '/customers?add=1', icon: UserPlus, tooltip: 'Add a new customer' },
    ];
  }
  return [];
};

export function Sidebar({ collapsed, onCollapse }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isManager, isDriver, activeTenant, user, hasFeature, isPlatformAdmin, isSupportAccessActive } = useAuth();
  const hidePlatformAdminNav = isPlatformAdmin && !isSupportAccessActive;
  const { appName, primaryColor } = useBranding();
  const { canInstall, promptInstall } = usePWAInstall();
  const studio = useStudioLocationOptional();
  const [openKeys, setOpenKeys] = useState([]);

  const { data: organizationData } = useQuery({
    queryKey: ['settings', 'organization'],
    queryFn: () => settingsService.getOrganizationSettings(),
    enabled: isManager && !!activeTenant?.id,
  });
  const organization = organizationData?.data ?? organizationData;
  const orgName = (organization?.name || activeTenant?.name || '').trim();
  const businessName = useScopedWorkspaceName(organization?.name, '');
  const sidebarSubtitle = useMemo(
    () => sidebarBrandSubtitle(appName, businessName),
    [appName, businessName]
  );
  const showScopeSwitcher =
    (activeTenant?.businessType === 'shop' && hasFeature('shopsModule')) ||
    (STUDIO_LIKE_TYPES.includes(activeTenant?.businessType) && hasFeature('studioLocationsModule'));

  const activeStudioType = studio?.activeLocation?.studioType || null;
  const businessType = STUDIO_LIKE_TYPES.includes(activeStudioType)
    ? activeStudioType
    : activeTenant?.businessType || null;
  const shopType =
    activeTenant?.metadata?.businessSubType ||
    activeTenant?.metadata?.shopType ||
    null;

  const { hiddenSidebarKeys: rawHiddenSidebarKeys } = useSidebarPreferences();

  const hiddenSidebarKeys = useMemo(
    () =>
      sanitizeHiddenSidebarKeys(
        rawHiddenSidebarKeys,
        activeTenant?.businessType || null,
        shopType
      ),
    [rawHiddenSidebarKeys, activeTenant?.businessType, shopType]
  );

  const menuItems = useMemo(() => {
    const items = getMenuItems(
      businessType,
      isAdmin,
      isManager,
      isDriver,
      shopType,
      hasFeature,
      hidePlatformAdminNav
    );
    return filterHiddenNavItems(items, hiddenSidebarKeys);
  }, [
    businessType,
    isAdmin,
    isManager,
    isDriver,
    shopType,
    hasFeature,
    hidePlatformAdminNav,
    hiddenSidebarKeys,
  ]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const flags = activeTenant?.effectiveFeatureFlags || {};
    const enabled = Object.entries(flags).filter(([, v]) => v === true).map(([k]) => k).sort();
    console.log('[Sidebar][features] tenantId=%s plan=%s enabledCount=%s crm=%s automations=%s menuKeys=%j enabled=%j',
      activeTenant?.id || 'n/a',
      activeTenant?.plan || 'n/a',
      enabled.length,
      hasFeature('crm'),
      hasFeature('automations'),
      menuItems.map((item) => item.key),
      enabled
    );
  }, [activeTenant, hasFeature, menuItems]);
  const quickActions = useMemo(() => getQuickActions(businessType, shopType), [businessType, shopType]);

  // Open the group that contains the current route by default (only on route change)
  useEffect(() => {
    const pathname = location.pathname;
    const parent = menuItems.find(
      (item) =>
        item.children &&
        item.children.some(
          (c) => pathname === c.key || pathname.startsWith(c.key + '/')
        )
    );
    if (parent) {
      setOpenKeys((prev) => prev.includes(parent.key) ? prev : [...prev, parent.key]);
    }
  }, [location.pathname, menuItems]);

  // Route prefetching map - maps routes to their lazy import functions
  const routePrefetchMap = useMemo(() => ({
    '/dashboard': () => import('../../pages/Dashboard'),
    '/ask-ai': () => import('../../pages/AskAI'),
    '/customers': () => import('../../pages/Customers'),
    '/reviews': () => import('../../pages/CustomerFeedback'),
    '/marketing': () => import('../../pages/Marketing'),
    '/vendors': () => import('../../pages/Vendors'),
    '/jobs': () => import('../../pages/Jobs'),
    '/sales': () => import('../../pages/Sales'),
    '/orders': () => import('../../pages/Orders'),
    '/invoices': () => import('../../pages/Invoices'),
    '/quotes': () => import('../../pages/Quotes'),
    '/expenses': () => import('../../pages/Expenses'),
    '/pricing': () => import('../../pages/Pricing'),
    '/reports/overview': () => import('../../pages/Reports'),
    '/export-data': () => import('../../pages/ExportData'),
    '/compliance/statements': () => import('../../pages/Reports'),
    '/compliance/vat': () => import('../../pages/compliance/ComplianceVat'),
    '/compliance/evat': () => import('../../pages/compliance/ComplianceEvat'),
    '/materials': () => import('../../pages/Materials'),
    '/equipment': () => import('../../pages/Equipment'),
    '/merchandise': () => import('../../pages/Merchandise'),
    '/leads': () => import('../../pages/Leads'),
    '/users': () => import('../../pages/Users'),
    '/settings': () => import('../../pages/Settings'),
    '/employees': () => import('../../pages/Employees'),
    '/payroll': () => import('../../pages/Payroll'),
    '/accounting': () => import('../../pages/Accounting'),
    '/shops': () => import('../../pages/Shops'),
    '/studio-locations': () => import('../../pages/StudioLocations'),
    '/pharmacies': () => import('../../pages/Pharmacies'),
    '/products': () => import('../../pages/Products'),
    '/drugs': () => import('../../pages/Drugs'),
    '/prescriptions': () => import('../../pages/Prescriptions'),
    '/tasks': () => import('../../pages/Tasks'),
    '/automations': () => import('../../pages/Automations'),
    ...(isSabitoStoreEnabled()
      ? {
          '/store': () => import('../../pages/StoreDashboard'),
          '/store/listings': () => import('../../pages/StoreListings'),
          '/store/services': () => import('../../pages/StoreServices'),
          '/store/orders': () => import('../../pages/OnlineOrders'),
          '/store/settings': () => import('../../pages/StoreSettings'),
        }
      : {}),
    '/online-store': () => import('../../pages/OnlineStore'),
    '/online-store/orders': () => import('../../pages/OnlineOrders'),
  }), []);

  const handlePrefetch = useCallback((key) => {
    if (key && typeof key === 'string' && key.startsWith('/')) {
      const prefetchFn = routePrefetchMap[key];
      if (prefetchFn) {
        // Prefetch the route component
        prefetchFn().catch(() => {
          // Silently fail if prefetch fails
        });
      }
    }
  }, [routePrefetchMap]);

  const handleMenuClick = useCallback((key) => {
    if (key && typeof key === 'string' && key.startsWith('/')) {
      navigate(key);
    }
  }, [navigate]);

  const toggleSubmenu = useCallback((key) => {
    setOpenKeys(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  }, []);

  const handleParentClick = useCallback((item) => {
    if (collapsed) {
      onCollapse?.(false);
      setOpenKeys(prev => (prev.includes(item.key) ? prev : [...prev, item.key]));
    } else {
      toggleSubmenu(item.key);
    }
  }, [collapsed, onCollapse, toggleSubmenu]);

  const { hintMode } = useHintMode();
  const tooltipContentClass = 'shadow-none border border-border';
  const tooltipDelay = hintMode ? 300 : 999999;

  return (
    <aside 
      data-tour="sidebar"
      className={cn(
        "fixed left-0 top-0 bottom-0 z-40 flex flex-col bg-card text-foreground transition-all duration-300 border-r border-border overflow-hidden pointer-events-auto",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <TooltipProvider delayDuration={tooltipDelay}>
        <div className="h-16 flex-shrink-0 flex items-center justify-start px-4 border-b border-border">
          <div
            className={cn(
              'flex items-center gap-2 min-w-0',
              collapsed && 'justify-center'
            )}
          >
            <AppLogo
              alt={appName}
              className={cn(collapsed ? 'h-9 w-9' : 'h-10 w-10')}
            />
            {!collapsed && (
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-base font-semibold" style={{ color: primaryColor }}>
                  {appName}
                </span>
                {showScopeSwitcher ? (
                  <SidebarScopeSwitcher organizationName={orgName} />
                ) : sidebarSubtitle ? (
                  <span className="text-xs text-muted-foreground truncate">
                    {sidebarSubtitle}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-1">
          {menuItems.map((item) => (
              <div key={item.key}>
                {item.children ? (
                  (() => {
                    const isOpen = openKeys.includes(item.key);
                    const parentDataTour = item.key === 'reports' ? 'nav-reports' : undefined;
                    const parentBtn = (
                      <button
                        onClick={() => handleParentClick(item)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-foreground",
                          collapsed && "justify-center !p-2 w-10 h-10 mx-auto"
                        )}
                        data-tour={parentDataTour}
                      >
                        <NavMenuIcon icon={item.icon} className="h-5 w-5 flex-shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-left">{item.label}</span>
                            <ChevronRight className={cn(
                              "h-4 w-4 transition-transform flex-shrink-0",
                              isOpen && "rotate-90"
                            )} />
                          </>
                        )}
                      </button>
                    );
                    return (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>{parentBtn}</TooltipTrigger>
                          <TooltipContent side="right" className={tooltipContentClass}>
                            {item.tooltip || item.label}
                          </TooltipContent>
                        </Tooltip>
                        {isOpen && !collapsed && (
                          <div className="ml-8 mt-1 space-y-1">
                            {item.children.map((child) => {
                              const childDataTour =
                                child.key === '/quotes' ? 'nav-quotes' : child.key === '/pricing' ? 'nav-pricing' : undefined;
                              return (
                                <Tooltip key={child.key}>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleMenuClick(child.key)}
                                      onMouseEnter={() => handlePrefetch(child.key)}
                                      className={cn(
                                        "w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors",
                                        location.pathname === child.key 
                                          ? "bg-brand text-white font-medium hover:bg-brand-dark" 
                                          : "text-foreground"
                                      )}
                                      data-tour={childDataTour}
                                    >
                                      {child.label}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className={tooltipContentClass}>
                                    {child.tooltip || child.label}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()
                ) : (
                  (() => {
                    const dataTourId =
                      item.key === '/products'
                        ? 'nav-products'
                        : item.key === '/sales'
                          ? 'nav-sales'
                          : item.key === '/jobs'
                            ? 'nav-jobs'
                            : item.key === '/customers'
                              ? 'nav-customers'
                              : item.key === '/invoices'
                                ? 'nav-invoices'
                                : item.key === '/expenses'
                                  ? 'nav-expenses'
                                  : item.key === '/settings'
                                    ? 'nav-settings'
                                    : undefined;

                    const leafBtn = (
                      <button
                        onClick={() => handleMenuClick(item.key)}
                        onMouseEnter={() => handlePrefetch(item.key)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors",
                          location.pathname === item.key 
                            ? "bg-brand text-white font-medium hover:bg-brand-dark" 
                            : "text-foreground",
                          collapsed && "justify-center !p-2 w-10 h-10 mx-auto"
                        )}
                        data-tour={dataTourId}
                      >
                        <NavMenuIcon icon={item.icon} className="h-5 w-5 flex-shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                      </button>
                    );
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>{leafBtn}</TooltipTrigger>
                        <TooltipContent side="right" className={tooltipContentClass}>
                          {item.tooltip || item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })()
                )}
              </div>
            ))}
          {quickActions.length > 0 && (
            <div className="-mx-4 mt-2 border-t border-border pt-2 pb-2" data-tour="quick-actions">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-1.5">
                Quick actions
              </p>
              <div className="space-y-1 mt-1 px-4">
                {quickActions.map((action) => {
                  const btn = (
                    <button
                      key={action.path}
                      onClick={() => navigate(action.path)}
                      onMouseEnter={() => {
                        const path = action.path.split('?')[0];
                        const prefetchFn = routePrefetchMap[path];
                        if (prefetchFn) prefetchFn().catch(() => {});
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-primary",
                        collapsed && "justify-center !p-1 w-10 h-10 mx-auto"
                      )}
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-brand text-white">
                        <NavMenuIcon icon={action.icon} className="h-4 w-4" />
                      </span>
                      {!collapsed && <span>{action.label}</span>}
                    </button>
                  );
                  return collapsed ? (
                    <Tooltip key={action.path}>
                      <TooltipTrigger asChild>{btn}</TooltipTrigger>
                      <TooltipContent side="right" className={tooltipContentClass}>
                        {action.tooltip || action.label}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip key={action.path}>
                      <TooltipTrigger asChild>{btn}</TooltipTrigger>
                      <TooltipContent side="right" className={tooltipContentClass}>
                        {action.tooltip || action.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
        </nav>
        <div className="flex-shrink-0 p-3 border-t border-border" data-tour="sidebar-collapse">
          <div
            className={cn(
              "w-full",
              canInstall && !collapsed ? "flex min-w-0 items-center gap-2" : "space-y-2"
            )}
          >
            {canInstall && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={promptInstall}
                    className={cn(
                      "hover:bg-muted text-foreground gap-3",
                      !collapsed && "min-w-0 flex-1 justify-start",
                      collapsed && "justify-center !p-2 w-10 h-10 mx-auto"
                    )}
                  >
                    <Download className="h-5 w-5 flex-shrink-0 text-green-600" />
                    {!collapsed && <span className="truncate">Install App</span>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className={tooltipContentClass}>
                  Install ABS on your device
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onCollapse?.(!collapsed)}
                  className={cn(
                    "hover:bg-muted text-foreground",
                    canInstall && !collapsed ? "h-10 w-10 flex-shrink-0" : "w-full",
                    collapsed && "w-10 mx-auto"
                  )}
                >
                  {collapsed ? (
                    <ChevronRight className="h-5 w-5" />
                  ) : (
                    <ChevronLeft className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className={tooltipContentClass}>
                {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    </aside>
  );
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isManager, isDriver, activeTenant, hasFeature, isPlatformAdmin, isSupportAccessActive } = useAuth();
  const hidePlatformAdminNav = isPlatformAdmin && !isSupportAccessActive;
  const { appName, primaryColor } = useBranding();
  const { canInstall, promptInstall } = usePWAInstall();
  const studio = useStudioLocationOptional();
  const [openKeys, setOpenKeys] = useState([]);

  const { data: organizationData } = useQuery({
    queryKey: ['settings', 'organization'],
    queryFn: () => settingsService.getOrganizationSettings(),
    enabled: isManager && !!activeTenant?.id,
  });
  const organization = organizationData?.data ?? organizationData;
  const orgName = (organization?.name || activeTenant?.name || '').trim();
  const businessName = useScopedWorkspaceName(organization?.name, '');
  const sidebarSubtitle = useMemo(
    () => sidebarBrandSubtitle(appName, businessName),
    [appName, businessName]
  );
  const showScopeSwitcher =
    (activeTenant?.businessType === 'shop' && hasFeature('shopsModule')) ||
    (STUDIO_LIKE_TYPES.includes(activeTenant?.businessType) && hasFeature('studioLocationsModule'));

  const activeStudioType = studio?.activeLocation?.studioType || null;
  const businessType = STUDIO_LIKE_TYPES.includes(activeStudioType)
    ? activeStudioType
    : activeTenant?.businessType || null;
  const shopType =
    activeTenant?.metadata?.businessSubType ||
    activeTenant?.metadata?.shopType ||
    null;
  const { hiddenSidebarKeys: rawHiddenSidebarKeys } = useSidebarPreferences();

  const hiddenSidebarKeys = useMemo(
    () =>
      sanitizeHiddenSidebarKeys(
        rawHiddenSidebarKeys,
        activeTenant?.businessType || null,
        shopType
      ),
    [rawHiddenSidebarKeys, activeTenant?.businessType, shopType]
  );

  const menuItems = useMemo(() => {
    const items = getMenuItems(
      businessType,
      isAdmin,
      isManager,
      isDriver,
      shopType,
      hasFeature,
      hidePlatformAdminNav
    );
    return filterHiddenNavItems(items, hiddenSidebarKeys);
  }, [
    businessType,
    isAdmin,
    isManager,
    isDriver,
    shopType,
    hasFeature,
    hidePlatformAdminNav,
    hiddenSidebarKeys,
  ]);
  const quickActions = useMemo(() => getQuickActions(businessType, shopType), [businessType, shopType]);

  // Open the group that contains the current route when sheet opens or location changes
  useEffect(() => {
    const pathname = location.pathname;
    const parent = menuItems.find(
      (item) =>
        item.children &&
        item.children.some(
          (c) => pathname === c.key || pathname.startsWith(c.key + '/')
        )
    );
    if (parent) {
      setOpenKeys((prev) => prev.includes(parent.key) ? prev : [...prev, parent.key]);
    }
  }, [location.pathname, menuItems]);

  const routePrefetchMap = useMemo(() => ({
    '/dashboard': () => import('../../pages/Dashboard'),
    '/ask-ai': () => import('../../pages/AskAI'),
    '/customers': () => import('../../pages/Customers'),
    '/reviews': () => import('../../pages/CustomerFeedback'),
    '/marketing': () => import('../../pages/Marketing'),
    '/vendors': () => import('../../pages/Vendors'),
    '/jobs': () => import('../../pages/Jobs'),
    '/sales': () => import('../../pages/Sales'),
    '/orders': () => import('../../pages/Orders'),
    '/invoices': () => import('../../pages/Invoices'),
    '/quotes': () => import('../../pages/Quotes'),
    '/expenses': () => import('../../pages/Expenses'),
    '/pricing': () => import('../../pages/Pricing'),
    '/reports/overview': () => import('../../pages/Reports'),
    '/export-data': () => import('../../pages/ExportData'),
    '/compliance/statements': () => import('../../pages/Reports'),
    '/compliance/vat': () => import('../../pages/compliance/ComplianceVat'),
    '/compliance/evat': () => import('../../pages/compliance/ComplianceEvat'),
    '/materials': () => import('../../pages/Materials'),
    '/equipment': () => import('../../pages/Equipment'),
    '/merchandise': () => import('../../pages/Merchandise'),
    '/leads': () => import('../../pages/Leads'),
    '/users': () => import('../../pages/Users'),
    '/settings': () => import('../../pages/Settings'),
    '/employees': () => import('../../pages/Employees'),
    '/payroll': () => import('../../pages/Payroll'),
    '/accounting': () => import('../../pages/Accounting'),
    '/shops': () => import('../../pages/Shops'),
    '/studio-locations': () => import('../../pages/StudioLocations'),
    '/pharmacies': () => import('../../pages/Pharmacies'),
    '/products': () => import('../../pages/Products'),
    '/drugs': () => import('../../pages/Drugs'),
    '/prescriptions': () => import('../../pages/Prescriptions'),
    '/tasks': () => import('../../pages/Tasks'),
    '/automations': () => import('../../pages/Automations'),
  }), []);

  const handlePrefetch = useCallback((key) => {
    if (key && typeof key === 'string' && key.startsWith('/')) {
      const prefetchFn = routePrefetchMap[key];
      if (prefetchFn) {
        prefetchFn().catch(() => {});
      }
    }
  }, [routePrefetchMap]);

  const handleMenuClick = useCallback((key) => {
    if (key && typeof key === 'string' && key.startsWith('/')) {
      navigate(key);
      setOpen(false);
    }
  }, [navigate]);

  const toggleSubmenu = (key) => {
    setOpenKeys(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="lg:hidden min-h-[44px] min-w-[44px] px-[3px] bg-muted hover:bg-muted/80"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 bg-card text-foreground p-0 border-r border-border flex flex-col overflow-hidden">
        <div className="h-16 flex-shrink-0 flex items-center justify-start px-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <AppLogo alt={appName} className="h-9 w-9" />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-sm font-semibold" style={{ color: primaryColor }}>
                {appName}
              </span>
              {showScopeSwitcher ? (
                <SidebarScopeSwitcher organizationName={orgName} />
              ) : sidebarSubtitle ? (
                <span className="text-xs text-muted-foreground truncate">
                  {sidebarSubtitle}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-1">
          {menuItems.map((item) => (
              <div key={item.key}>
                {item.children ? (
                  (() => {
                    const isOpen = openKeys.includes(item.key);
                    return (
                      <div>
                        <button
                          onClick={() => toggleSubmenu(item.key)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-md hover:bg-muted transition-colors text-foreground min-h-[44px]"
                        >
                          <NavMenuIcon icon={item.icon} className="h-5 w-5 flex-shrink-0" />
                          <span className="flex-1 text-left">{item.label}</span>
                          <ChevronRight className={cn(
                            "h-4 w-4 transition-transform",
                            isOpen && "rotate-90"
                          )} />
                        </button>
                        {isOpen && (
                          <div className="ml-8 mt-1 space-y-1">
                            {item.children.map((child) => (
                              <button
                                key={child.key}
                                onClick={() => handleMenuClick(child.key)}
                                onMouseEnter={() => handlePrefetch(child.key)}
                                className={cn(
                                  "w-full text-left px-3 py-3 rounded-md hover:bg-muted transition-colors text-foreground min-h-[44px]",
                                  location.pathname === child.key && "bg-muted text-foreground font-medium"
                                )}
                              >
                                {child.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <button
                    onClick={() => handleMenuClick(item.key)}
                    onMouseEnter={() => handlePrefetch(item.key)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-md hover:bg-muted transition-colors min-h-[44px]",
                      location.pathname === item.key 
                        ? "bg-brand text-white font-medium hover:bg-brand-dark" 
                        : "text-foreground"
                    )}
                  >
                    <NavMenuIcon icon={item.icon} className="h-5 w-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                )}
              </div>
            ))}
          {quickActions.length > 0 && (
            <div className="-mx-4 mt-2 border-t border-border pt-2 pb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-1.5">
                Quick actions
              </p>
              <div className="space-y-1 mt-1 px-4">
                {quickActions.map((action) => (
                  <button
                    key={action.path}
                    onClick={() => {
                      navigate(action.path);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-md hover:bg-muted transition-colors text-primary min-h-[44px]"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-brand text-white">
                      <NavMenuIcon icon={action.icon} className="h-4 w-4" />
                    </span>
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {canInstall && (
            <div className="-mx-4 mt-2 border-t border-border pt-2 pb-2">
              <div className="px-4">
                <button
                  onClick={() => {
                    promptInstall();
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-md hover:bg-muted transition-colors text-foreground min-h-[44px]"
                >
                  <Download className="h-5 w-5 text-green-600" />
                  <span>Install App</span>
                </button>
              </div>
            </div>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
