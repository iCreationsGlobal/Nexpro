import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreditCard, TrendingUp, Clock, CheckCircle, XCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { Button } from 'react-native-paper';
import EmptyState from '../../components/common/EmptyState';
import { getMarketerDashboard, listMyEarnings, listMyCashouts } from '../../api/absMarketer';
import { getStatusColor } from '../../utils/statusColors';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Project, Business } from '../../types/api';
import { LucideIcon } from 'lucide-react-native';

type MarketerEarningsScreenProps = RootStackScreenProps<'MarketerEarnings'>;

type EarningStatus = 'paid' | 'pending' | 'rejected' | 'cancelled' | 'processing';
type CashoutStatus = 'pending' | 'processing' | 'paid' | 'rejected';

interface Earning {
  id: string;
  amount: number;
  status: EarningStatus;
  cashoutStatus?: CashoutStatus;
  createdAt: string;
  rateType?: string;
  ratePercent?: number;
  paymentAmount?: number;
  project?: {
    id: string;
    projectName: string;
    business?: {
      id: string;
      businessName: string;
    };
  };
  tenant?: { name?: string };
  Partnership?: { Tenant?: { name?: string } };
}

interface CashoutRow {
  id: string;
  amount: number;
  status: string;
  createdAt?: string;
  requestedAt?: string;
}

interface EarningsSummary {
  availableBalance: number;
  totalEarnings: number;
  pendingCommissions: number;
}

interface DashboardStats {
  stats?: {
    pendingCommissions?: {
      current: number;
    };
  };
}

const STATUS_ICONS: Record<string, LucideIcon> = {
  paid: CheckCircle,
  pending: Clock,
  rejected: XCircle,
  cancelled: XCircle,
  processing: Clock,
};

const MarketerEarnings: React.FC<MarketerEarningsScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [cashouts, setCashouts] = useState<CashoutRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [summary, setSummary] = useState<EarningsSummary>({
    availableBalance: 0,
    totalEarnings: 0,
    pendingCommissions: 0,
  });

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async (): Promise<void> => {
    try {
      const [earningsData, dash, cashoutData] = await Promise.all([
        listMyEarnings(),
        getMarketerDashboard(),
        listMyCashouts().catch(() => []),
      ]);

      setEarnings((earningsData || []) as Earning[]);
      setCashouts((cashoutData || []) as CashoutRow[]);

      setSummary({
        availableBalance: Number(dash.availableBalance || 0),
        totalEarnings: Number(dash.totalEarned || 0),
        pendingCommissions: Number(dash.pendingCommissionsCount || 0),
      });
    } catch (error: any) {
      if (error.response?.status === 404) {
        setEarnings([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = (): void => {
    setRefreshing(true);
    fetchEarnings();
  };

  const handleCashout = (): void => {
    if (summary.availableBalance <= 0) {
      return;
    }
    navigation.navigate('CashoutRequest', { availableBalance: summary.availableBalance });
  };

  const renderStatusBadge = (status: string): React.ReactElement => {
    const normalizedStatus = status?.toLowerCase() || 'pending';
    const statusColors = getStatusColor(status, 'commission');
    const IconComponent = STATUS_ICONS[normalizedStatus] || Clock;
    
    return (
      <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
        <IconComponent size={14} color={statusColors.text} strokeWidth={2} />
        <Text style={[styles.statusText, { color: statusColors.text }]}>
          {status?.charAt(0)?.toUpperCase() + status?.slice(1) || 'Pending'}
        </Text>
      </View>
    );
  };

  const renderEarningCard = (earning: Earning): React.ReactElement => {
    const businessName =
      earning.project?.business?.businessName ||
      earning.tenant?.name ||
      (earning as any).Partnership?.Tenant?.name ||
      'Partner business';
    const title =
      earning.project?.projectName ||
      (earning.rateType
        ? `${earning.rateType} @ ${earning.ratePercent || ''}%`
        : 'Commission');

    return (
    <View key={earning.id} style={[styles.earningCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <View style={styles.earningHeader}>
        <View style={[styles.earningIcon, { 
          backgroundColor: isDark ? 'transparent' : '#F0FDF4',
          borderWidth: isDark ? 1 : 0,
          borderColor: isDark ? colors.border : 'transparent'
        }]}>
          <CreditCard size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
        </View>
        <View style={styles.earningInfo}>
          <Text style={[styles.projectName, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.businessName, { color: colors.textSecondary }]}>{businessName}</Text>
        </View>
      </View>

      <View style={styles.earningStats}>
        <View style={[styles.amountRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Commission</Text>
          <Text style={styles.amountValue}>₵{(earning.amount || 0).toFixed(2)}</Text>
        </View>
        
        <View style={styles.statusRow}>
          {renderStatusBadge(earning.status)}
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {earning.createdAt ? new Date(earning.createdAt).toLocaleDateString() : 'N/A'}
          </Text>
        </View>
      </View>
    </View>
    );
  };

  const renderEmptyState = (): React.ReactElement => (
    <EmptyState 
      icon={CreditCard}
      title="No Earnings Yet"
      subtitle="Your commission earnings will appear here once your referrals convert to projects."
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading earnings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Earnings</Text>
      </View>

      <ScrollView
        style={[styles.scrollView, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.APP_GREEN}
            colors={[COLORS.APP_GREEN]}
          />
        }
      >
        {/* Summary Cards */}
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, { 
            backgroundColor: isDark ? 'transparent' : '#1F4039',
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? colors.border : 'transparent'
          }]}>
            <Text style={[styles.summaryLabel, { color: isDark ? colors.text : COLORS.WHITE }]}>Available Balance</Text>
            <Text style={[styles.summaryValue, { color: isDark ? colors.text : COLORS.WHITE }]}>₵{summary.availableBalance.toFixed(2)}</Text>
          </View>
          
          <View style={styles.summaryRow}>
            <View style={[styles.summarySmallCard, { 
              backgroundColor: isDark ? colors.cardBackground : '#F1F0DC',
              borderWidth: isDark ? 1 : 0,
              borderColor: isDark ? colors.border : 'transparent'
            }]}>
              <Text style={[styles.summarySmallLabel, { color: colors.textSecondary }]}>Total Earnings</Text>
              <Text style={[styles.summarySmallValue, { color: colors.text }]}>₵{summary.totalEarnings.toFixed(2)}</Text>
            </View>
            <View style={[styles.summarySmallCard, { 
              backgroundColor: isDark ? colors.cardBackground : '#F1F0DC',
              borderWidth: isDark ? 1 : 0,
              borderColor: isDark ? colors.border : 'transparent'
            }]}>
              <Text style={[styles.summarySmallLabel, { color: colors.textSecondary }]}>Pending</Text>
              <Text style={[styles.summarySmallValue, { color: colors.text }]}>₵{summary.pendingCommissions.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Cashout Button */}
        <Button
          mode="contained"
          onPress={handleCashout}
          style={styles.cashoutButton}
          contentStyle={styles.cashoutButtonContent}
          labelStyle={styles.cashoutButtonLabel}
          disabled={summary.availableBalance <= 0}
        >
          Request Cashout
        </Button>

        {/* Earnings List */}
        <View style={styles.earningsSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Commission History</Text>
          {earnings.length === 0 ? (
            renderEmptyState()
          ) : (
            earnings.map((earning) => renderEarningCard(earning))
          )}
        </View>

        <View style={styles.earningsSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Cashout requests</Text>
          {cashouts.length === 0 ? (
            <Text style={[styles.dateText, { color: colors.textSecondary, marginTop: 8 }]}>
              No cashout requests yet.
            </Text>
          ) : (
            cashouts.map((c) => (
              <View
                key={c.id}
                style={[styles.earningCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
              >
                <View style={styles.earningStats}>
                  <View style={[styles.amountRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Amount</Text>
                    <Text style={styles.amountValue}>₵{Number(c.amount || 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.statusRow}>
                    {renderStatusBadge(c.status)}
                    <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                      {(c.createdAt || c.requestedAt)
                        ? new Date(String(c.createdAt || c.requestedAt)).toLocaleDateString()
                        : 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  summaryContainer: {
    marginBottom: SPACING.md,
  },
  summaryCard: {
    padding: 20,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: FONT_SIZES.sm,
    opacity: 0.9,
    marginBottom: SPACING.xs,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: FONT_WEIGHTS.bold,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  summarySmallCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  summarySmallLabel: {
    fontSize: FONT_SIZES.xs,
    marginBottom: 4,
  },
  summarySmallValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  cashoutButton: {
    marginBottom: SPACING.lg,
    borderRadius: 12,
  },
  cashoutButtonContent: {
    paddingVertical: 8,
  },
  cashoutButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  earningsSection: {
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
  },
  earningCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: SPACING.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  earningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  earningIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  earningInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  businessName: {
    fontSize: FONT_SIZES.sm,
  },
  earningStats: {
    marginTop: SPACING.sm,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    marginBottom: SPACING.sm,
  },
  amountLabel: {
    fontSize: FONT_SIZES.sm,
  },
  amountValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  dateText: {
    fontSize: FONT_SIZES.xs,
  },
});

export default MarketerEarnings;





