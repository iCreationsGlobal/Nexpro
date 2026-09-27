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
import { useResponsive, useSafeAreaInsets, BREAKPOINTS } from '../hooks/useResponsive';
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

const MainLayout = () => {
  const location = useLocation();
  const safeAreaInsets = useSafeAreaInsets();
  const { isMobile: isBelowTablet } = useResponsive({ mobileBreakpoint: BREAKPOINTS.TABLET });
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
  const wasBelowTabletRef = useRef(isBelowTablet);

  const assistantPageContext = useMemo(
    () => pageContextFromPath(location.pathname),
    [location.pathname]
  );
  const { isSimple } = useSimpleMode();
  // Simple Mode: no AI assistant.
  const showAssistantFab = !isDriver && !isSimple && !assistantOpen && location.pathname !== '/ask-ai';
  const openAssistant = useCallback(() => setAssistantOpen(true), []);

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
    const wasBelowTablet = wasBelowTabletRef.current;
    if (wasBelowTablet && !isBelowTablet && collapsed) {
      setCollapsed(false);
    }
    wasBelowTabletRef.current = isBelowTablet;
  }, [isBelowTablet, collapsed]);

  // Navigating away while a Sheet/Dialog is open can leave body pointer-events locked.
  useEffect(() => {
    releaseBodyInteractionLocks();
  }, [location.pathname]);

  return (
    <SmartSearchProvider>
      <StudioLocationProvider>
      <ShopProvider>
      <NotificationWebSocketListener />
      <div className="min-h-screen bg-background">
        {/* Desktop Sidebar */}
        {!isBelowTablet && (
          <Sidebar collapsed={collapsed} onCollapse={setCollapsed} />
        )}

        {/* Main Content Area */}
        <div
          className={cn(
            'transition-all duration-300',
            !isBelowTablet && (collapsed ? 'ml-20' : 'ml-64')
          )}
        >
          <Header />
          <SupportAccessBanner />
          <ConnectionHealthBanner className="mx-4 mt-2 sm:mx-4 lg:mx-6" />
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
          <main
            className="w-full bg-muted/50 py-4 sm:py-6"
            style={{
              paddingBottom:
                safeAreaInsets.bottom > 0
                  ? `calc(1.5rem + ${safeAreaInsets.bottom}px)`
                  : undefined,
            }}
          >
            <div className="min-h-[calc(100dvh-8rem)] px-4 sm:px-4 lg:px-6">
              {showBillingLock ? <BillingLockedScreen billing={billingStatus} /> : <Outlet />}
            </div>
          </main>
        </div>

      </div>
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
