import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '@/components/AppIcon';
import { ScreenShell } from '@/components/ScreenShell';
import { StackPageHeader } from '@/components/StackPageHeader';
import { useAuth } from '@/context/AuthContext';
import { useBillingLock } from '@/hooks/useBillingLock';
import { useScreenColors } from '@/hooks/useScreenColors';
import { settingsService } from '@/services/settings';
import { SUPPORT_EMAIL } from '@/utils/billingLock';
import { formatDate } from '@/utils/formatCurrency';
import {
  formatBillingPeriod,
  formatMinorAmount,
  formatPaymentPeriod,
  formatPaymentProvider,
  formatPaymentStatus,
  formatPlanName,
  formatSeatUsage,
  getBillingHeadline,
  getBillingStatusBadge,
  getPeriodEndDate,
  type BadgeTone,
  type BillingDetails,
} from '@/utils/billingSummary';

/**
 * ABS plan and subscription payments for the active workspace. View only: see utils/billingSummary
 * for why the app has no pay or upgrade button.
 */
export default function BillingScreen() {
  const queryClient = useQueryClient();
  const { isManager, activeTenantId, activeTenant } = useAuth();
  const { billing: lockBilling, locked, rechecking } = useBillingLock();
  const { colors, cardBg, borderColor, textColor, mutedColor, resolvedTheme } = useScreenColors();
  const [refreshing, setRefreshing] = useState(false);
  const enabled = Boolean(isManager && activeTenantId);

  const paymentsQuery = useQuery({
    queryKey: ['subscription', 'payments', activeTenantId],
    queryFn: () => settingsService.getSubscriptionPayments(),
    enabled,
    staleTime: 60_000,
  });

  // The backend blocks seat usage while locked, so don't ask then.
  const seatsQuery = useQuery({
    queryKey: ['settings', 'seat-usage', activeTenantId],
    queryFn: () => settingsService.getSeatUsage(),
    enabled: enabled && !locked,
    staleTime: 60_000,
    retry: false,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['subscription', 'status', activeTenantId] }),
        paymentsQuery.refetch(),
        locked ? Promise.resolve() : seatsQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, activeTenantId, paymentsQuery, seatsQuery, locked]);

  const contactSupport = useCallback(() => {
    const subject = encodeURIComponent(`Billing: ${activeTenant?.name ?? 'my workspace'}`);
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {});
  }, [activeTenant?.name]);

  if (!isManager) {
    return (
      <ScreenShell style={styles.screen}>
        <StackPageHeader title="Billing" />
        <View style={styles.restricted}>
          <AppIcon name="lock" size={36} color={mutedColor} />
          <Text style={[styles.restrictedTitle, { color: textColor }]}>Not available</Text>
          <Text style={[styles.restrictedBody, { color: mutedColor }]}>
            Only the owner, admins and managers can see billing for this workspace.
          </Text>
        </View>
      </ScreenShell>
    );
  }

  const billing = ((lockBilling as BillingDetails | null) ?? paymentsQuery.data?.billing ?? null) as BillingDetails | null;
  const loadingPlan = !billing && (rechecking || paymentsQuery.isLoading);
  const badge = getBillingStatusBadge(billing);
  const activePayment = paymentsQuery.data?.activePayment ?? null;
  const billingPeriod = formatBillingPeriod(activePayment?.billingPeriod);
  const periodEnd = getPeriodEndDate(billing);
  const seats = formatSeatUsage(seatsQuery.data);
  const payments = paymentsQuery.data?.payments ?? [];
  const isDark = resolvedTheme === 'dark';

  const detailRows: { label: string; value: string }[] = [
    ...(billingPeriod ? [{ label: 'Billing period', value: billingPeriod }] : []),
    {
      label: billing?.billingStatus === 'trialing' ? 'Trial ends' : 'Current period ends',
      value: periodEnd ? formatDate(periodEnd) : 'Not set',
    },
    ...(seats ? [{ label: 'Team seats', value: seats }] : []),
  ];

  return (
    <ScreenShell style={styles.screen}>
      <StackPageHeader title="Billing" subtitle={activeTenant?.name ?? undefined} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
      >
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.planBlock}>
            <Text style={[styles.overline, { color: mutedColor }]}>Plan</Text>
            {loadingPlan ? (
              <ActivityIndicator color={colors.tint} style={styles.planLoading} />
            ) : (
              <>
                <View style={styles.planRow}>
                  <Text style={[styles.planName, { color: textColor }]} accessibilityRole="header">
                    {formatPlanName(billing?.plan)}
                  </Text>
                  <Badge label={badge.label} tone={badge.tone} isDark={isDark} mutedColor={mutedColor} />
                </View>
                <Text style={[styles.headline, { color: mutedColor }]}>{getBillingHeadline(billing)}</Text>
              </>
            )}
          </View>
          {!loadingPlan
            ? detailRows.map((row) => (
                <View key={row.label} style={[styles.detailRow, { borderTopColor: borderColor }]}>
                  <Text style={[styles.detailLabel, { color: mutedColor }]}>{row.label}</Text>
                  <Text style={[styles.detailValue, { color: textColor }]}>{row.value}</Text>
                </View>
              ))
            : null}
        </View>

        <Text style={[styles.sectionTitle, { color: textColor }]}>Payments to ABS</Text>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          {paymentsQuery.isLoading ? (
            <ActivityIndicator color={colors.tint} style={styles.listState} />
          ) : paymentsQuery.isError ? (
            <View style={styles.listState}>
              <Text style={[styles.emptyText, { color: mutedColor }]}>Could not load payments.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => { void paymentsQuery.refetch(); }}
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <Text style={[styles.retryText, { color: colors.tint }]}>Try again</Text>
              </Pressable>
            </View>
          ) : payments.length === 0 ? (
            <Text style={[styles.emptyText, styles.listState, { color: mutedColor }]}>
              No payments recorded for this workspace yet.
            </Text>
          ) : (
            payments.map((payment, index) => {
              const status = formatPaymentStatus(payment.status);
              const period = formatBillingPeriod(payment.billingPeriod);
              return (
                <View
                  key={payment.id || payment.providerReference || `${payment.plan}-${payment.periodStart}-${index}`}
                  style={[styles.paymentRow, index > 0 && { borderTopWidth: 1, borderTopColor: borderColor }]}
                >
                  <View style={styles.paymentMain}>
                    <Text style={[styles.paymentPlan, { color: textColor }]} numberOfLines={1}>
                      {formatPlanName(payment.plan)}
                      {period ? ` · ${period}` : ''}
                    </Text>
                    <Text style={[styles.paymentMeta, { color: mutedColor }]}>{formatPaymentPeriod(payment)}</Text>
                    <Text style={[styles.paymentMeta, { color: mutedColor }]}>{formatPaymentProvider(payment.provider)}</Text>
                  </View>
                  <View style={styles.paymentSide}>
                    <Text style={[styles.paymentAmount, { color: textColor }]}>
                      {formatMinorAmount(payment.amount, payment.currency)}
                    </Text>
                    <Badge label={status.label} tone={status.tone} isDark={isDark} mutedColor={mutedColor} />
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={[styles.card, styles.supportCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.supportText, { color: mutedColor }]}>
            Questions about your plan or a payment? Our team can help.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Contact support"
            onPress={contactSupport}
            style={({ pressed }) => [styles.supportButton, { borderColor }, pressed && styles.pressed]}
          >
            <AppIcon name="mail" size={18} color={colors.tint} />
            <Text style={[styles.supportButtonText, { color: colors.tint }]}>Contact support</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const BADGE_COLORS: Record<Exclude<BadgeTone, 'neutral'>, { bg: string; light: string; dark: string }> = {
  success: { bg: 'rgba(16, 185, 129, 0.14)', light: '#047857', dark: '#34d399' },
  warning: { bg: 'rgba(245, 158, 11, 0.16)', light: '#b45309', dark: '#fbbf24' },
  danger: { bg: 'rgba(239, 68, 68, 0.14)', light: '#b91c1c', dark: '#f87171' },
};

function Badge({ label, tone, isDark, mutedColor }: { label: string; tone: BadgeTone; isDark: boolean; mutedColor: string }) {
  const palette = tone === 'neutral' ? null : BADGE_COLORS[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette?.bg ?? 'rgba(107, 114, 128, 0.14)' }]}>
      <Text style={[styles.badgeText, { color: palette ? (isDark ? palette.dark : palette.light) : mutedColor }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  planBlock: { padding: 16 },
  overline: { fontSize: 13, fontWeight: '500' },
  planLoading: { marginVertical: 16, alignSelf: 'flex-start' },
  planRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  planName: { fontSize: 22, fontWeight: '700' },
  headline: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  detailLabel: { fontSize: 14 },
  detailValue: { fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, marginTop: 24 },
  listState: { padding: 20, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center' },
  retry: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 12 },
  retryText: { fontSize: 15, fontWeight: '600' },
  paymentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  paymentMain: { flex: 1 },
  paymentPlan: { fontSize: 15, fontWeight: '600' },
  paymentMeta: { fontSize: 13, marginTop: 2 },
  paymentSide: { alignItems: 'flex-end', gap: 6 },
  paymentAmount: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  supportCard: { marginTop: 24, padding: 16 },
  supportText: { fontSize: 14, lineHeight: 20 },
  supportButton: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  supportButtonText: { fontSize: 15, fontWeight: '600' },
  restricted: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  restrictedTitle: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  restrictedBody: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
