import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Mail, UserCheck, Wallet } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import { listMyReferrals, listMyCashouts, listMyApplications } from '../../api/absMarketer';

type Props = { navigation: any };

type ActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  createdAt?: string;
  kind: 'referral' | 'cashout' | 'application';
  meta?: any;
};

const AllActivitiesScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [refs, cashouts, apps] = await Promise.all([
        listMyReferrals().catch(() => []),
        listMyCashouts().catch(() => []),
        listMyApplications().catch(() => []),
      ]);

      const mapped: ActivityItem[] = [
        ...(refs || []).map((r: any) => ({
          id: `ref-${r.id}`,
          title: `Referral: ${r.clientName || 'Client'}`,
          subtitle: String(r.status || 'pending'),
          createdAt: r.createdAt,
          kind: 'referral' as const,
          meta: r,
        })),
        ...(cashouts || []).map((c: any) => ({
          id: `co-${c.id}`,
          title: `Cashout GHS ${Number(c.amount || 0).toFixed(2)}`,
          subtitle: String(c.status || 'pending'),
          createdAt: c.createdAt || c.requestedAt,
          kind: 'cashout' as const,
          meta: c,
        })),
        ...(apps || []).map((a: any) => ({
          id: `app-${a.id}`,
          title: 'Partnership application',
          subtitle: String(a.status || 'pending'),
          createdAt: a.createdAt,
          kind: 'application' as const,
          meta: a,
        })),
      ].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

      setItems(mapped);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const iconFor = (kind: ActivityItem['kind']) => {
    if (kind === 'cashout') return Wallet;
    if (kind === 'application') return UserCheck;
    return Mail;
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>All activities</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.APP_GREEN} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={COLORS.APP_GREEN}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No activity yet.</Text>
          }
          renderItem={({ item }) => {
            const Icon = iconFor(item.kind);
            return (
              <TouchableOpacity
                style={[styles.row, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => {
                  if (item.kind === 'referral' && item.meta?.id) {
                    navigation.navigate('MarketerReferralDetails', {
                      referralId: item.meta.id,
                      initialData: item.meta,
                    });
                  } else if (item.kind === 'cashout') {
                    navigation.navigate('MarketerTabs', { screen: 'Earnings' });
                  } else {
                    navigation.navigate('MarketerTabs', { screen: 'Businesses' });
                  }
                }}
              >
                <View style={[styles.iconWrap, { borderColor: colors.border }]}>
                  <Icon size={18} color={COLORS.APP_GREEN} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.sub, { color: colors.textSecondary }]}>
                    {item.subtitle}
                    {item.createdAt
                      ? ` · ${new Date(item.createdAt).toLocaleDateString()}`
                      : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.semibold },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: FONT_SIZES.md },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.semibold },
  sub: { fontSize: FONT_SIZES.sm, marginTop: 2 },
});

export default AllActivitiesScreen;
