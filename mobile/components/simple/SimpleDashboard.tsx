import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useShopOptional } from '@/context/ShopContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { dashboardService } from '@/services/dashboardService';
import { formatCurrency } from '@/utils/formatCurrency';
import { FontFamily } from '@/constants/typography';
import { simplePeriodRange } from '@/utils/simplePeriods';
import { useRefetchOnFocus, useScreenFocused } from '@/hooks/useScreenFocus';

type PeriodKey = 'today' | 'week' | 'month';

const PERIODS: { key: PeriodKey; label: string; filterType: string }[] = [
  { key: 'today', label: 'Today', filterType: 'today' },
  { key: 'week', label: 'This week', filterType: 'thisWeek' },
  { key: 'month', label: 'This month', filterType: 'thisMonth' },
];

function StatCard({ label, value, icon, iconBg, iconColor, valueColor, loading, cardBg, borderColor, mutedColor }: {
  label: string; value: number; icon: AppIconName; iconBg: string; iconColor: string; valueColor: string;
  loading: boolean; cardBg: string; borderColor: string; mutedColor: string;
}) {
  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.cardLabel, { color: mutedColor }]}>{label}</Text>
        <View style={[styles.cardIcon, { backgroundColor: iconBg }]}>
          <AppIcon name={icon} size={20} color={iconColor} />
        </View>
      </View>
      {loading
        ? <ActivityIndicator style={styles.cardLoading} />
        : <Text style={[styles.cardValue, { color: valueColor }]}>{formatCurrency(value)}</Text>}
    </View>
  );
}

/**
 * Simple Mode Home for shops (mirrors Frontend SimpleDashboard): Revenue, Expenses and Profit
 * for a chosen period, a big Sell button and Add expense. No charts, insights or alerts.
 */
export function SimpleDashboard() {
  const { user, activeTenantId } = useAuth();
  const shop = useShopOptional();
  const { bg, cardBg, borderColor, textColor, mutedColor, colors, onTint } = useScreenColors();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const current = PERIODS.find((p) => p.key === period) || PERIODS[0];
  const range = useMemo(() => simplePeriodRange(period), [period]);
  const focused = useScreenFocused();

  const overviewQuery = useQuery({
    queryKey: ['simple', 'overview', activeTenantId, shop?.activeShopId ?? null, range.startDate, range.endDate],
    queryFn: () => dashboardService.getOverview(range.startDate, range.endDate, current.filterType),
    enabled: !!activeTenantId,
    // Only poll while Home is on screen; tabs keep it mounted in the background.
    refetchInterval: focused ? 60 * 1000 : false,
  });
  const { data, isLoading } = overviewQuery;
  useRefetchOnFocus(overviewQuery);

  // The overview returns the requested period's totals under `thisMonth`.
  const payload = (data as { data?: unknown })?.data ?? data ?? {};
  const summary = ((payload as { thisMonth?: Record<string, unknown> }).thisMonth || {}) as Record<string, unknown>;
  const revenue = Number(summary.revenue || 0);
  const expenses = Number(summary.expenses || 0);
  const profit = Number(summary.profit ?? revenue - expenses);
  const firstName = String(user?.name || '').trim().split(/\s+/)[0];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.hello, { color: textColor }]}>{firstName ? `Hello, ${firstName}` : 'Hello'}</Text>
      <Text style={[styles.sub, { color: mutedColor }]}>Here is how your shop is doing.</Text>

      <Pressable
        onPress={() => router.push('/simple' as never)}
        style={({ pressed }) => [styles.sellButton, { backgroundColor: colors.tint }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Sell"
      >
        <AppIcon name="shopping-cart" size={32} color={onTint} />
        <Text style={[styles.sellText, { color: onTint }]}>Sell</Text>
      </Pressable>

      <View style={[styles.periods, { backgroundColor: borderColor }]} accessibilityRole="tablist">
        {PERIODS.map((p) => {
          const active = p.key === period;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              style={[styles.period, active && { backgroundColor: cardBg }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.periodText, { color: active ? textColor : mutedColor }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <StatCard label="Revenue" value={revenue} icon="money" iconBg="#d1fae5" iconColor="#047857"
        valueColor={textColor} loading={isLoading} cardBg={cardBg} borderColor={borderColor} mutedColor={mutedColor} />
      <StatCard label="Expenses" value={expenses} icon="receipt" iconBg="#fef3c7" iconColor="#b45309"
        valueColor={textColor} loading={isLoading} cardBg={cardBg} borderColor={borderColor} mutedColor={mutedColor} />
      <StatCard
        label={profit < 0 ? 'Loss' : 'Profit'}
        value={profit}
        icon={profit < 0 ? 'trending-down' : 'trending-up'}
        iconBg={profit < 0 ? '#fee2e2' : '#d1fae5'}
        iconColor={profit < 0 ? '#b91c1c' : '#047857'}
        valueColor={profit < 0 ? '#b91c1c' : '#047857'}
        loading={isLoading} cardBg={cardBg} borderColor={borderColor} mutedColor={mutedColor}
      />

      <Pressable
        onPress={() => router.push('/(tabs)/expenses?new=1' as never)}
        style={({ pressed }) => [styles.addExpense, { borderColor, backgroundColor: cardBg }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Add expense"
      >
        <AppIcon name="plus" size={22} color={textColor} />
        <Text style={[styles.addExpenseText, { color: textColor }]}>Add expense</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  hello: { fontSize: 26, fontFamily: FontFamily.semiBold },
  sub: { fontSize: 15, fontFamily: FontFamily.regular, marginTop: -8 },
  sellButton: {
    height: 88,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  sellText: { fontSize: 28, fontFamily: FontFamily.bold },
  pressed: { opacity: 0.85 },
  periods: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  period: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  periodText: { fontSize: 15, fontFamily: FontFamily.medium },
  card: { borderWidth: 1, borderRadius: 20, padding: 18 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontSize: 16, fontFamily: FontFamily.medium },
  cardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardValue: { fontSize: 32, fontFamily: FontFamily.bold, marginTop: 10 },
  cardLoading: { marginTop: 14, alignSelf: 'flex-start' },
  addExpense: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addExpenseText: { fontSize: 17, fontFamily: FontFamily.semiBold },
});
