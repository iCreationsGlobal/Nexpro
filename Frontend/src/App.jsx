import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { PublicConfigProvider, usePublicConfig } from './context/PublicConfigContext';
import { HintModeProvider } from './context/HintModeContext';
import { ThemeProvider } from './context/ThemeContext';
import { PWAInstallProvider } from './context/PWAInstallContext';
import { PlatformAdminPermissionsProvider } from './context/PlatformAdminPermissionsContext';
import PrivateRoute from './components/PrivateRoute';
import PlatformRoute from './components/PlatformRoute';
import MainLayout from './layouts/MainLayout';
import AdminLayout from './layouts/AdminLayout';
import ErrorBoundary from './components/ErrorBoundary';
import RequireWorkspaceManager from './components/RequireWorkspaceManager';
import SabitoStoreRoute from './components/SabitoStoreRoute';
import TableSkeleton from './components/TableSkeleton';
import AppLoader from './components/AppLoader';
import PWAInstallBanner from './components/PWAInstallBanner';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';
import GoogleSignInHost from './components/GoogleSignInHost';
import { useSwipeBack } from './hooks/useSwipeBack';
import { useIOSKeyboardFix } from './hooks/useKeyboardHandling';
import { isBootstrapPlatformSuperAdmin } from './utils/platformAdminBootstrap';
import { getStorefrontBaseUrl } from './utils/storefrontUrl';
import { isPricingUiEnabled } from './utils/showPricing';
// Lazy load heavy pages for code splitting
const Products = lazy(() => import('./pages/Products'));
const TourProvider = lazy(() => import('./components/tour/TourProvider'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Terms = lazy(() => import('./pages/Terms'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const PayInvoice = lazy(() => import('./pages/PayInvoice'));
const ViewQuote = lazy(() => import('./pages/ViewQuote'));
const TrackJob = lazy(() => import('./pages/TrackJob'));
const TenantTrackLookup = lazy(() => import('./pages/TenantTrackLookup'));
const PublicFeedback = lazy(() => import('./pages/PublicFeedback'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Customers = lazy(() => import('./pages/Customers'));
const Dealers = lazy(() => import('./pages/Dealers'));
const DealerPricing = lazy(() => import('./pages/DealerPricing'));
const CustomerFeedback = lazy(() => import('./pages/CustomerFeedback'));
const Marketing = lazy(() => import('./pages/Marketing'));
const AskAI = lazy(() => import('./pages/AskAI'));
const Automations = lazy(() => import('./pages/Automations'));
const Vendors = lazy(() => import('./pages/Vendors'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Quotes = lazy(() => import('./pages/Quotes'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Reports = lazy(() => import('./pages/Reports'));
const ComplianceEvat = lazy(() => import('./pages/compliance/ComplianceEvat'));
const ComplianceVat = lazy(() => import('./pages/compliance/ComplianceVat'));
const ExportData = lazy(() => import('./pages/ExportData'));
const Materials = lazy(() => import('./pages/Materials'));
const Equipment = lazy(() => import('./pages/Equipment'));
const Merchandise = lazy(() => import('./pages/Merchandise'));
const Leads = lazy(() => import('./pages/Leads'));
const Users = lazy(() => import('./pages/Users'));
const Profile = lazy(() => import('./pages/Profile'));
const SettingsIndex = lazy(() => import('./pages/settings/SettingsIndex'));
const SettingsProfilePage = lazy(() => import('./pages/settings/SettingsProfilePage'));
const SettingsAppearancePage = lazy(() => import('./pages/settings/SettingsAppearancePage'));
const SettingsSmsPage = lazy(() => import('./pages/settings/SettingsSmsPage'));
const SettingsInvoicesReceiptsPage = lazy(() => import('./pages/settings/SettingsInvoicesReceiptsPage'));
const SettingsPaymentsPage = lazy(() => import('./pages/settings/SettingsPaymentsPage'));
const SettingsSabitoPartnersPage = lazy(() => import('./pages/settings/SettingsSabitoPartnersPage'));
const SettingsWhatsAppPage = lazy(() => import('./pages/settings/SettingsWhatsAppPage'));
const SettingsEmailPage = lazy(() => import('./pages/settings/SettingsEmailPage'));
const SettingsDeliveryRulesPage = lazy(() => import('./pages/settings/SettingsDeliveryRulesPage'));
const SettingsNotificationsPage = lazy(() => import('./pages/settings/SettingsNotificationsPage'));
const SettingsOrganizationPage = lazy(() => import('./pages/settings/SettingsOrganizationPage'));
const SettingsTrackingPage = lazy(() => import('./pages/settings/SettingsTrackingPage'));
const SettingsDeliveryPage = lazy(() => import('./pages/settings/SettingsDeliveryPage'));
const SettingsInventoryPage = lazy(() => import('./pages/settings/SettingsInventoryPage'));
const SettingsAiPage = lazy(() => import('./pages/settings/SettingsAiPage'));
const SettingsBillingPage = lazy(() => import('./pages/settings/SettingsBillingPage'));
const Plans = lazy(() => import('./pages/Plans'));
const Employees = lazy(() => import('./pages/Employees'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Accounting = lazy(() => import('./pages/Accounting'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Sales = lazy(() => import('./pages/Sales'));
const Orders = lazy(() => import('./pages/Orders'));
const Shops = lazy(() => import('./pages/Shops'));
const StudioLocations = lazy(() => import('./pages/StudioLocations'));
const Pharmacies = lazy(() => import('./pages/Pharmacies'));
const Drugs = lazy(() => import('./pages/Drugs'));
const Prescriptions = lazy(() => import('./pages/Prescriptions'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminTenants = lazy(() => import('./pages/admin/AdminTenants'));
const AdminLeads = lazy(() => import('./pages/admin/AdminLeads'));
const AdminJobs = lazy(() => import('./pages/admin/AdminJobs'));
const AdminExpenses = lazy(() => import('./pages/admin/AdminExpenses'));
const AdminRoles = lazy(() => import('./pages/admin/AdminRoles'));
const AdminBilling = lazy(() => import('./pages/admin/AdminBilling'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminHealth = lazy(() => import('./pages/admin/AdminHealth'));
const AdminOpsAssets = lazy(() => import('./pages/admin/AdminOpsAssets'));
const AdminAutomationsMessaging = lazy(() => import('./pages/admin/AdminAutomationsMessaging'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminOnlineStoreHeroes = lazy(() => import('./pages/admin/AdminOnlineStoreHeroes'));
const AdminOnlineStoreDomains = lazy(() => import('./pages/admin/AdminOnlineStoreDomains'));
const AdminOnlineStoreSetup = lazy(() => import('./pages/admin/AdminOnlineStoreSetup'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminSupportTickets = lazy(() => import('./pages/admin/AdminSupportTickets'));
const AdminSalesAgents = lazy(() => import('./pages/admin/AdminSalesAgents'));
const SabitoAdmin = lazy(() => import('./pages/admin/SabitoAdmin'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Deliveries = lazy(() => import('./pages/Deliveries'));
const StoreDashboard = lazy(() => import('./pages/StoreDashboard'));
const StoreSetup = lazy(() => import('./pages/StoreSetup'));
const StoreListings = lazy(() => import('./pages/StoreListings'));
const StoreListingEditor = lazy(() => import('./pages/StoreListingEditor'));
const StoreListingPublished = lazy(() => import('./pages/StoreListingPublished'));
const StoreServices = lazy(() => import('./pages/StoreServices'));
const StoreServiceEditor = lazy(() => import('./pages/StoreServiceEditor'));
const OnlineOrders = lazy(() => import('./pages/OnlineOrders'));
const StoreSettings = lazy(() => import('./pages/StoreSettings'));
const OnlineStore = lazy(() => import('./pages/OnlineStore'));

const WorkspaceRoot = () => {
  const { user, isSupportAccessActive, isDriver } = useAuth();
  const location = useLocation();

  if (user?.isPlatformAdmin && !isSupportAccessActive) {
    return <Navigate to="/admin" replace />;
  }

  if (isDriver && location.pathname !== '/deliveries' && location.pathname !== '/profile') {
    return <Navigate to="/deliveries" replace />;
  }

  return <MainLayout />;
};

const WorkspaceIndexRedirect = () => {
  const { isDriver } = useAuth();
  return <Navigate to={isDriver ? '/deliveries' : '/dashboard'} replace />;
};

const FeatureRoute = ({ featureKey, children, fallback = '/dashboard' }) => {
  const { hasFeature } = useAuth();
  if (typeof hasFeature === 'function' && !hasFeature(featureKey)) {
    return <Navigate to={fallback} replace />;
  }
  return children;
};

const HideForBootstrapSuperAdmin = ({ children }) => {
  const { user } = useAuth();
  if (Boolean(user?.isPlatformAdmin) && isBootstrapPlatformSuperAdmin(user)) {
    return <Navigate to="/admin" replace />;
  }
  return children;
};

const AdminWorkspaceRedirect = () => {
  const { user } = useAuth();
  const redirectTo = Boolean(user?.isPlatformAdmin) && isBootstrapPlatformSuperAdmin(user)
    ? '/admin'
    : '/admin/tasks';
  return <Navigate to={redirectTo} replace />;
};

const CampaignEditRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/marketing?campaign=edit&id=${encodeURIComponent(id || '')}`} replace />;
};

const StorefrontRedirect = ({ type }) => {
  const { storeSlug, productSlug } = useParams();
  const baseUrl = getStorefrontBaseUrl();
  const targetPath = type === 'product'
    ? `/store/${encodeURIComponent(storeSlug || '')}/products/${encodeURIComponent(productSlug || '')}`
    : type === 'store'
      ? `/store/${encodeURIComponent(storeSlug || '')}`
      : '/';

  window.location.replace(`${baseUrl}${targetPath}`);
  return <AppLoader label="Opening storefront..." />;
};

/** Backend Sabito SSO redirects here with ?token=JWT&success=true — must not hit * → /dashboard (strips query). */
const SsoCallbackScreen = () => (
  <AppLoader label="Signing you in..." />
);

// SSO Handler Component
const SSOHandler = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const { sabitoSSO, loginWithToken } = useAuth();
  const sabitoToken = searchParams.get('sabitoToken');
  const nexproToken = searchParams.get('token');

  useEffect(() => {
    if (sabitoToken) {
      // Remove token from URL
      searchParams.delete('sabitoToken');
      setSearchParams(searchParams, { replace: true });

      // Perform SSO login via POST endpoint
      sabitoSSO(sabitoToken)
        .then(() => {
          // SSO successful, user is now logged in
          // AuthContext will handle redirect
          window.location.href = '/dashboard';
        })
        .catch((error) => {
          console.error('SSO login failed:', error);
          // Redirect to login page on error
          window.location.href = '/login?error=sso_failed';
        });
    } else if (
      pathname === '/sso-callback' &&
      nexproToken &&
      searchParams.get('success') === 'true'
    ) {
      // Handle GET /sso callback with ABS token (only on this path — not /signup?token= invite links)
      searchParams.delete('token');
      searchParams.delete('success');
      setSearchParams(searchParams, { replace: true });

      localStorage.setItem('token', nexproToken);
      loginWithToken(nexproToken)
        .then(() => {
          window.location.href = '/dashboard';
        })
        .catch((error) => {
          console.error('SSO callback login failed:', error);
          window.location.href = '/login?error=sso_failed';
        });
    }
  }, [pathname, searchParams, sabitoSSO, loginWithToken, setSearchParams]);

  if (sabitoToken || (pathname === '/sso-callback' && nexproToken && searchParams.get('success') === 'true')) {
    return <SsoCallbackScreen />;
  }

  return null;
};

// Component to handle mobile gestures and fixes inside Router context
const MobileEnhancements = () => {
  // Enable swipe-back gesture for mobile navigation
  useSwipeBack();
  // Fix iOS keyboard viewport issues
  useIOSKeyboardFix();
  return null;
};

function AppContent() {
  // ForcePasswordChange (Complete Your Profile) shown only for admin-created users; excluded for invited users and platform admins
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <MobileEnhancements />
      <SSOHandler />
      <Suspense fallback={null}>
        <TourProvider>
        <Suspense fallback={<AppLoader />}>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/pay-invoice/:token" element={<PayInvoice />} />
            <Route path="/view-quote/:token" element={<ViewQuote />} />
            <Route path="/track-job/:token" element={<TrackJob />} />
            <Route path="/track/:tenantSlug" element={<TenantTrackLookup />} />
            <Route path="/feedback/:tenantSlug" element={<PublicFeedback />} />
            <Route path="/review/:tenantSlug" element={<PublicFeedback />} />
            <Route path="/marketplace" element={<StorefrontRedirect type="home" />} />
            <Route path="/store/:storeSlug/products/:productSlug" element={<StorefrontRedirect type="product" />} />
            <Route path="/store/:storeSlug" element={<StorefrontRedirect type="store" />} />
          <Route
            path="/onboarding"
            element={
              <PrivateRoute>
                <Onboarding />
              </PrivateRoute>
            }
          />
          
          <Route
            path="/"
            element={
              <PrivateRoute>
                <WorkspaceRoot />
              </PrivateRoute>
            }
          >
            <Route index element={<WorkspaceIndexRedirect />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="workspace" element={<Navigate to="/dashboard" replace />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="customers" element={<FeatureRoute featureKey="crm"><Customers /></FeatureRoute>} />
            <Route path="dealers" element={<FeatureRoute featureKey="dealersAccount"><Dealers /></FeatureRoute>} />
            <Route path="dealers/:id/prices" element={<FeatureRoute featureKey="dealersAccount"><DealerPricing /></FeatureRoute>} />
            <Route path="reviews" element={<FeatureRoute featureKey="crm"><CustomerFeedback /></FeatureRoute>} />
            <Route path="customer-feedback" element={<Navigate to="/reviews" replace />} />
            <Route path="marketing" element={<FeatureRoute featureKey="marketing"><RequireWorkspaceManager><Marketing /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="marketing/campaigns" element={<FeatureRoute featureKey="marketing"><RequireWorkspaceManager><Marketing /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="marketing/campaigns/new" element={<FeatureRoute featureKey="marketing"><RequireWorkspaceManager><Navigate to="/marketing?campaign=new" replace /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="marketing/campaigns/:id" element={<FeatureRoute featureKey="marketing"><RequireWorkspaceManager><Marketing /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="marketing/campaigns/:id/edit" element={<FeatureRoute featureKey="marketing"><RequireWorkspaceManager><CampaignEditRedirect /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="automations" element={<FeatureRoute featureKey="automations"><RequireWorkspaceManager><Automations /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="ask-ai" element={<AskAI />} />
            <Route path="vendors" element={<FeatureRoute featureKey="crm"><Vendors /></FeatureRoute>} />
            <Route path="jobs" element={<FeatureRoute featureKey="jobAutomation"><Jobs /></FeatureRoute>} />
            <Route path="deliveries" element={<FeatureRoute featureKey="deliveries"><Deliveries /></FeatureRoute>} />
            <Route path="sales" element={<FeatureRoute featureKey="paymentsExpenses"><Sales /></FeatureRoute>} />
            <Route path="sales/returns" element={<FeatureRoute featureKey="paymentsExpenses"><Sales /></FeatureRoute>} />
            <Route path="orders" element={<FeatureRoute featureKey="orders"><Orders /></FeatureRoute>} />
            <Route path="quotes" element={<FeatureRoute featureKey="quoteAutomation"><Quotes /></FeatureRoute>} />
            <Route path="invoices" element={<FeatureRoute featureKey="invoices"><Invoices /></FeatureRoute>} />
            <Route path="expenses" element={<FeatureRoute featureKey="expenses"><Expenses /></FeatureRoute>} />
            <Route path="pricing" element={<FeatureRoute featureKey="pricingTemplates"><Pricing /></FeatureRoute>} />
            <Route path="leads" element={<FeatureRoute featureKey="leadPipeline"><Leads /></FeatureRoute>} />
            <Route path="reports">
              <Route index element={<FeatureRoute featureKey="reports"><RequireWorkspaceManager><Navigate to="/reports/overview" replace /></RequireWorkspaceManager></FeatureRoute>} />
              <Route path="overview" element={<FeatureRoute featureKey="reports"><RequireWorkspaceManager><Reports /></RequireWorkspaceManager></FeatureRoute>} />
              <Route path="smart-report" element={<FeatureRoute featureKey="reports"><RequireWorkspaceManager><Reports /></RequireWorkspaceManager></FeatureRoute>} />
              <Route path="compliance" element={<Navigate to="/compliance/statements" replace />} />
            </Route>
            <Route path="compliance">
              <Route index element={<FeatureRoute featureKey="reports"><RequireWorkspaceManager><Navigate to="/compliance/statements" replace /></RequireWorkspaceManager></FeatureRoute>} />
              <Route path="statements" element={<FeatureRoute featureKey="reports"><RequireWorkspaceManager><Reports /></RequireWorkspaceManager></FeatureRoute>} />
              <Route path="vat" element={<FeatureRoute featureKey="reports"><RequireWorkspaceManager><ComplianceVat /></RequireWorkspaceManager></FeatureRoute>} />
              <Route path="evat" element={<FeatureRoute featureKey="reports"><RequireWorkspaceManager><ComplianceEvat /></RequireWorkspaceManager></FeatureRoute>} />
              <Route path="filing" element={<Navigate to="/compliance/vat" replace />} />
            </Route>
            <Route path="export-data" element={<FeatureRoute featureKey="advancedReporting"><RequireWorkspaceManager><ExportData /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="materials" element={<FeatureRoute featureKey="materials"><Materials /></FeatureRoute>} />
            <Route path="inventory" element={<Navigate to="/materials" replace />} />
            <Route path="assets" element={<Navigate to="/materials" replace />} />
            <Route path="equipment" element={<FeatureRoute featureKey="materials"><Equipment /></FeatureRoute>} />
            <Route path="merchandise" element={<FeatureRoute featureKey="materials"><RequireWorkspaceManager><Merchandise /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="employees" element={<FeatureRoute featureKey="payroll"><RequireWorkspaceManager><Employees /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="payroll" element={<FeatureRoute featureKey="payroll"><RequireWorkspaceManager><Payroll /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="accounting" element={<FeatureRoute featureKey="accounting"><RequireWorkspaceManager><Accounting /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="shops" element={<FeatureRoute featureKey="shopsModule"><RequireWorkspaceManager><Shops /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="store" element={<SabitoStoreRoute><StoreDashboard /></SabitoStoreRoute>} />
            <Route path="store/dashboard" element={<SabitoStoreRoute><StoreDashboard /></SabitoStoreRoute>} />
            <Route path="store/setup" element={<RequireWorkspaceManager><StoreSetup /></RequireWorkspaceManager>} />
            <Route path="store/listings" element={<SabitoStoreRoute><StoreListings /></SabitoStoreRoute>} />
            <Route path="store/listings/:productId/edit" element={<SabitoStoreRoute><StoreListingEditor /></SabitoStoreRoute>} />
            <Route path="store/listings/:productId/published" element={<SabitoStoreRoute><StoreListingPublished /></SabitoStoreRoute>} />
            <Route path="store/services" element={<SabitoStoreRoute><StoreServices /></SabitoStoreRoute>} />
            <Route path="store/services/:serviceId/edit" element={<SabitoStoreRoute><StoreServiceEditor /></SabitoStoreRoute>} />
            <Route path="store/orders" element={<SabitoStoreRoute><OnlineOrders /></SabitoStoreRoute>} />
            <Route path="store/settings" element={<RequireWorkspaceManager><StoreSettings /></RequireWorkspaceManager>} />
            <Route path="online-store" element={<OnlineStore />} />
            <Route path="online-store/orders" element={<OnlineOrders />} />
            <Route path="studio-locations" element={<FeatureRoute featureKey="studioLocationsModule"><RequireWorkspaceManager><StudioLocations /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="pharmacies" element={<FeatureRoute featureKey="pharmacyOps"><Pharmacies /></FeatureRoute>} />
            <Route path="products" element={<FeatureRoute featureKey="products"><Products /></FeatureRoute>} />
            <Route path="drugs" element={<FeatureRoute featureKey="pharmacyOps"><Drugs /></FeatureRoute>} />
            <Route path="prescriptions" element={<FeatureRoute featureKey="pharmacyOps"><Prescriptions /></FeatureRoute>} />
            <Route path="users" element={<FeatureRoute featureKey="roleManagement"><RequireWorkspaceManager><Users /></RequireWorkspaceManager></FeatureRoute>} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings">
              <Route index element={<SettingsIndex />} />
              <Route path="profile" element={<SettingsProfilePage />} />
              <Route path="appearance" element={<SettingsAppearancePage />} />
              <Route path="notifications" element={<SettingsNotificationsPage />} />
              <Route path="organization" element={<RequireWorkspaceManager><SettingsOrganizationPage /></RequireWorkspaceManager>} />
              <Route path="workflows" element={<Navigate to="/settings/invoices-receipts" replace />} />
              <Route path="tracking" element={<RequireWorkspaceManager><SettingsTrackingPage /></RequireWorkspaceManager>} />
              <Route path="delivery" element={<RequireWorkspaceManager><SettingsDeliveryPage /></RequireWorkspaceManager>} />
              <Route path="inventory" element={<RequireWorkspaceManager><SettingsInventoryPage /></RequireWorkspaceManager>} />
              <Route path="ai" element={<RequireWorkspaceManager><SettingsAiPage /></RequireWorkspaceManager>} />
            <Route path="billing" element={<RequireWorkspaceManager>{isPricingUiEnabled() ? <SettingsBillingPage /> : <Navigate to="/settings" replace />}</RequireWorkspaceManager>} />
            <Route path="sms" element={<RequireWorkspaceManager><SettingsSmsPage /></RequireWorkspaceManager>} />
            <Route path="invoices-receipts" element={<RequireWorkspaceManager><SettingsInvoicesReceiptsPage /></RequireWorkspaceManager>} />
            <Route path="payments" element={<RequireWorkspaceManager><SettingsPaymentsPage /></RequireWorkspaceManager>} />
            <Route path="sabito-partners" element={<RequireWorkspaceManager><SettingsSabitoPartnersPage /></RequireWorkspaceManager>} />
            <Route path="whatsapp" element={<RequireWorkspaceManager><SettingsWhatsAppPage /></RequireWorkspaceManager>} />
            <Route path="email" element={<RequireWorkspaceManager><SettingsEmailPage /></RequireWorkspaceManager>} />
            <Route path="delivery-rules" element={<RequireWorkspaceManager><SettingsDeliveryRulesPage /></RequireWorkspaceManager>} />
            </Route>
            <Route path="plans" element={<RequireWorkspaceManager>{isPricingUiEnabled() ? <Plans /> : <Navigate to="/dashboard" replace />}</RequireWorkspaceManager>} />
            <Route path="checkout" element={<RequireWorkspaceManager>{isPricingUiEnabled() ? <Checkout /> : <Navigate to="/dashboard" replace />}</RequireWorkspaceManager>} />
          </Route>

          <Route
            path="/admin"
            element={
              <PrivateRoute>
                <PlatformRoute>
                  <PlatformAdminPermissionsProvider>
                    <AdminLayout />
                  </PlatformAdminPermissionsProvider>
                </PlatformRoute>
              </PrivateRoute>
            }
          >
            <Route index element={<AdminOverview />} />
            <Route path="tenants" element={<AdminTenants />} />
            <Route path="customers" element={<HideForBootstrapSuperAdmin><AdminCustomers /></HideForBootstrapSuperAdmin>} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="leads" element={<HideForBootstrapSuperAdmin><AdminLeads /></HideForBootstrapSuperAdmin>} />
            <Route path="jobs" element={<HideForBootstrapSuperAdmin><AdminJobs /></HideForBootstrapSuperAdmin>} />
            <Route path="expenses" element={<HideForBootstrapSuperAdmin><AdminExpenses /></HideForBootstrapSuperAdmin>} />
            <Route path="billing" element={<AdminBilling />} />
            <Route path="roles" element={<Navigate to="/admin/settings?tab=roles" replace />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="health" element={<AdminHealth />} />
            <Route path="ops" element={<AdminOpsAssets />} />
            <Route path="automations" element={<AdminAutomationsMessaging />} />
            <Route path="support-tickets" element={<AdminSupportTickets />} />
            <Route path="sales-agents" element={<AdminSalesAgents />} />
            <Route path="sabito" element={<Navigate to="/admin/sabito/overview" replace />} />
            <Route path="sabito/overview" element={<SabitoAdmin section="overview" />} />
            <Route path="sabito/stores" element={<SabitoAdmin section="stores" />} />
            <Route path="sabito/orders" element={<SabitoAdmin section="orders" />} />
            <Route path="sabito/payments" element={<Navigate to="/admin/sabito/trade-assurance" replace />} />
            <Route path="sabito/trade-assurance" element={<SabitoAdmin section="trade-assurance" />} />
            <Route path="sabito/disputes" element={<SabitoAdmin section="disputes" />} />
            <Route path="sabito/customers" element={<SabitoAdmin section="customers" />} />
            <Route path="sabito/settings" element={<SabitoAdmin section="settings" />} />
            <Route path="online-store" element={<Navigate to="/admin/online-store/setup" replace />} />
            <Route path="online-store/setup" element={<AdminOnlineStoreSetup />} />
            <Route path="online-store/domains" element={<AdminOnlineStoreDomains />} />
            <Route path="online-store/heroes" element={<AdminOnlineStoreHeroes />} />
            <Route path="workspace" element={<AdminWorkspaceRedirect />} />
            <Route path="tasks" element={<HideForBootstrapSuperAdmin><Tasks /></HideForBootstrapSuperAdmin>} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
        </TourProvider>
      </Suspense>
    </Router>
  );
}

function GoogleAuthWrapper({ children }) {
  const { googleClientId, configLoaded } = usePublicConfig();
  useEffect(() => {
    const masked = googleClientId ? `${googleClientId.substring(0, 15)}...` : '(empty)';
    console.log('[App] GoogleOAuthProvider clientId:', masked);
  }, [googleClientId]);
  // Do not use key={googleClientId} here — it remounts the entire subtree (Router, auth), causing full-screen flashes.
  if (!configLoaded || !googleClientId) {
    return children;
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <GoogleSignInHost>
        {children}
      </GoogleSignInHost>
    </GoogleOAuthProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <PublicConfigProvider>
        <GoogleAuthWrapper>
          <ThemeProvider>
            <PWAInstallProvider>
              <AuthProvider>
                <BrandingProvider>
                  <HintModeProvider>
                    <AppContent />
                    <PWAInstallBanner />
                    <PWAUpdatePrompt />
                  </HintModeProvider>
                </BrandingProvider>
              </AuthProvider>
            </PWAInstallProvider>
          </ThemeProvider>
        </GoogleAuthWrapper>
      </PublicConfigProvider>
    </ErrorBoundary>
  );
}

export default App;


