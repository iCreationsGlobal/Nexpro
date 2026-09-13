import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Users,
  UserCog,
  Settings,
  Currency,
  AlertTriangle,
  FileSearch,
  Link as LinkIcon,
  Search,
  LogOut,
  UserCheck,
  Briefcase,
  Receipt,
  Menu,
  ChevronDown,
  User,
  UserCircle,
  CheckSquare,
  LifeBuoy,
  ShoppingBag,
  Workflow,
  Megaphone,
  BadgePercent,
  Store,
  Server,
} from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SmartSearchProvider, useSmartSearch } from '../context/SmartSearchContext';
import { usePlatformAdminPermissions } from '../context/PlatformAdminPermissionsContext';
import adminService from '../services/adminService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import AppLogo from '@/components/AppLogo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Footer from '../components/layout/Footer';
import { useResponsive, BREAKPOINTS } from '../hooks/useResponsive';
import { isBootstrapPlatformSuperAdmin } from '../utils/platformAdminBootstrap';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

function AdminHeaderSearch() {
  const { placeholder, scope, searchValue, setSearchValue } = useSmartSearch();
  return (
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        key={scope}
        type="search"
        placeholder={placeholder}
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        className="pl-10 w-full rounded-full"
      />
    </div>
  );
}

const menuItems = [
  { path: '/admin', icon: BarChart3, label: 'Overview' },
  { path: '/admin/tenants', icon: Users, label: 'Tenants' },
  { path: '/admin/customers', icon: UserCircle, label: 'Customers' },
  { path: '/admin/users', icon: UserCog, label: 'Internal Users' },
  { path: '/admin/leads', icon: UserCheck, label: 'Leads' },
  { path: '/admin/sales-agents', icon: BadgePercent, label: 'Sales Agents' },
  { path: '/admin/jobs', icon: Briefcase, label: 'Jobs' },
  { path: '/admin/expenses', icon: Receipt, label: 'Expenses' },
  { path: '/admin/billing', icon: Currency, label: 'Billing' },
  { path: '/admin/reports', icon: FileSearch, label: 'Reports' },
  { path: '/admin/health', icon: AlertTriangle, label: 'System Health', badgeKey: 'healthIssues' },
  { path: '/admin/ops', icon: Server, label: 'IT Ops' },
  { path: '/admin/automations', icon: Workflow, label: 'Automations' },
  { path: '/admin/support-tickets', icon: LifeBuoy, label: 'Support Tickets' },
  { path: '/admin/sabito/overview', icon: ShoppingBag, label: 'Sabito Store Admin', activePrefix: '/admin/sabito/' },
  { path: '/admin/sabito-app/overview', icon: Megaphone, label: 'Sabito App Admin', activePrefix: '/admin/sabito-app' },
  {
    path: '/admin/online-store/setup',
    icon: Store,
    label: 'Online Store Admin',
    activePrefix: '/admin/online-store',
    badgeKey: 'pendingDomains',
    // Visible if any Online Store Admin child is accessible
    anyPermission: ['tenants.update', 'tenants.view', 'settings.view'],
  },
  { path: '/admin/tasks', icon: CheckSquare, label: 'Tasks' },
  { path: '/admin/settings', icon: Settings, label: 'Settings' },
];

const bootstrapSuperAdminHiddenPaths = new Set([
  '/admin/customers',
  '/admin/leads',
  '/admin/jobs',
  '/admin/expenses',
  '/admin/tasks',
]);

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { hasPermission, loading: permissionsLoading } = usePlatformAdminPermissions();
  const { isMobile: isBelowTablet } = useResponsive({ mobileBreakpoint: BREAKPOINTS.TABLET });
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [pendingDomainCount, setPendingDomainCount] = useState(0);
  const [criticalHealthCount, setCriticalHealthCount] = useState(0);
  const isBootstrapSuperAdmin = useMemo(
    () => Boolean(user?.isPlatformAdmin) && isBootstrapPlatformSuperAdmin(user),
    [user]
  );
  const visibleMenuItems = useMemo(
    () => menuItems.filter((item) => !isBootstrapSuperAdmin || !bootstrapSuperAdminHiddenPaths.has(item.path)),
    [isBootstrapSuperAdmin]
  );

  // Same gate as Tenants — all platform admin roles have tenants.view
  const canViewCustomDomains = !permissionsLoading && hasPermission('tenants.view');
  const canViewHealth = !permissionsLoading && hasPermission('health.view');

  useEffect(() => {
    if (!canViewCustomDomains) return undefined;

    let cancelled = false;
    const loadPendingCount = async () => {
      try {
        const res = await adminService.getOnlineStorePendingDomainCount();
        if (!cancelled && res?.success) {
          setPendingDomainCount(Number(res.data?.count) || 0);
        }
      } catch {
        // Badge is best-effort; ignore failures
      }
    };

    loadPendingCount();
    const intervalId = window.setInterval(loadPendingCount, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [canViewCustomDomains, location.pathname]);

  useEffect(() => {
    if (!canViewHealth) return undefined;

    let cancelled = false;
    const loadHealthBadge = async () => {
      try {
        const res = await adminService.getAlerts();
        if (!cancelled && res?.success) {
          setCriticalHealthCount(Number(res.data?.openCriticalHealthIssues) || 0);
        }
      } catch {
        // Badge is best-effort
      }
    };

    loadHealthBadge();
    const intervalId = window.setInterval(loadHealthBadge, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [canViewHealth, location.pathname]);

  const handleNavigateToSabito = () => {
    const token = localStorage.getItem('token');
    const sabitoUrl = import.meta.env.VITE_SABITO_URL || 'http://localhost:5175';
    const url = token ? `${sabitoUrl}?nexproToken=${token}` : sabitoUrl;
    window.location.href = url;
  };

  const navContent = (
    <nav className="flex-1 overflow-y-auto p-4 space-y-1">
      {visibleMenuItems.map((item) => {
        const isActive = item.activePrefix
          ? location.pathname.startsWith(item.activePrefix)
          : location.pathname === item.path;
        const Icon = item.icon;
        const permissionMap = {
          '/admin': 'overview.view',
          '/admin/tenants': 'tenants.view',
          '/admin/customers': 'tenants.view',
          '/admin/users': 'users.view',
          '/admin/leads': 'leads.view',
          '/admin/sales-agents': 'tenants.view',
          '/admin/jobs': 'jobs.view',
          '/admin/expenses': 'expenses.view',
          '/admin/billing': 'billing.view',
          '/admin/reports': 'reports.view',
          '/admin/health': 'health.view',
          '/admin/ops': 'ops.view',
          '/admin/automations': 'automations.view',
          '/admin/support-tickets': 'tickets.view',
          '/admin/sabito/overview': 'overview.view',
          '/admin/sabito-app/overview': 'overview.view',
          '/admin/tasks': 'settings.view',
          '/admin/settings': 'settings.view',
        };
        const requiredPermission = permissionMap[item.path];
        if (item.anyPermission?.length) {
          if (
            !permissionsLoading &&
            !item.anyPermission.some((key) => hasPermission(key))
          ) {
            return null;
          }
        } else if (requiredPermission && !permissionsLoading && !hasPermission(requiredPermission)) {
          return null;
        }
        const badgeCount =
          item.badgeKey === 'pendingDomains'
            ? pendingDomainCount
            : item.badgeKey === 'healthIssues'
              ? criticalHealthCount
              : 0;
        return (
          <button
            key={item.path}
            onClick={() => {
              navigate(item.path);
              setMobileSheetOpen(false);
            }}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors min-h-[44px]',
              isActive
                ? 'bg-brand text-white font-medium'
                : 'text-foreground hover:bg-muted'
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {badgeCount > 0 ? (
              <span
                className={cn(
                  'min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[11px] font-bold',
                  isActive
                    ? 'bg-white text-brand'
                    : item.badgeKey === 'healthIssues'
                      ? 'bg-red-100 text-red-900 border border-red-200'
                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                )}
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      {!isBelowTablet && (
      <aside className="fixed left-0 top-0 bottom-0 z-50 w-[220px] flex flex-col bg-card border-r border-border overflow-hidden">
        <div className="h-16 flex-shrink-0 flex items-center gap-2 px-4 border-b border-border">
          <AppLogo className="h-8 w-8" alt="ABS" />
          <span className="font-semibold text-lg tracking-wide text-foreground truncate">
            Control Center
          </span>
        </div>
        {navContent}
      </aside>
      )}

      <SmartSearchProvider>
        <div className={cn(
          "min-h-screen flex flex-col",
          isBelowTablet ? "ml-0" : "ml-[220px]"
        )}>
          <header className="sticky top-0 z-40 h-16 flex items-center justify-between gap-4 px-6 bg-card border-b border-border">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isBelowTablet && (
                <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 min-h-[44px] min-w-[44px] bg-muted hover:bg-muted/80"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[260px] p-0 flex flex-col overflow-hidden">
                    <div className="h-16 flex-shrink-0 flex items-center gap-2 px-4 border-b border-border">
                      <AppLogo className="h-8 w-8" alt="ABS" />
                      <span className="font-semibold text-lg tracking-wide text-foreground truncate">
                        Control
                      </span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">{navContent}</div>
                  </SheetContent>
                </Sheet>
              )}
              <div className="flex-1 max-w-[400px] min-w-[120px]">
                <AdminHeaderSearch />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 h-auto p-0 rounded-full bg-muted hover:bg-muted/80 min-h-[44px]"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.profilePicture} alt={user?.name} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm font-medium text-foreground max-w-[140px] truncate">
                      {user?.name || 'User'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    View profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleNavigateToSabito}>
                    <LinkIcon className="mr-2 h-4 w-4" />
                    Open Sabito
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 px-6 py-4 sm:p-6 overflow-auto">
            <div className="bg-card rounded-lg border border-border min-h-[360px] p-6">
              <Outlet />
            </div>
          </main>
          <Footer />
        </div>
      </SmartSearchProvider>
    </div>
  );
};

export default AdminLayout;
