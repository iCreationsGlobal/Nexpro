import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { SimplePeriodTabs } from '@/components/simple/SimpleUI';
import { useAuth } from '@/context/AuthContext';
import { useShopOptional } from '@/context/ShopContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { dashboardService } from '@/services/dashboardService';
import { reportService } from '@/services/reportService';
import { formatCurrency } from '@/utils/formatCurrency';
import { simplePeriodRange, type SimplePeriodKey } from '@/utils/simplePeriods';
import { FontFamily } from '@/constants/typography';

const PERIODS: { key: SimplePeriodKey; label: string; filterType: string }[] = [
  { key: 'today', label: 'Today', filterType: 'today' },
  { key: 'week', label: 'Week', filterType: 'thisWeek' },
  { key: 'month', label: 'Month', filterType: 'thisMonth' },
  { key: 'lastMonth', label: 'Last month', filterType: 'lastMonth' },
];

const unwrap = (value: any) => value?.data ?? value;

/**
 * Simple Mode Reports (mirrors Frontend SimpleReports): money in, money out and profit for a
 * period, the best sellers and what the money was spent on. Totals match Home.
 */
export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { activeTenantId } = useAuth();
  const shop = useShopOptional();
  const { bg, cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  const [period, setPeriod] = useState<SimplePeriodKey>('month');
  const current = PERIODS.find((p) => p.key === period) || PERIODS[2];
  const range = useMemo(() => simplePeriodRange(period), [period]);
  const scope = [activeTenantId, shop?.activeShopId ?? null, range.startDate, range.endDate];

  const overview = useQuery({
    queryKey: ['simple', 'overview', ...scope],
    queryFn: () => dashboardService.getOverview(range.startDate, range.endDate, current.filterType),
    enabled: !!activeTenantId,
  });
  const top = useQuery({
    queryKey: ['simple', 'top-sellers', ...scope],
    queryFn: () => reportService.getFastestMovingItems(range.startDate, range.endDate, 5),
    enabled: !!activeTenantId,
  });
  const spend = useQuery({
    queryKey: ['simple', 'expense-report', ...scope],
    queryFn: () => reportService.getExpenseReport(range.startDate, range.endDate),
    enabled: !!activeTenantId,
  });

  const summary = (unwrap(overview.data) || {}).thisMonth || {};
  const revenue = Number(summary.revenue || 0);
  const expenses = Number(summary.expenses || 0);
  const profit = Number(summary.profit ?? revenue - expenses);
  const topSellers: any[] = Array.isArray(unwrap(top.data)) ? unwrap(top.data) : [];
  const categories = ((unwrap(spend.data) || {}).byCategory || [])
    .map((row: any) => ({ category: row.category || 'Other', amount: Number(row.totalAmount || 0) }))
    .filter((row: { amount: number }) => row.amount > 0)
    .sort((a: { amount: number }, b: { amount: number }) => b.amount - a.amount)
    .slice(0, 6);
  const biggest = categories[0]?.amount || 0;

  const Total = ({ label, value, icon, tint, valueColor }: { label: string; value: number; icon: AppIconName; tint: string; valueColor?: string }) => (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.cardLabel, { color: mutedColor }]}>{label}</Text>
        <AppIcon name={icon} size={22} color={tint} />
      </View>
      {overview.isLoading ? <ActivityIndicator style={{ alignSelf: 'flex-start', marginTop: 8 }} /> : (
        <Text style={[styles.total, { color: valueColor || textColor }]}>{formatCurrency(value)}</Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <AppIcon name="chevron-left" size={26} color={textColor} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textColor }]}>Reports</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={overview.isRefetching} onRefresh={() => { overview.refetch(); top.refetch(); spend.refetch(); }} />}
      >
        <SimplePeriodTabs value={period} onChange={setPeriod} tabs={PERIODS} />
        <Total label="Money in (sales)" value={revenue} icon="money" tint="#047857" />
        <Total label="Money out (expenses)" value={expenses} icon="receipt" tint="#b45309" />
        <Total
          label={profit < 0 ? 'Loss' : 'Profit'}
          value={profit}
          icon={profit < 0 ? 'trending-down' : 'trending-up'}
          tint={profit < 0 ? '#b91c1c' : '#047857'}
          valueColor={profit < 0 ? '#b91c1c' : '#047857'}
        />

        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.section, { color: textColor }]}>Best sellers</Text>
          {top.isLoading ? <ActivityIndicator /> : topSellers.length === 0 ? (
            <Text style={{ color: mutedColor, fontFamily: FontFamily.regular }}>No sales in this period.</Text>
          ) : topSellers.map((item, index) => (
            <View key={item.productId || item.productName || index} style={styles.sellerRow}>
              <View style={[styles.rank, { borderColor }]}><Text style={[styles.rankText, { color: textColor }]}>{index + 1}</Text></View>
              <Text numberOfLines={1} style={[styles.sellerName, { color: textColor }]}>{item.productName || 'Product'}</Text>
              <Text style={{ color: mutedColor, fontFamily: FontFamily.semiBold }}>{Number(item.quantitySold || 0)} sold</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.section, { color: textColor }]}>What you spent on</Text>
          {spend.isLoading ? <ActivityIndicator /> : categories.length === 0 ? (
            <Text style={{ color: mutedColor, fontFamily: FontFamily.regular }}>No expenses in this period.</Text>
          ) : categories.map((row: { category: string; amount: number }) => (
            <View key={row.category} style={{ marginBottom: 12 }}>
              <View style={styles.spendLine}>
                <Text numberOfLines={1} style={[styles.sellerName, { color: textColor }]}>{row.category}</Text>
                <Text style={{ color: textColor, fontFamily: FontFamily.semiBold }}>{formatCurrency(row.amount)}</Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: borderColor }]}>
                <View style={[styles.bar, { width: `${biggest ? Math.max(4, (row.amount / biggest) * 100) : 0}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { padding: 6 },
  headerTitle: { fontSize: 22, fontFamily: FontFamily.semiBold },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 20, padding: 18 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontSize: 15, fontFamily: FontFamily.medium },
  total: { fontSize: 30, fontFamily: FontFamily.bold, marginTop: 6 },
  section: { fontSize: 18, fontFamily: FontFamily.semiBold, marginBottom: 12 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  rank: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontFamily: FontFamily.bold },
  sellerName: { flex: 1, fontSize: 16, fontFamily: FontFamily.medium },
  spendLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  barTrack: { height: 8, borderRadius: 4, marginTop: 6, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4, backgroundColor: '#f59e0b' },
});
