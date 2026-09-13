import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import { getMyCashout, listMyEarnings, listMyReferrals } from '../../api/absMarketer';

export default function AbsDetailScreen({ navigation, route }: any) {
  const { theme, effectiveTheme } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const cashout = route.name === 'CashoutDetails';
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (cashout) setData(await getMyCashout(route.params.id));
      else {
        const [earnings, referrals] = await Promise.all([listMyEarnings(), listMyReferrals()]);
        const businesses: Record<string, any> = {};
        earnings.forEach((e: any) => {
          const key = e.tenantId;
          const b = businesses[key] ||= { name: e.tenant?.name || 'Business', earned: 0, paid: 0 };
          const amount = Number(e.marketerAmount ?? e.amount ?? 0);
          b.earned += amount;
          if (e.status === 'paid') b.paid += amount;
        });
        setData({ referrals: referrals.length, matched: referrals.filter((r: any) => r.status === 'matched').length, businesses: Object.values(businesses) });
      }
    } catch (e: any) { setError(e.response?.data?.message || 'Unable to load. Please retry.'); }
    finally { setLoading(false); }
  }, [cashout, route.params?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const row = (label: string, value: any) => <View key={label} style={{ padding: 16, marginBottom: 10, backgroundColor: colors.cardBackground, borderRadius: 12 }}><Text style={{ color: colors.textSecondary }}>{label}</Text><Text selectable style={{ color: colors.text, fontSize: 18, marginTop: 5 }}>{String(value ?? 'Not available')}</Text></View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <Button onPress={() => navigation.goBack()}>Back</Button>
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={{ fontSize: 24, color: colors.text, marginBottom: 20 }}>{cashout ? 'Cashout details' : 'Reports & analytics'}</Text>
      {!!error && <><Text accessibilityRole="alert" style={{ color: colors.text }}>{error}</Text><Button onPress={load}>Retry</Button></>}
      {loading && !data && <ActivityIndicator />}
      {data && (cashout ? <>
        {row('Business', data.tenant?.name)}{row('Amount', `GHS ${Number(data.amount).toFixed(2)}`)}{row('Status', data.status)}
        {row('Requested', data.createdAt ? new Date(data.createdAt).toLocaleString() : null)}
        {row('Processed', data.processedAt ? new Date(data.processedAt).toLocaleString() : null)}
        {row('Payout reference', data.payoutReference)}{row('Notes', data.notes)}
      </> : <>{row('Referrals', data.referrals)}{row('Matched referrals', data.matched)}{row('Match rate', `${data.referrals ? Math.round(data.matched / data.referrals * 100) : 0}%`)}
        {data.businesses.map((b: any, i: number) => row(`${b.name} (${i + 1})`, `Earned GHS ${b.earned.toFixed(2)} · Paid GHS ${b.paid.toFixed(2)}`))}
        {!data.businesses.length && row('Earnings', 'No commissions yet')}
      </>)}
    </ScrollView>
  </SafeAreaView>;
}
