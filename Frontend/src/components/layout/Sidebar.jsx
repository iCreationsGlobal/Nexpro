import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/context/AuthContext';
import SidebarScopeSwitcher from '@/components/SidebarScopeSwitcher';
import AppLogo from '@/components/AppLogo';
import { useHintMode } from '@/context/HintModeContext';
import { usePWAInstall } from '@/context/PWAInstallContext';
import { getRoutePrefetchMap } from '@/config/navigation';
import { useWorkspaceBrand, useWorkspaceNav } from '@/hooks/useWorkspaceNav';

/**
 * Renders a menu or quick-action icon. Lucide exports forwardRef components (typeof === 'object'),
 * not plain functions — do not use `typeof Icon === 'function'` or every item becomes LayoutDashboard.
 */
export function NavMenuIcon({ icon: Icon, className }) {
  if (Icon == null) {
    return <LayoutDashboard className={className} />;
  }
  return <Icon className={className} />;
}

export function Sidebar({ collapsed, onCollapse }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTenant, hasFeature } = useAuth();
  const { menuItems, quickActions, simpleMode } = useWorkspaceNav();
  const { appName, primaryColor, orgName, subtitle: sidebarSubtitle, showScopeSwitcher } = useWorkspaceBrand();
  const { canInstall, promptInstall } = usePWAInstall();
  const showInstallApp = canInstall && !simpleMode.isSimple;
  const [openKeys, setOpenKeys] = useState([]);

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
  const routePrefetchMap = useMemo(() => getRoutePrefetchMap(), []);

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
                            : (simpleMode.isRestricted && item.tone) || "text-foreground",
                          simpleMode.isRestricted
                            ? collapsed
                              ? "flex-col justify-center gap-2 px-1 py-3"
                              : "flex-col justify-center gap-2 px-3 py-4 text-center text-base font-semibold"
                            : collapsed && "justify-center !p-2 w-10 h-10 mx-auto"
                        )}
                        data-tour={dataTourId}
                        aria-label={item.label}
                        aria-current={location.pathname === item.key ? 'page' : undefined}
                      >
                        <NavMenuIcon icon={item.icon} className={cn(
                          "flex-shrink-0",
                          simpleMode.isRestricted ? (collapsed ? "h-10 w-10" : "h-12 w-12") : "h-5 w-5"
                        )} />
                        {!collapsed && <span className={cn(simpleMode.isRestricted && "w-full break-words leading-snug")}>{item.label}</span>}
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
              showInstallApp && !collapsed ? "flex min-w-0 items-center gap-2" : "space-y-2"
            )}
          >
            {showInstallApp && (
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
                    showInstallApp && !collapsed ? "h-10 w-10 flex-shrink-0" : "w-full",
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
