import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MiniSparkline } from '@/components/dashboard/MiniSparkline';
import { buildDashboardInsight } from '@/utils/dashboardInsights';
import { formatStatusLabel, getSaleStatusColors } from '@/utils/formatLabels';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import {
  AppBottomSheet,
  APP_SHEET_HEIGHT_COMPACT,
  SheetMenuRow,
} from '@/components/AppBottomSheet';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { dashboardService } from '@/services/dashboardService';
import { assistantService } from '@/services/assistantService';
import { authService } from '@/services/auth';
import { CURRENCY, ORDER_STATUSES, resolveBusinessType, SHOP_TYPES, isQuotesEnabledForTenant } from '@/constants';
import { formatCurrency } from '@/utils/formatCurrency';
import { saleService } from '@/services/saleService';
import { isOnboardingComplete } from '@/utils/onboardingStatus';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { ListErrorState, ListLoadingState } from '@/components/ListScreenStates';
import { getApiErrorMessage } from '@/utils/parseApiListResponse';
import { QUERY_STALE } from '@/utils/queryInvalidation';
import { BRAND_GREEN } from '@/constants/brand';
import { FontFamily, FontSize } from '@/constants/typography';
import { useIsStoreSetupRoute } from '@/hooks/useIsStoreSetupRoute';
import { useOnlineStoreOrderAttention } from '@/hooks/useOnlineStoreOrderAttention';
import { getCustomerName, getOrderNumber } from '@/utils/marketplaceOrderStatus';
import { useFocusAreas } from '@/hooks/useFocusAreas';
import { getFocusAreaDefinition } from '@/constants/focusAreas';
import { hasSeenFocusAreaPrompt, markFocusAreaPromptSeen } from '@/utils/focusAreaPrompt';

type FilterType = 'today' | 'week' | 'month' | 'year';
type ComparisonMetric = {
  percentage?: number;
  isPositive?: boolean;
  isNegative?: boolean;
  isNeutral?: boolean;
};

function formatDateRange(filterType: FilterType): { start: string; end: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  let start: Date;

  if (filterType === 'today') {
    start = new Date(today);
  } else if (filterType === 'week') {
    start = new Date(today);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
  } else if (filterType === 'month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else {
    start = new Date(today.getFullYear(), 0, 1);
  }
  start.setHours(0, 0, 0, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatComparisonPercent(comparison?: ComparisonMetric): string {
  const percentage = Math.abs(Number(comparison?.percentage ?? 0));
  const formatted = Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(1);
  return `${formatted}%`;
}

function getComparisonColor(comparison: ComparisonMetric | undefined, metric: 'default' | 'expenses'): string {
  if (!comparison || comparison.isNeutral) return '#6b7280';
  const isGood = metric === 'expenses' ? comparison.isNegative : comparison.isPositive;
  return isGood ? '#16a34a' : '#dc2626';
}

function getComparisonIcon(comparison?: ComparisonMetric): AppIconName {
  if (comparison?.isNegative) return 'trending-down';
  return 'trending-up';
}

function getTrendDirection(comparison?: ComparisonMetric): 'up' | 'down' | 'flat' {
  if (!comparison || comparison.isNeutral) return 'flat';
  if (comparison.isPositive) return 'up';
  if (comparison.isNegative) return 'down';
  return 'flat';
}

function getFilterLabel(filterType: FilterType): string {
  if (filterType === 'today') return 'Today';
  if (filterType === 'week') return 'This Week';
  if (filterType === 'month') return 'This Month';
  return 'This Year';
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const MAX_QUICK_ACTIONS = 3;

type QuickAction = {
  label: string;
  icon: AppIconName;
  route: string;
  color: string;
};

type RecentSale = {
  id: string;
  saleNumber?: string;
  total: number;
  createdAt: string;
  status?: string;
  customer?: { name?: string; phone?: string } | null;
};

type AiInsightResponse = {
  title: string;
  body: string;
};

function iconTint(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}1A`;
  return 'rgba(22, 101, 52, 0.1)';
}

function parseAiInsightResponse(message: string): AiInsightResponse | null {
  const trimmed = String(message || '')
    .trim()
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  if (!trimmed) return null;

  const parseInsightJson = (raw: string): AiInsightResponse | null => {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') {
        return parseInsightJson(parsed);
      }
      const candidate = parsed?.title || parsed?.body
        ? parsed
        : parsed?.message && typeof parsed.message === 'string'
          ? parseInsightJson(parsed.message)
          : null;
      if (!candidate) return null;
      const insight = candidate as Partial<AiInsightResponse>;
      if (insight.title && insight.body) {
        return {
          title: String(insight.title).replace(/^["'`]+|["'`]+$/g, '').trim(),
          body: String(insight.body).replace(/^["'`]+|["'`]+$/g, '').trim(),
        };
      }
    } catch {
      return null;
    }
    return null;
  };

  const directJson = parseInsightJson(trimmed);
  if (directJson) return directJson;

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const extractedJson = parseInsightJson(jsonMatch[0]);
    if (extractedJson) return extractedJson;
  }

  const quotedTitleMatch = trimmed.match(/["']?title["']?\s*:\s*["']([^"']+)["']/i);
  const quotedBodyMatch = trimmed.match(/["']?(?:body|insight)["']?\s*:\s*["']([^"']+)["']/i);
  if (quotedTitleMatch && quotedBodyMatch) {
    return {
      title: quotedTitleMatch[1].trim(),
      body: quotedBodyMatch[1].trim(),
    };
  }

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
  const titleLine = lines.find((line) => /^title:/i.test(line));
  const bodyLine = lines.find((line) => /^(body|insight):/i.test(line));
  if (titleLine && bodyLine) {
    return {
      title: titleLine.replace(/^title:\s*/i, '').trim(),
      body: bodyLine.replace(/^(body|insight):\s*/i, '').trim(),
    };
  }

  if (/^\{[\s\S]*["']title["'][\s\S]*["']body["'][\s\S]*\}$/.test(trimmed)) {
    return null;
  }

  return {
    title: 'AI business insight',
    body: trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed,
  };
}

function getDueDateBadge(
  dueDate: string | null | undefined
): { label: string; bg: string; text: string; border: string } {
  if (!dueDate) {
    return { label: 'No due date', bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
  }

  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return { label: 'No due date', bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
  }

  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const absHours = Math.abs(diffHours);

  if (diffHours < 0) {
    const daysOverdue = Math.max(1, Math.round(absHours / 24));
    return {
      label: `Overdue ${daysOverdue}d`,
      bg: '#fee2e2',
      text: '#b91c1c',
      border: '#fca5a5',
    };
  }

  if (diffHours <= 24) {
    return {
      label: `Due in ${Math.max(1, diffHours)}h`,
      bg: '#ffedd5',
      text: '#c2410c',
      border: '#fdba74',
    };
  }

  const days = Math.max(1, Math.round(diffHours / 24));
  return {
    label: `Due in ${days}d`,
    bg: '#dcfce7',
    text: BRAND_GREEN,
    border: '#86efac',
  };
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user, activeTenant, activeTenantId, wasInvited, suppressAppGuidance, refreshAuth, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg, resolvedTheme } = useScreenColors();
  const inStoreSetup = useIsStoreSetupRoute();

  const [filterType, setFilterType] = useState<FilterType>('month');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const dateRange = useMemo(() => formatDateRange(filterType), [filterType]);

  const onboardingCompleted = useMemo(() => isOnboardingComplete(activeTenant), [activeTenant]);

  const showSetupBanner = useMemo(
    () => !onboardingCompleted && !wasInvited && !suppressAppGuidance,
    [onboardingCompleted, wasInvited, suppressAppGuidance]
  );
  const showVerifyEmailBanner = useMemo(() => Boolean(user && !user.emailVerifiedAt), [user, user?.emailVerifiedAt]);

  const { focusAreas, hasChosen: hasChosenFocusAreas, isLoading: focusAreasLoading } = useFocusAreas();
  const [focusPromptDismissedThisSession, setFocusPromptDismissedThisSession] = useState(false);
  const [seenFocusPromptOnDevice, setSeenFocusPromptOnDevice] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    hasSeenFocusAreaPrompt().then((seen) => {
      if (mounted) setSeenFocusPromptOnDevice(seen);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const showFocusAreaPrompt =
    onboardingCompleted
    && !focusAreasLoading
    && !hasChosenFocusAreas
    && seenFocusPromptOnDevice === false
    && !focusPromptDismissedThisSession;
  const dismissFocusAreaPrompt = useCallback(() => {
    setFocusPromptDismissedThisSession(true);
    void markFocusAreaPromptSeen();
  }, []);

  const handleResendVerification = useCallback(async () => {
    setResendLoading(true);
    try {
      await authService.resendVerification();
      Alert.alert('Done', 'Verification email sent. Check your inbox.');
      await refreshAuth();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to send. Try again later.';
      Alert.alert('Error', msg);
    } finally {
      setResendLoading(false);
    }
  }, [refreshAuth]);

  const { data: overviewResponse, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      activeTenantId,
      activeShopId,
      activeStudioLocationId,
      dateRange.start,
      dateRange.end,
      filterType,
    ],
    queryFn: () =>
      dashboardService.getOverview(dateRange.start, dateRange.end, filterType),
    enabled: !!activeTenantId && scopeReady && !inStoreSetup,
    // Dashboard data can be stale for 2 minutes (frequent updates but not real-time critical)
    staleTime: QUERY_STALE.TRANSACTIONAL,
    // Keep in cache for 1 hour
    gcTime: 60 * 60 * 1000,
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const businessType = activeTenant?.businessType ?? 'printing_press';
  const resolvedType = resolveBusinessType(businessType);
  const isShop = resolvedType === 'shop';
  const isPharmacy = resolvedType === 'pharmacy';
  const isStudio = resolvedType === 'studio';
  const shopType = activeTenant?.metadata?.shopType;
  const isRestaurant = shopType === SHOP_TYPES.RESTAURANT;
  const canCreateQuote = hasFeature('quoteAutomation') && isQuotesEnabledForTenant(businessType, shopType);
  const showOnlineStore = (isShop || isPharmacy || isStudio) && hasFeature('paymentsExpenses');

  const {
    showBanner: showOnlineStoreBanner,
    pendingOrderCount: onlinePendingCount,
    latestOrder: latestOnlineOrder,
    hasStoreSettings,
  } = useOnlineStoreOrderAttention({ enabled: showOnlineStore });

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  const { data: kitchenOrdersResponse } = useQuery({
    queryKey: ['orders', 'dashboard-count', activeTenantId, activeShopId, activeStudioLocationId, todayIso],
    queryFn: () =>
      saleService.getOrders({
        activeOrders: true,
        startDate: todayIso,
        endDate: todayIso,
        limit: 100,
      }),
    enabled: !!activeTenantId && isRestaurant && hasFeature('orders') && scopeReady && !inStoreSetup,
    staleTime: 30 * 1000,
    refetchInterval: inStoreSetup ? false : 30 * 1000,
  });

  const kitchenOrderCounts = useMemo(() => {
    const list = (kitchenOrdersResponse?.data || []) as Array<{ orderStatus?: string }>;
    return {
      received: list.filter((o) => o.orderStatus === ORDER_STATUSES.RECEIVED).length,
      preparing: list.filter((o) => o.orderStatus === ORDER_STATUSES.PREPARING).length,
      ready: list.filter((o) => o.orderStatus === ORDER_STATUSES.READY).length,
      total: list.length,
    };
  }, [kitchenOrdersResponse]);

  // Match web app pattern: overviewResponse?.data || overviewResponse
  const overview = overviewResponse?.data || overviewResponse;
  const summary = overview?.summary ?? {};
  const currentMonth = overview?.currentMonth ?? overview?.thisMonth ?? {};
  const filteredPeriod = overview?.filteredPeriod;
  const comparison = overview?.comparison ?? {};
  const recentJobs = overview?.recentJobs ?? [];
  const shopData = overview?.shopData ?? {};

  const revenue = filteredPeriod?.revenue ?? (isShop || isPharmacy ? shopData.monthSales : currentMonth.revenue) ?? 0;
  const expenses = filteredPeriod?.expenses ?? currentMonth.expenses ?? 0;
  const profit = filteredPeriod?.profit ?? currentMonth.profit ?? revenue - expenses;
  const lowStockItems = shopData.lowStockItems ?? 0;

  const quickActions = useMemo(() => {
    const actions: QuickAction[] = [];
    if (isShop || isPharmacy) {
      if (isRestaurant && hasFeature('orders')) {
        actions.push({ label: 'Kitchen orders', icon: 'cutlery', route: '/(tabs)/orders', color: '#ea580c' });
      } else {
        actions.push({ label: 'Add customer', icon: 'user-plus', route: '/(tabs)/customers?add=1', color: colors.tint });
      }
    }
    if (isStudio) {
      actions.push({ label: 'Add customer', icon: 'user-plus', route: '/(tabs)/customers?add=1', color: colors.tint });
      if (canCreateQuote) {
        actions.push({ label: 'New quote', icon: 'file-text-o', route: '/(tabs)/quotes', color: '#2563eb' });
      }
    }
    if (hasFeature('expenses')) {
      actions.push({ label: 'Add expense', icon: 'minus-circle', route: '/(tabs)/expenses', color: '#ea580c' });
    }
    if (showOnlineStore && hasStoreSettings) {
      actions.push({ label: 'Store orders', icon: 'shopping-cart', route: '/(tabs)/store?section=orders', color: '#7c3aed' });
    }
    if (hasFeature('leadPipeline')) {
      actions.push({ label: 'Add lead', icon: 'user-plus', route: '/(tabs)/leads', color: '#0891b2' });
    }
    if (hasFeature('deliveries')) {
      actions.push({ label: 'Assign delivery', icon: 'truck', route: '/(tabs)/deliveries', color: '#0d9488' });
    }
    if (isShop && hasFeature('dealersAccount')) {
      actions.push({ label: 'Dealer order', icon: 'briefcase', route: '/(tabs)/dealers?add=1', color: '#7c3aed' });
    }

    // Promote whichever of these match the user's "what matters most to you" picks, in pick order.
    if (focusAreas.length === 0) return actions.slice(0, MAX_QUICK_ACTIONS);
    const routeBase = (route: string) => route.split('?')[0];
    const rank = new Map<string, number>();
    focusAreas.forEach((id, index) => {
      const def = getFocusAreaDefinition(id);
      if (def && !rank.has(routeBase(def.route))) rank.set(routeBase(def.route), index);
    });
    const ranked = [...actions].sort((a, b) => {
      const ra = rank.get(routeBase(a.route)) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(routeBase(b.route)) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
    return ranked.slice(0, MAX_QUICK_ACTIONS);
  }, [isShop, isPharmacy, isStudio, isRestaurant, canCreateQuote, hasFeature, colors.tint, showOnlineStore, hasStoreSettings, focusAreas]);

  const recentSales = useMemo(
    () => (shopData.recentSales ?? []) as RecentSale[],
    [shopData.recentSales]
  );

  const dashboardInsight = useMemo(
    () =>
      buildDashboardInsight({
        revenue,
        expenses,
        profit,
        comparison,
        lowStockItems,
        isShop,
        isPharmacy,
      }),
    [revenue, expenses, profit, comparison, lowStockItems, isShop, isPharmacy]
  );

  const { data: aiDashboardInsight, isFetching: isFetchingAiInsight } = useQuery({
    queryKey: [
      'dashboard',
      'ai-insight',
      'v3-analysis',
      activeTenantId,
      activeShopId,
      activeStudioLocationId,
      filterType,
      revenue,
      expenses,
      profit,
      summary.newCustomers,
      lowStockItems,
    ],
    queryFn: async () => {
      const response = await assistantService.askAnalysis('Summarize performance', {
        intent: 'performance_summary',
        pageContext: 'dashboard',
        period: filterType,
        startDate: dateRange.start,
        endDate: dateRange.end,
        periodLabel: getFilterLabel(filterType),
      });
      if (response?.insight?.title && response?.insight?.body) {
        return {
          title: String(response.insight.title).trim(),
          body: String(response.insight.body).trim(),
        };
      }
      return parseAiInsightResponse(response?.message ?? response?.answerMarkdown ?? '');
    },
    enabled: !!activeTenantId && !isLoading && !!overviewResponse && !inStoreSetup,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const visibleDashboardInsight = aiDashboardInsight ?? dashboardInsight;

  const showPeriodPicker = useCallback(() => {
    setPeriodOpen(true);
  }, []);

  const periodOptions: { value: FilterType; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' },
  ];

  const revenueColor = colors.tint;
  const newCustomersColor = '#7c3aed';
  const profitColor = profit >= 0 ? '#16a34a' : '#dc2626';
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const greeting = `${getTimeGreeting()}${firstName ? `, ${firstName}` : ''} 👋`;
  const comparisonLabel = comparison?.periodLabel ?? comparison?.label ?? 'vs previous period';

  const overviewErrorMessage = useMemo(
    () => getApiErrorMessage(error, 'Could not load your dashboard. Pull down to try again.'),
    [error]
  );

  if (isLoading && !overviewResponse) {
    return (
      <ScreenShell>
        <ListLoadingState message="Loading dashboard..." />
      </ScreenShell>
    );
  }

  if (isError && !overviewResponse) {
    return (
      <ScreenShell>
        <ListErrorState
          title="Dashboard unavailable"
          message={overviewErrorMessage}
          onRetry={() => refetch()}
        />
      </ScreenShell>
    );
  }

  if (!activeTenantId) {
    return (
      <ScreenShell style={[styles.center, { padding: 24 }]}>
        <Text style={[styles.welcome, { color: textColor, marginBottom: 8 }]}>
          No Active Workspace
        </Text>
        <Text style={[styles.subtitle, { color: mutedColor, textAlign: 'center' }]}>
          Please select a workspace from Settings to view your dashboard.
        </Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell style={styles.container}>
    <ScrollView
      style={styles.scrollFlex}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.tint} />
      }
    >
      <View style={styles.greetingRow}>
        <View style={styles.greetingTextCol}>
          <Text style={[styles.welcome, { color: textColor }]}>{greeting}</Text>
          <Text style={[styles.dashboardSubtitle, { color: mutedColor }]}>
            Here's your business overview for {getFilterLabel(filterType).toLowerCase()}
          </Text>
        </View>
        <Pressable
          onPress={showPeriodPicker}
          style={({ pressed }) => [
            styles.periodPill,
            { backgroundColor: cardBg, borderColor },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.periodPillText, { color: textColor }]}>{getFilterLabel(filterType)}</Text>
          <AppIcon name="chevron-down" size={16} color={mutedColor} />
        </Pressable>
      </View>

      {/* Verify email banner (matches web MainLayout) */}
      {showVerifyEmailBanner && (
        <View style={styles.verifyBanner}>
          <View style={styles.verifyBannerTop}>
            <AppIcon name="mail-outline" size={20} color="#b45309" />
            <View style={styles.verifyBannerText}>
              <Text style={styles.verifyBannerTitle}>Verify your email</Text>
              <Text style={styles.verifyBannerSubtitle}>
                We sent a link to your email. Click it to verify, or resend below.
              </Text>
            </View>
          </View>
          <Pressable
            style={styles.verifyBannerButton}
            onPress={handleResendVerification}
            disabled={resendLoading}
          >
            {resendLoading ? (
              <ActivityIndicator size="small" color="#b45309" />
            ) : (
              <Text style={styles.verifyBannerButtonText}>Resend link</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Complete onboarding banner (mobile-friendly card) */}
      {showSetupBanner && (
        <Pressable
          style={[styles.setupBanner, { backgroundColor: cardBg, borderColor }]}
          onPress={() => router.push('/onboarding' as any)}
        >
          <View style={styles.setupBannerIcon}>
            <AppIcon name="sparkles" size={22} color={colors.tint} />
          </View>
          <View style={styles.setupBannerText}>
            <Text style={styles.setupBannerTitle}>Finish setting up your business</Text>
            <Text style={styles.setupBannerSubtitle}>
              Complete your business profile to get the most out of African Business Suite.
            </Text>
          </View>
          <AppIcon name="chevron-forward" size={18} color={mutedColor} />
        </Pressable>
      )}

      {/* One-time nudge toward the focus-areas picker — never blocks, always dismissible */}
      {showFocusAreaPrompt && (
        <Pressable
          style={[styles.setupBanner, { backgroundColor: cardBg, borderColor }]}
          onPress={() => router.push('/focus-areas' as never)}
        >
          <View style={styles.setupBannerIcon}>
            <AppIcon name="sparkles" size={22} color={colors.tint} />
          </View>
          <View style={styles.setupBannerText}>
            <Text style={styles.setupBannerTitle}>What matters most to you?</Text>
            <Text style={styles.setupBannerSubtitle}>
              Pick your focus and we'll tailor your menu and dashboard to it.
            </Text>
          </View>
          <Pressable
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation();
              dismissFocusAreaPrompt();
            }}
          >
            <AppIcon name="x" size={18} color={mutedColor} />
          </Pressable>
        </Pressable>
      )}

      {/* Stats cards */}
      <View style={styles.statsGrid}>
        <StatMetricCard
          label="Revenue"
          value={formatCurrency(revenue)}
          icon="money"
          iconColor={revenueColor}
          comparison={comparison.revenue}
          comparisonLabel={comparisonLabel}
          metric="default"
          cardBg={cardBg}
          borderColor={borderColor}
          textColor={textColor}
          mutedColor={mutedColor}
        />
        <StatMetricCard
          label="Expenses"
          value={formatCurrency(expenses)}
          icon="minus-circle"
          iconColor="#dc2626"
          comparison={comparison.expenses}
          comparisonLabel={comparisonLabel}
          metric="expenses"
          cardBg={cardBg}
          borderColor={borderColor}
          textColor={textColor}
          mutedColor={mutedColor}
        />
        <StatMetricCard
          label="Profit"
          value={formatCurrency(profit)}
          icon="line-chart"
          iconColor={profitColor}
          comparison={comparison.profit}
          comparisonLabel={comparisonLabel}
          metric="default"
          cardBg={cardBg}
          borderColor={borderColor}
          textColor={textColor}
          mutedColor={mutedColor}
        />
        {(isShop || isPharmacy) && (
          <StatMetricCard
            label="New customers"
            value={String(summary.newCustomers ?? 0)}
            icon="user-plus"
            iconColor={newCustomersColor}
            comparison={comparison.newCustomers}
            comparisonLabel={comparisonLabel}
            metric="default"
            cardBg={cardBg}
            borderColor={borderColor}
            textColor={textColor}
            mutedColor={mutedColor}
          />
        )}
      </View>

      {/* AI insight */}
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/(tabs)/chat',
            params: {
              prompt: 'Explain my dashboard insight and what I should do next.',
              pageContext: 'dashboard',
            },
          } as never)
        }
        style={({ pressed }) => [
          styles.insightCard,
          { backgroundColor: resolvedTheme === 'dark' ? '#14532d' : '#ecfdf5', borderColor: resolvedTheme === 'dark' ? colors.tint : '#bbf7d0' },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.insightIconCircle, { backgroundColor: colors.tint }]}>
          <AppIcon name="brain" size={20} color="#fff" />
        </View>
        <View style={styles.insightTextCol}>
          <Text style={[styles.insightEyebrow, { color: colors.tint }]}>AI Insight</Text>
          <Text style={[styles.insightTitle, { color: textColor }]} numberOfLines={2}>
            {isFetchingAiInsight ? 'AI is reviewing your numbers' : visibleDashboardInsight.title}
          </Text>
          <Text style={[styles.insightBody, { color: mutedColor }]} numberOfLines={2}>
            {isFetchingAiInsight ? 'Generating a quick business insight from your latest dashboard data.' : visibleDashboardInsight.body}
          </Text>
        </View>
        <View style={[styles.insightCta, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.insightCtaText, { color: colors.tint }]}>View</Text>
          <AppIcon name="chevron-right" size={14} color={colors.tint} />
        </View>
      </Pressable>

      {showOnlineStoreBanner && (
        <Pressable
          onPress={() => router.push('/(tabs)/store?section=orders' as never)}
          style={({ pressed }) => [
            styles.onlineStoreBanner,
            {
              backgroundColor: resolvedTheme === 'dark' ? '#422006' : '#fffbeb',
              borderColor: resolvedTheme === 'dark' ? '#92400e' : '#fde68a',
            },
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.onlineStoreIcon, { backgroundColor: colors.tint }]}>
            <AppIcon name="shopping-cart" size={18} color="#fff" />
          </View>
          <View style={styles.onlineStoreTextCol}>
            <Text style={[styles.onlineStoreTitle, { color: textColor }]}>
              {onlinePendingCount} online {onlinePendingCount === 1 ? 'order needs' : 'orders need'} attention
            </Text>
            {latestOnlineOrder ? (
              <Text style={[styles.onlineStoreBody, { color: mutedColor }]} numberOfLines={1}>
                Latest: {getOrderNumber(latestOnlineOrder)} · {getCustomerName(latestOnlineOrder)}
              </Text>
            ) : (
              <Text style={[styles.onlineStoreBody, { color: mutedColor }]}>
                Review and fulfill pending online store orders
              </Text>
            )}
          </View>
          <AppIcon name="chevron-right" size={16} color={colors.tint} />
        </Pressable>
      )}

      {isRestaurant && hasFeature('orders') && kitchenOrderCounts.total > 0 && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: textColor, marginBottom: 0 }]}>Kitchen today</Text>
            <Pressable onPress={() => router.push('/(tabs)/orders' as never)} hitSlop={8}>
              <Text style={[styles.sectionLink, { color: colors.tint }]}>View all</Text>
            </Pressable>
          </View>
          <View style={styles.kitchenStatsRow}>
            <Pressable
              onPress={() => router.push('/(tabs)/orders' as never)}
              style={[styles.kitchenStatCard, { backgroundColor: cardBg, borderColor }]}
            >
              <Text style={[styles.kitchenStatValue, { color: '#ca8a04' }]}>{kitchenOrderCounts.received}</Text>
              <Text style={[styles.kitchenStatLabel, { color: mutedColor }]}>Received</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/orders' as never)}
              style={[styles.kitchenStatCard, { backgroundColor: cardBg, borderColor }]}
            >
              <Text style={[styles.kitchenStatValue, { color: '#2563eb' }]}>{kitchenOrderCounts.preparing}</Text>
              <Text style={[styles.kitchenStatLabel, { color: mutedColor }]}>Preparing</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/orders' as never)}
              style={[styles.kitchenStatCard, { backgroundColor: cardBg, borderColor }]}
            >
              <Text style={[styles.kitchenStatValue, { color: '#16a34a' }]}>{kitchenOrderCounts.ready}</Text>
              <Text style={[styles.kitchenStatLabel, { color: mutedColor }]}>Ready</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Quick actions */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: textColor, marginBottom: 0 }]}>Quick Actions</Text>
        <Pressable onPress={() => router.push('/(tabs)/more' as never)} hitSlop={8}>
          <Text style={[styles.sectionLink, { color: colors.tint }]}>View all</Text>
        </Pressable>
      </View>
      <View style={styles.actionsRow}>
        {quickActions.map((action) => (
          <Pressable
            key={action.label}
            onPress={() => router.push(action.route as never)}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: cardBg, borderColor },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: iconTint(action.color) }]}>
              <AppIcon name={action.icon} size={22} color={action.color} />
            </View>
            <Text style={[styles.actionLabel, { color: textColor }]} numberOfLines={2}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Recent transactions (retail) */}
      {(isShop || isPharmacy) && recentSales.length > 0 && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: textColor, marginBottom: 0 }]}>Recent Transactions</Text>
            <Pressable onPress={() => router.push('/(tabs)/sales' as never)} hitSlop={8}>
              <Text style={[styles.sectionLink, { color: colors.tint }]}>View all</Text>
            </Pressable>
          </View>
          <View style={[styles.transactionsCard, { backgroundColor: cardBg, borderColor }]}>
            {recentSales.slice(0, 5).map((sale, index) => {
              const statusColors = getSaleStatusColors(sale.status ?? 'completed');
              const statusLabel = sale.status === 'completed' ? 'Paid' : formatStatusLabel(sale.status);
              return (
                <Pressable
                  key={sale.id}
                  onPress={() => router.push(`/sale/${sale.id}` as never)}
                  style={({ pressed }) => [
                    styles.transactionRow,
                    index < Math.min(recentSales.length, 5) - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.transactionIcon, { backgroundColor: iconTint(colors.tint) }]}>
                    <AppIcon name="shopping-cart" size={18} color={colors.tint} />
                  </View>
                  <View style={styles.transactionInfo}>
                    <Text style={[styles.transactionTitle, { color: textColor }]} numberOfLines={1}>
                      Sale to {sale.customer?.name ?? 'Walk-in'}
                    </Text>
                    <Text style={[styles.transactionMeta, { color: mutedColor }]} numberOfLines={1}>
                      {sale.saleNumber ? `${sale.saleNumber} · ` : ''}
                      {formatShortDate(sale.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.transactionRight}>
                    <Text style={[styles.transactionAmount, { color: textColor }]}>
                      {formatCurrency(sale.total)}
                    </Text>
                    <View style={styles.transactionStatusRow}>
                      <View style={[styles.statusDot, { backgroundColor: statusColors.text }]} />
                      <Text style={[styles.transactionStatus, { color: statusColors.text }]}>{statusLabel}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Recent jobs (studio) */}
      {isStudio && recentJobs.length > 0 && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: textColor, marginBottom: 0 }]}>Recent Activity</Text>
            <Pressable onPress={() => router.push('/(tabs)/jobs' as never)} hitSlop={8}>
              <Text style={[styles.sectionLink, { color: colors.tint }]}>View all</Text>
            </Pressable>
          </View>
          <View style={[styles.jobsCard, { backgroundColor: cardBg, borderColor }]}>
            {recentJobs.slice(0, 5).map((job: { id: string; title: string; jobNumber?: string; status: string; dueDate?: string; customer?: { name: string } }) => (
              <Pressable
                key={job.id}
                style={({ pressed }) => [styles.jobRow, pressed && styles.pressed]}
                onPress={() => router.push(`/(tabs)/jobs?openJobId=${encodeURIComponent(job.id)}` as any)}
              >
                <View style={styles.jobInfo}>
                  <Text style={[styles.jobTitle, { color: textColor }]} numberOfLines={1}>
                    {job.jobNumber || job.title}
                  </Text>
                  <Text style={[styles.jobCustomer, { color: mutedColor }]} numberOfLines={1}>
                    {job.customer?.name ?? '—'}
                  </Text>
                </View>
                <View style={styles.jobRight}>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: getDueDateBadge(job.dueDate).bg,
                        borderColor: getDueDateBadge(job.dueDate).border,
                      },
                    ]}
                  >
                    <Text style={[styles.statusBadgeText, { color: getDueDateBadge(job.dueDate).text }]}>
                      {getDueDateBadge(job.dueDate).label}
                    </Text>
                  </View>
                  <AppIcon name="chevron-right" size={14} color={mutedColor} />
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

    </ScrollView>
      <AppBottomSheet
        visible={periodOpen}
        title="Period"
        onClose={() => setPeriodOpen(false)}
        height={APP_SHEET_HEIGHT_COMPACT}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
      >
        {periodOptions.map((opt) => {
          const selected = filterType === opt.value;
          return (
            <SheetMenuRow
              key={opt.value}
              label={opt.label}
              active={selected}
              onPress={() => {
                setFilterType(opt.value);
                setPeriodOpen(false);
              }}
              trailing={selected ? <AppIcon name="check" size={18} color="#fff" /> : <View />}
            />
          );
        })}
      </AppBottomSheet>
    </ScreenShell>
  );
}
type StatMetricCardProps = {
  label: string;
  value: string;
  icon: AppIconName;
  iconColor: string;
  comparison?: ComparisonMetric;
  comparisonLabel: string;
  metric: 'default' | 'expenses';
  cardBg: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
};

function StatMetricCard({
  label,
  value,
  icon,
  iconColor,
  comparison,
  comparisonLabel,
  metric,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
}: StatMetricCardProps) {
  const comparisonColor = getComparisonColor(comparison, metric);
  const sparkColor = metric === 'expenses' && comparison?.isPositive ? '#dc2626' : comparisonColor;

  return (
    <View style={[statStyles.card, { backgroundColor: cardBg, borderColor }]}>
      <View style={statStyles.topRow}>
        <Text style={[statStyles.label, { color: mutedColor }]}>{label}</Text>
        <View style={[statStyles.iconCircle, { backgroundColor: iconTint(iconColor) }]}>
          <AppIcon name={icon} size={18} color={iconColor} />
        </View>
      </View>
      <Text style={[statStyles.value, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <View style={statStyles.comparisonRow}>
        <AppIcon name={getComparisonIcon(comparison)} size={12} color={comparisonColor} />
        <Text style={[statStyles.comparisonText, { color: comparisonColor }]} numberOfLines={1}>
          {formatComparisonPercent(comparison)} {comparisonLabel}
        </Text>
      </View>
      <MiniSparkline color={sparkColor === '#6b7280' ? iconColor : sparkColor} trend={getTrendDirection(comparison)} />
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 148,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 10,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  comparisonText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
});

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  scrollFlex: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  greetingTextCol: {
    flex: 1,
    minWidth: 0,
  },
  welcome: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.title,
    fontWeight: '700',
  },
  dashboardSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    lineHeight: 20,
    marginTop: 4,
  },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
  },
  periodPillText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  insightIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTextCol: {
    flex: 1,
    minWidth: 0,
  },
  insightEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  insightTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  insightBody: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  insightCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  insightCtaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  transactionsCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 24,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
    minWidth: 0,
  },
  transactionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  transactionMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  transactionRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  transactionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  transactionStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  verifyBanner: {
    gap: 12,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.5)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  verifyBannerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  verifyBannerText: { flex: 1, minWidth: 0 },
  verifyBannerTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  verifyBannerSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  verifyBannerButton: {
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBannerButtonText: { fontSize: 14, fontWeight: '600', color: '#b45309' },
  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  setupBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#a3e635',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupBannerText: { flex: 1, minWidth: 0 },
  setupBannerTitle: { fontSize: 15, fontWeight: '600' },
  setupBannerSubtitle: { fontSize: 13, marginTop: 4 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  alertText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  kitchenStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  kitchenStatCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  kitchenStatValue: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  kitchenStatLabel: { fontSize: 12, fontWeight: '500' },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  jobsCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  jobInfo: {
    flex: 1,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  jobCustomer: {
    fontSize: 13,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  jobRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  onlineStoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  onlineStoreIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineStoreTextCol: { flex: 1, minWidth: 0 },
  onlineStoreTitle: { fontSize: 14, fontWeight: '700' },
  onlineStoreBody: { fontSize: 13, marginTop: 2 },
});
