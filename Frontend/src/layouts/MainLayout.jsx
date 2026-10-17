import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Mail, Loader2, X, MessageCircle } from 'lucide-react';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { SmartSearchProvider } from '../context/SmartSearchContext';
import { StudioLocationProvider } from '../context/StudioLocationContext';
import { ShopProvider } from '../context/ShopContext';
import ConnectionHealthBanner from '../components/ConnectionHealthBanner';
import NotificationWebSocketListener from '../components/NotificationWebSocketListener';
import PaymentCollectionRequiredBanner from '../components/PaymentCollectionRequiredBanner';
import BillingGraceBanner from '../components/BillingGraceBanner';
import BillingLockedScreen from '../components/BillingLockedScreen';
import ShopAccessBanner from '../components/ShopAccessBanner';
import SupportAccessBanner from '../components/SupportAccessBanner';
import AssistantChatPanel from '../components/AssistantChatPanel';
import FloatingActionButton from '../components/FloatingActionButton';
import { useSafeAreaInsets } from '../hooks/useResponsive';
import { useDeviceMode } from '../hooks/useDeviceMode';
import { useAppShellNav } from '../hooks/useAppShellNav';
import { useShellScrollMemory } from '../hooks/useShellScrollMemory';
import { useIsEditingText } from '../hooks/useIsEditingText';
import { usePageTransition } from '../hooks/usePageTransition';
import AppHeader from '../components/layout/AppHeader';
import AppTabBar, { APP_TAB_BAR_HEIGHT } from '../components/layout/AppTabBar';
import MoreMenuSheet from '../components/layout/MoreMenuSheet';
import ShellPullToRefresh from '../components/layout/ShellPullToRefresh';
import InstallAppCard from '../components/layout/InstallAppCard';
import PendingSalesBanner from '../components/layout/PendingSalesBanner';
import { useOfflineSalesSync } from '../hooks/useOfflineSalesSync';
import { findActiveNavId, navBasePath } from '../config/appShellNav';
import { getAppShellRouteMeta } from '../config/appShellRoutes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '../context/AuthContext';
import { useSimpleMode } from '../hooks/useSimpleMode';
import { useDismissibleDashboardBanner } from '../hooks/useDismissibleDashboardBanner';
import authService from '../services/authService';
import { showSuccess, showError } from '../utils/toast';
import { releaseBodyInteractionLocks } from '../utils/releaseBodyInteractionLocks';
import { IBIS_ASK_LABEL, IBIS_NAME } from '../constants/ibis';

/**
 * Map current route to Ask AI pageContext for the floating panel.
 * @param {string} pathname
 * @returns {string|undefined}
 */
function pageContextFromPath(pathname) {
  const path = String(pathname || '');
  if (path === '/' || path.startsWith('/dashboard')) return 'dashboard';
  if (path.startsWith('/reports')) return 'reports';
  if (path.startsWith('/sales') || path.startsWith('/pos')) return 'sales';
  if (path.startsWith('/invoices')) return 'invoices';
  if (path.startsWith('/expenses')) return 'expenses';
  if (path.startsWith('/customers')) return 'customers';
  if (path.startsWith('/products') || path.startsWith('/inventory')) return 'products';
  if (path.startsWith('/jobs')) return 'jobs';
  return undefined;
}

/**
 * Phone/tablet chrome state: header meta, tabs, More sheet, scroll memory.
 * Must run inside the workspace providers so the shop/studio scope is available.
 */
function useAppShellChrome(isAppShell) {
  const location = useLocation();
  const { tabItems, moreSections, destinations, isSimpleTiles } = useAppShellNav({ enabled: isAppShell });
  const [moreOpen, setMoreOpen] = useState(false);
  const isEditingText = useIsEditingText(isAppShell);

  const meta = useMemo(
    () => getAppShellRouteMeta(location.pathname, { destinations }),
    [location.pathname, destinations]
  );

  const activeTabId = useMemo(() => {
    const tabId = findActiveNavId(location.pathname, tabItems);
    if (tabId) return tabId;
    const inMore = findActiveNavId(location.pathname, moreSections.flatMap((section) => section.items));
    return inMore && meta.kind === 'root' ? 'more' : null;
  }, [location.pathname, tabItems, moreSections, meta.kind]);

  const tabPaths = useMemo(
    () => new Set(tabItems.filter((item) => item.to && !item.center).map((item) => navBasePath(item.to))),
    [tabItems]
  );
  const isTabPath = useCallback((pathname) => tabPaths.has(pathname), [tabPaths]);
  useShellScrollMemory({ enabled: isAppShell, isTabPath });
  const contentRef = useRef(null);
  usePageTransition(contentRef, { enabled: isAppShell, isTabPath });

  return {
    meta,
    tabItems,
    moreSections,
    isSimpleTiles,
    activeTabId,
    moreOpen,
    setMoreOpen,
    tabBarHidden: meta.hideTabBar || isEditingText,
    contentRef,
  };
}

/**
 * Sidebar layout on desktops; app shell (header, tab bar, More sheet) on phones and tablets.
 * The page sits in the same place in both, so crossing the breakpoint never remounts it.
 */
function WorkspaceFrame({ isAppShell, collapsed, onCollapse, children }) {
  const chrome = useAppShellChrome(isAppShell);
  const { setMoreOpen } = chrome;
  const openMore = useCallback(() => setMoreOpen(true), [setMoreOpen]);

  return (
    <div className="min-h-screen bg-background" data-layout={isAppShell ? 'app' : 'desktop'}>
      {!isAppShell && <Sidebar collapsed={collapsed} onCollapse={onCollapse} />}
      <div
        className={cn(
          'transition-all duration-300',
          !isAppShell && (collapsed ? 'ml-20' : 'ml-64')
        )}
      >
        {isAppShell ? <AppHeader meta={chrome.meta} /> : <Header />}
        <div ref={chrome.contentRef}>{children}</div>
      </div>
      {isAppShell && (
        <>
          <ShellPullToRefresh />
          <AppTabBar
            items={chrome.tabItems}
            activeId={chrome.activeTabId}
            onOpenMore={openMore}
            moreOpen={chrome.moreOpen}
            hidden={chrome.tabBarHidden}
          />
          <MoreMenuSheet
            open={chrome.moreOpen}
            onOpenChange={chrome.setMoreOpen}
            sections={chrome.moreSections}
            simple={chrome.isSimpleTiles}
          />
        </>
      )}
    </div>
  );
}

const MainLayout = () => {
  const location = useLocation();
  const safeAreaInsets = useSafeAreaInsets();
  const { isAppShell } = useDeviceMode();
  const {
    user,
    activeTenantId,
    refreshAuthState,
    needsEmailVerification,
    billingStatus,
    isSupportAccessActive,
    isDriver,
  } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const wasAppShellRef = useRef(isAppShell);

  const assistantPageContext = useMemo(
    () => pageContextFromPath(location.pathname),
    [location.pathname]
  );
  const { isSimple } = useSimpleMode();
  // Simple Mode: no AI assistant.
  // Phones and tablets reach iBIS from the header, like the native app (no floating button).
  const showAssistantFab =
    !isAppShell && !isDriver && !isSimple && !assistantOpen && location.pathname !== '/ask-ai';
  const openAssistant = useCallback(() => setAssistantOpen(true), []);

  // Phones/tablets: sales taken offline are kept on the device and synced (services/offlineSalesQueue).
  const offlineSales = useOfflineSalesSync({ enabled: isAppShell && !isDriver });

  const showVerifyEmailBanner = useMemo(() => Boolean(needsEmailVerification), [needsEmailVerification]);
  const isDashboardRoute = location.pathname === '/' || location.pathname === '/dashboard';
  const dashboardBannerScopeId = activeTenantId || user?.id || 'global';
  const {
    dismissed: verifyEmailDismissedOnDashboard,
    dismiss: dismissVerifyEmailDashboard,
  } = useDismissibleDashboardBanner('verify-email', dashboardBannerScopeId, showVerifyEmailBanner);
  const {
    dismissed: paymentCollectionDismissedOnDashboard,
    dismiss: dismissPaymentCollectionDashboard,
  } = useDismissibleDashboardBanner('payment-collection-required', dashboardBannerScopeId);
  const showVerifyEmailInLayout =
    showVerifyEmailBanner && !(isDashboardRoute && verifyEmailDismissedOnDashboard);

  const isBillingExemptRoute = useMemo(() => {
    const path = location.pathname;
    if (path === '/checkout' || path === '/plans' || path === '/profile') return true;
    if (path.startsWith('/settings')) return true;
    return false;
  }, [location.pathname]);

  const showBillingLock =
    !isSupportAccessActive &&
    billingStatus?.canAccessApp === false &&
    billingStatus?.billingStatus === 'locked' &&
    !isBillingExemptRoute;

  // When banner would show, refetch /auth/me once so we get latest emailVerifiedAt (e.g. user verified via link or script)
  const hasRefetchedForVerifyBanner = useRef(false);
  useEffect(() => {
    if (!showVerifyEmailBanner || !user || hasRefetchedForVerifyBanner.current) return;
    hasRefetchedForVerifyBanner.current = true;
    refreshAuthState().catch(() => {});
  }, [showVerifyEmailBanner, user, refreshAuthState]);

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      await authService.resendVerification();
      showSuccess('Verification email sent. Check your inbox.');
      await refreshAuthState();
    } catch (err) {
      const msg = err?.response?.data?.message || '';
      if (err?.response?.status === 400 && msg.toLowerCase().includes('already verified')) {
        await refreshAuthState();
        showSuccess('Your email is already verified.');
        return;
      }
      showError(err, msg || 'Failed to send. Try again later.');
    } finally {
      setResendLoading(false);
    }
  };

  // Auto-expand only when transitioning from mobile/tablet to desktop.
  // Keep user's manual collapse state while already on desktop.
  useEffect(() => {
    const wasAppShell = wasAppShellRef.current;
    if (wasAppShell && !isAppShell && collapsed) {
      setCollapsed(false);
    }
    wasAppShellRef.current = isAppShell;
  }, [isAppShell, collapsed]);

  // Navigating away while a Sheet/Dialog is open can leave body pointer-events locked.
  useEffect(() => {
    releaseBodyInteractionLocks();
  }, [location.pathname]);

  return (
    <SmartSearchProvider>
      <StudioLocationProvider>
      <ShopProvider>
      <NotificationWebSocketListener />
      <WorkspaceFrame isAppShell={isAppShell} collapsed={collapsed} onCollapse={setCollapsed}>
          <SupportAccessBanner />
          <ConnectionHealthBanner className="mx-4 mt-2 sm:mx-4 lg:mx-6" />
          {isAppShell && (
            <PendingSalesBanner
              pending={offlineSales.pending}
              syncing={offlineSales.syncing}
              onSyncNow={() => offlineSales.syncNow()}
            />
          )}
          {/* Email verification banner only in layout; onboarding banner is on Dashboard */}
          {showVerifyEmailInLayout && (
            <div className="mx-4 sm:mx-4 lg:mx-6 mt-2 rounded-lg border border-amber-600/50 bg-amber-500/10 p-3 sm:p-3 lg:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center sm:items-start gap-2 sm:gap-3 min-w-0">
                <Mail className="h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-medium text-foreground">Verify your email</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    We sent a link to your email. Click it to verify, or resend below.
                  </p>
                </div>
              </div>
              <div className="flex w-full sm:w-auto items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none shrink-0 border-amber-600/50 text-amber-700 hover:bg-amber-500/20"
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                >
                  {resendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resend link'}
                </Button>
                {isDashboardRoute && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-amber-700 hover:bg-amber-500/20"
                    aria-label="Hide email verification banner on dashboard"
                    onClick={dismissVerifyEmailDashboard}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
          {/* Auto-send on but payment not set: refetched every 10 min */}
          {!isSimple && (
            <PaymentCollectionRequiredBanner
              dismissible={isDashboardRoute}
              dismissed={isDashboardRoute && paymentCollectionDismissedOnDashboard}
              onDismiss={dismissPaymentCollectionDashboard}
            />
          )}
          <ShopAccessBanner />
          <BillingGraceBanner billing={billingStatus} />
          {isAppShell && isDashboardRoute && !isSimple && <InstallAppCard />}
          <main
            className="w-full bg-muted/50 py-4 sm:py-6"
            style={{
              paddingBottom: isAppShell
                ? `calc(${APP_TAB_BAR_HEIGHT}px + 1.5rem + env(safe-area-inset-bottom, 0px))`
                : safeAreaInsets.bottom > 0
                  ? `calc(1.5rem + ${safeAreaInsets.bottom}px)`
                  : undefined,
            }}
          >
            <div className={cn('min-h-[calc(100dvh-8rem)] px-4 sm:px-4', isAppShell ? 'md:px-6' : 'lg:px-6')}>
              {showBillingLock ? <BillingLockedScreen billing={billingStatus} /> : <Outlet />}
            </div>
          </main>
      </WorkspaceFrame>
      {showAssistantFab && (
        <FloatingActionButton
          icon={MessageCircle}
          label={IBIS_NAME}
          tooltip={IBIS_ASK_LABEL}
          onClick={openAssistant}
          position="bottom-right"
          showOnAllSizes
          hideOnScroll={false}
        />
      )}
      {!isSimple && (
        <AssistantChatPanel
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          pageContext={assistantPageContext}
        />
      )}
      </ShopProvider>
      </StudioLocationProvider>
    </SmartSearchProvider>
  );
};

export default MainLayout;
