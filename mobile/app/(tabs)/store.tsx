import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  Linking,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { FilterChipRow } from '@/components/FilterChip';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { ScreenShell } from '@/components/ScreenShell';
import { OnlineStoreOrdersList } from '@/components/store/OnlineStoreOrdersList';
import { OnlineStoreWelcome } from '@/components/store/OnlineStoreWelcome';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useScreenColors } from '@/hooks/useScreenColors';
import { useIsStoreSetupRoute } from '@/hooks/useIsStoreSetupRoute';
import { standaloneFullWidth } from '@/styles/standaloneButton';
import { useOnlineStoreOrderAttention } from '@/hooks/useOnlineStoreOrderAttention';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { storeService } from '@/services/storeService';
import { resolveBusinessType, STUDIO_LIKE_TYPES } from '@/constants';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { formatDisplayPhone } from '@/utils/displayPhone';
import { formatCurrency, formatInteger } from '@/utils/formatCurrency';
import { resolveStoreLogoUrl } from '@/utils/onlineStoreDefaults';
import { getApiErrorMessage } from '@/utils/parseApiListResponse';
import { buildOnlineStoreUrl } from '@/utils/storefrontUrl';
import { getResumeSetupHref, type SetupChecklist } from '@/utils/storeSetupFlow';
import {
  fulfillmentStateForOrder,
  formatOnlineOrderStatusLabel,
  getCustomerName,
  getOrderNumber,
  getOrderTotal,
} from '@/utils/marketplaceOrderStatus';

const toCount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

type HubTab = 'overview' | 'orders';

type ManageRow = {
  key: string;
  label: string;
  detail?: string;
  icon: AppIconName;
  href: string;
  swatch?: string;
};

const HUB_TAB_OPTIONS: { value: HubTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'orders', label: 'Orders' },
];

function normalizeSectionParam(value: string | string[] | undefined): HubTab | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'orders' || raw === 'overview') return raw;
  return null;
}

export default function StoreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const { activeTenant, activeTenantId, hasFeature, isManager } = useAuth();
  const { scopeReady } = useWorkspaceScope();
  const { colors, cardBg, borderColor, textColor, mutedColor, bg } = useScreenColors();

  const resolvedType = resolveBusinessType(activeTenant?.businessType);
  const isStudioStore =
    STUDIO_LIKE_TYPES.includes((activeTenant?.businessType || '') as (typeof STUDIO_LIKE_TYPES)[number])
    || resolvedType === 'studio';

  const inStoreSetup = useIsStoreSetupRoute();
  const enabled = !!activeTenantId && scopeReady && hasFeature('paymentsExpenses') && !inStoreSetup;

  const sectionFromParams = normalizeSectionParam(params.section);
  const [hubTab, setHubTab] = useState<HubTab>(sectionFromParams ?? 'overview');

  useEffect(() => {
    if (sectionFromParams) setHubTab(sectionFromParams);
  }, [sectionFromParams]);

  const setHubSection = useCallback(
    (next: HubTab) => {
      setHubTab(next);
      router.setParams({ section: next });
    },
    [router]
  );

  const {
    data: statusResponse,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['store', 'setup-status'],
    queryFn: () => storeService.getSetupStatus(),
    enabled,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });

  const {
    pendingOrderCount,
    recentOrders,
    orderStats,
    isOrderStatsFetching,
    isRecentOrdersLoading,
    isRecentOrdersFetching,
    isRecentOrdersError,
    hasLoadedOrderStats,
  } = useOnlineStoreOrderAttention({ enabled });

  const setupData = (statusResponse as { data?: unknown })?.data ?? statusResponse ?? {};
  const settings = (setupData as { settings?: Record<string, unknown> }).settings || {};
  const checklist = ((setupData as { checklist?: SetupChecklist }).checklist || {}) as SetupChecklist;
  const isStoreLive = Boolean(checklist.launched);
  const onlineStoreUrl = buildOnlineStoreUrl(String(settings.slug || settings.storeSlug || ''), {
    customDomain: settings.customDomain as string | undefined,
    customDomainStatus: settings.customDomainStatus as string | undefined,
  });

  const isOrdersTab = isStoreLive && hubTab === 'orders';

  useRegisterPageSearch({
    scope: isOrdersTab ? 'online-orders' : 'store',
    placeholder: isOrdersTab ? SEARCH_PLACEHOLDERS.ONLINE_ORDERS : SEARCH_PLACEHOLDERS.GLOBAL,
    enabled: isOrdersTab,
    title: 'Online Store',
    subtitle: isStoreLive ? undefined : 'Not published yet',
  });

  const openCreateStore = useCallback(() => {
    const businessLogoUrl = resolveStoreLogoUrl(settings, activeTenant?.metadata, activeTenant);
    router.push(
      getResumeSetupHref(checklist, settings, { businessLogoUrl }) as never
    );
  }, [activeTenant, checklist, router, settings]);

  const totalOrders = useMemo(
    () => toCount(orderStats.total ?? recentOrders.length),
    [orderStats.total, recentOrders.length]
  );

  const hubTabOptions = useMemo(
    () =>
      HUB_TAB_OPTIONS.map((tab) =>
        tab.value === 'orders' && pendingOrderCount > 0
          ? { ...tab, label: `Orders (${formatInteger(pendingOrderCount)})` }
          : tab
      ),
    [pendingOrderCount]
  );

  const dashboardStats = useMemo(
    () => [
      {
        label: isStudioStore ? 'Published services' : 'Published listings',
        value: formatInteger(toCount(checklist.listingsCount)),
        description: isStudioStore ? 'Services customers can request' : 'Products customers can buy',
        icon: 'package' as const,
        valueColor: textColor,
      },
      {
        label: isStudioStore ? 'Studio store status' : 'Store status',
        value: 'Live',
        description: 'Your online store is live',
        icon: 'shopping-cart' as const,
        valueColor: colors.tint,
      },
      {
        label: 'Pending orders',
        value: isOrderStatsFetching && !hasLoadedOrderStats ? '...' : formatInteger(pendingOrderCount),
        description: 'Payment or fulfillment needs attention',
        icon: 'clock' as const,
        valueColor: '#b45309',
        onPress: () => setHubSection('orders'),
      },
      {
        label: 'Online revenue',
        value: isOrderStatsFetching && !hasLoadedOrderStats
          ? '...'
          : formatCurrency(Number(orderStats.totalRevenue || 0)),
        description: `${formatInteger(totalOrders)} online ${totalOrders === 1 ? 'order' : 'orders'} received`,
        icon: 'credit-card' as const,
        valueColor: colors.tint,
      },
    ],
    [
      checklist.listingsCount,
      colors.tint,
      hasLoadedOrderStats,
      isOrderStatsFetching,
      isStudioStore,
      orderStats.totalRevenue,
      pendingOrderCount,
      setHubSection,
      textColor,
      totalOrders,
    ]
  );

  // Settings saves need owner/admin/manager on the API; listings can be published by staff too.
  const manageRows = useMemo<ManageRow[]>(() => {
    const publishedCount = formatInteger(toCount(checklist.listingsCount));
    const rows: ManageRow[] = [
      isStudioStore
        ? {
            key: 'services',
            label: 'Studio services',
            detail: `${publishedCount} published`,
            icon: 'cut-outline',
            href: '/(tabs)/store-services',
          }
        : {
            key: 'products',
            label: 'Products',
            detail: `${publishedCount} published`,
            icon: 'package',
            href: '/(tabs)/store-products',
          },
    ];
    if (!isManager) return rows;

    const contact = formatDisplayPhone(String(settings.whatsappNumber || settings.contactPhone || ''));
    const primaryColor = String(settings.primaryColor || '').trim();
    rows.push(
      {
        key: 'name',
        label: 'Store name',
        detail: String(settings.displayName || '').trim() || undefined,
        icon: 'store',
        href: '/store-setup/confirm-name?mode=edit',
      },
      {
        key: 'whatsapp',
        label: 'WhatsApp number',
        detail: contact || 'Not set',
        icon: 'phone',
        href: '/store-setup/whatsapp?mode=edit',
      },
      {
        key: 'logo',
        label: 'Logo',
        detail: settings.logoUrl ? 'Change your store logo' : 'Add a logo',
        icon: 'image',
        href: '/store-setup/logo?mode=edit',
      },
      {
        key: 'color',
        label: 'Brand color',
        detail: primaryColor || undefined,
        swatch: primaryColor || undefined,
        icon: 'palette',
        href: '/store-setup/color?mode=edit',
      },
      {
        key: 'payments',
        label: 'Payments',
        detail: checklist.hasPaymentMethod ? 'Payouts connected' : 'Not connected',
        icon: 'credit-card',
        href: '/store-setup/payments?mode=edit',
      }
    );
    return rows;
  }, [checklist.hasPaymentMethod, checklist.listingsCount, isManager, isStudioStore, settings]);

  const openOnlineStore = useCallback(() => {
    if (!onlineStoreUrl) {
      Alert.alert('Store not ready', 'Finish online store setup to get your store link.');
      return;
    }
    Linking.openURL(onlineStoreUrl).catch(() => {
      Alert.alert('Could not open link', onlineStoreUrl);
    });
  }, [onlineStoreUrl]);

  if (!hasFeature('paymentsExpenses')) {
    return <FeatureAccessDenied message="Online store is not enabled for your workspace." />;
  }

  if (isLoading) {
    return <ListLoadingState message="Loading store..." />;
  }

  if (isError) {
    return (
      <ListErrorState
        title="Failed to load store"
        message={getApiErrorMessage(error, 'Could not load store status.')}
        onRetry={refetch}
      />
    );
  }

  // Launch screen until published/live — not empty draft statistics.
  if (!isStoreLive) {
    return (
      <ScreenShell style={styles.container}>
        <OnlineStoreWelcome chrome="tab" onCreateStore={openCreateStore} />
      </ScreenShell>
    );
  }

  const displayName = String(settings.displayName || (isStudioStore ? 'Studio store' : 'Online store'));

  return (
    <ScreenShell style={styles.container}>
      <View style={[styles.hubTabs, { backgroundColor: bg, borderBottomColor: borderColor }]}>
        <FilterChipRow
          options={hubTabOptions}
          value={hubTab}
          onChange={(value) => setHubSection(value as HubTab)}
        />
      </View>

      {hubTab === 'orders' ? (
        <OnlineStoreOrdersList enabled={enabled} />
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />
          }
        >
          {pendingOrderCount > 0 ? (
            <Pressable
              onPress={() => setHubSection('orders')}
              style={({ pressed }) => [
                styles.alertCard,
                { backgroundColor: '#fffbeb', borderColor: '#fde68a', opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <AppIcon name="bell" size={20} color="#b45309" />
              <View style={styles.alertTextCol}>
                <Text style={styles.alertTitle}>
                  {pendingOrderCount} online {pendingOrderCount === 1 ? 'order needs' : 'orders need'} attention
                </Text>
                <Text style={styles.alertBody}>Review and fulfill pending online store orders</Text>
              </View>
              <AppIcon name="chevron-right" size={16} color="#b45309" />
            </Pressable>
          ) : null}

          <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.heroTitle, { color: textColor }]}>{displayName}</Text>
            <Text style={[styles.heroBody, { color: mutedColor }]}>
              Track orders and manage your online store from mobile.
            </Text>
            {onlineStoreUrl ? (
              <Pressable
                onPress={openOnlineStore}
                style={({ pressed }) => [styles.linkBtn, { borderColor, opacity: pressed ? 0.85 : 1 }]}
              >
                <AppIcon name="share" size={16} color={colors.tint} />
                <Text style={[styles.linkBtnText, { color: colors.tint }]} numberOfLines={1}>
                  View online store
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.statsGrid}>
            {dashboardStats.map((stat) => (
              <Pressable
                key={stat.label}
                disabled={!stat.onPress}
                onPress={stat.onPress}
                style={({ pressed }) => [
                  styles.statCard,
                  { backgroundColor: cardBg, borderColor, opacity: pressed && stat.onPress ? 0.85 : 1 },
                ]}
              >
                <View style={styles.statHeader}>
                  <Text style={[styles.statLabel, { color: mutedColor }]}>{stat.label}</Text>
                  <AppIcon name={stat.icon} size={16} color={mutedColor} />
                </View>
                <Text style={[styles.statValue, { color: stat.valueColor }]}>{stat.value}</Text>
                <Text style={[styles.statDescription, { color: mutedColor }]}>{stat.description}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Recent orders</Text>
            <Pressable onPress={() => setHubSection('orders')} hitSlop={8}>
              <Text style={{ color: colors.tint, fontWeight: '600', fontSize: 14 }}>See all</Text>
            </Pressable>
          </View>
          <View style={[styles.menuCard, { backgroundColor: cardBg, borderColor }]}>
            {isRecentOrdersLoading || (isRecentOrdersFetching && recentOrders.length === 0) ? (
              <View style={styles.stateCard}>
                <AppIcon name="refresh" size={20} color={mutedColor} />
                <Text style={[styles.stateText, { color: mutedColor }]}>Loading recent orders...</Text>
              </View>
            ) : isRecentOrdersError ? (
              <View style={[styles.stateCard, { backgroundColor: '#fffbeb' }]}>
                <AppIcon name="exclamation-triangle" size={20} color="#b45309" />
                <Text style={[styles.stateText, { color: '#92400e' }]}>
                  Could not load recent orders. Open Orders to try again.
                </Text>
              </View>
            ) : recentOrders.length === 0 ? (
              <View style={styles.stateCard}>
                <AppIcon name="shopping-cart" size={22} color={mutedColor} />
                <Text style={[styles.stateTitle, { color: textColor }]}>No online orders yet</Text>
                <Text style={[styles.stateText, { color: mutedColor }]}>
                  Share your online store link and new orders will appear here.
                </Text>
              </View>
            ) : (
              recentOrders.slice(0, 3).map((order, index) => {
                const fulfillment = fulfillmentStateForOrder(order);
                return (
                  <Pressable
                    key={String(order.id)}
                    onPress={() => router.push(`/store-order/${order.id}` as never)}
                    style={({ pressed }) => [
                      styles.recentRow,
                      index < Math.min(recentOrders.length, 3) - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={styles.recentMain}>
                      <Text style={[styles.recentTitle, { color: textColor }]} numberOfLines={1}>
                        {getOrderNumber(order)}
                      </Text>
                      <Text style={[styles.recentSub, { color: mutedColor }]} numberOfLines={1}>
                        {getCustomerName(order)} · {formatOnlineOrderStatusLabel(fulfillment)}
                      </Text>
                    </View>
                    <Text style={[styles.recentTotal, { color: colors.tint }]}>
                      {formatCurrency(getOrderTotal(order))}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Manage store</Text>
          </View>
          <View style={[styles.menuCard, { backgroundColor: cardBg, borderColor }]}>
            {manageRows.map((row, index) => (
              <Pressable
                key={row.key}
                onPress={() => router.push(row.href as never)}
                accessibilityRole="button"
                accessibilityLabel={row.detail ? `${row.label}, ${row.detail}` : row.label}
                style={({ pressed }) => [
                  styles.menuRow,
                  index < manageRows.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor },
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <AppIcon name={row.icon} size={20} color={colors.tint} />
                <View style={styles.menuTextCol}>
                  <Text style={[styles.menuLabel, { color: textColor }]}>{row.label}</Text>
                  {row.detail ? (
                    <Text style={[styles.menuDetail, { color: mutedColor }]} numberOfLines={1}>
                      {row.detail}
                    </Text>
                  ) : null}
                </View>
                {row.swatch ? <View style={[styles.swatch, { backgroundColor: row.swatch, borderColor }]} /> : null}
                <AppIcon name="chevron-right" size={14} color={mutedColor} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  hubTabs: {
    borderBottomWidth: 1,
    paddingTop: 8,
  },
  content: { padding: 16, paddingBottom: 32 },
  heroCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  heroTitle: { fontSize: 20, fontWeight: '700' },
  heroBody: { fontSize: 14, lineHeight: 20 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...standaloneFullWidth,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 4,
    minHeight: 44,
  },
  linkBtnText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: { width: '48.5%', minHeight: 132, borderWidth: 1, borderRadius: 12, padding: 14 },
  statHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statLabel: { fontSize: 12, marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statDescription: { fontSize: 12, lineHeight: 16, marginTop: 6 },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  alertTextCol: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#92400e' },
  alertBody: { fontSize: 13, color: '#b45309', marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  menuCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  menuTextCol: { flex: 1, minWidth: 0 },
  menuLabel: { fontSize: 16, fontWeight: '500' },
  menuDetail: { fontSize: 13, marginTop: 2 },
  swatch: { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
  stateCard: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 22 },
  stateTitle: { fontSize: 15, fontWeight: '700' },
  stateText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  recentMain: { flex: 1 },
  recentTitle: { fontSize: 15, fontWeight: '600' },
  recentSub: { fontSize: 12, marginTop: 2 },
  recentTotal: { fontSize: 14, fontWeight: '700' },
});
