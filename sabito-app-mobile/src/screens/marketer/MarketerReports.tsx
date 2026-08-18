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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  FolderOpen, 
  DollarSign, 
  Clock,
  CheckCircle,
  BarChart3,
  ExternalLink,
  Calendar,
  Target,
  Award,
  LucideIcon,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';

type MarketerReportsScreenProps = RootStackScreenProps<'MarketerReports'>;

interface StatValue {
  current: number;
  previous: number;
}

interface ReportsStats {
  totalReferrals: StatValue;
  activeProjects: StatValue;
  totalEarnings: StatValue;
  pendingCommissions: StatValue;
  conversionRate: StatValue;
  completedProjects: StatValue;
}

interface MarketerStatsResponse {
  success: boolean;
  data?: {
    marketerStats?: {
      totalReferrals?: { current: number; change?: number };
      conversions?: { current: number; change?: number };
      totalEarnings?: { current: number; change?: number };
      pendingCommissions?: { current: number; change?: number };
    };
  };
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  subValue?: string;
  trendCurrent?: number;
  trendPrevious?: number;
  iconBg: string;
  iconColor: string;
}

const MarketerReports: React.FC<MarketerReportsScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [stats, setStats] = useState<ReportsStats>({
    totalReferrals: { current: 0, previous: 0 },
    activeProjects: { current: 0, previous: 0 },
    totalEarnings: { current: 0, previous: 0 },
    pendingCommissions: { current: 0, previous: 0 },
    conversionRate: { current: 0, previous: 0 },
    completedProjects: { current: 0, previous: 0 },
  });

  useEffect(() => {
    fetchReportsData();
  }, []);

  const fetchReportsData = async (): Promise<void> => {
    try {
      const response = await apiClient.get<MarketerStatsResponse>('/api/marketer/reports?period=30days');
      if (response.data?.success && response.data?.data) {
        const marketerStats = response.data.data.marketerStats || {};
        // Calculate conversion rate
        const totalRefs = marketerStats.totalReferrals?.current || 0;
        const conversions = marketerStats.conversions?.current || 0;
        const conversionRate = totalRefs > 0 ? (conversions / totalRefs) * 100 : 0;
        // Map backend data to our stats structure with previous period calculation
        const mappedStats: ReportsStats = {
          totalReferrals: {
            current: totalRefs,
            previous: Math.max(0, totalRefs - (marketerStats.totalReferrals?.change || 0)),
          },
          activeProjects: {
            current: conversions,
            previous: Math.max(0, conversions - (marketerStats.conversions?.change || 0)),
          },
          totalEarnings: {
            current: marketerStats.totalEarnings?.current || 0,
            previous: Math.max(0, (marketerStats.totalEarnings?.current || 0) - (marketerStats.totalEarnings?.change || 0)),
          },
          pendingCommissions: {
            current: marketerStats.pendingCommissions?.current || 0,
            previous: Math.max(0, (marketerStats.pendingCommissions?.current || 0) - (marketerStats.pendingCommissions?.change || 0)),
          },
          conversionRate: {
            current: conversionRate,
            previous: 0, // Backend doesn't provide previous conversion rate
          },
          completedProjects: {
            current: conversions,
            previous: Math.max(0, conversions - (marketerStats.conversions?.change || 0)),
          },
        };
        setStats(mappedStats);
      }
    } catch (error: any) {
      // Error handling - silent failure for now
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = (): void => {
    setRefreshing(true);
    fetchReportsData();
  };

  const handleViewFullReports = async (): Promise<void> => {
    try {
      // Get user data to construct proper web URL
      const userDataString = await AsyncStorage.getItem('user');
      const userData = userDataString ? JSON.parse(userDataString) : null;
      
      // Open web reports page
      const webUrl = 'https://sabito.io/marketer/reports'; // Replace with your actual web URL
      
      showDialog({
        title: 'View Full Reports',
        message: 'You will be redirected to the web version to access detailed analytics, charts, and export features.',
        buttons: [
          { text: 'Cancel', style: 'cancel', onPress: hideDialog },
          {
            text: 'Open Web',
            onPress: async () => {
              hideDialog();
              const supported = await Linking.canOpenURL(webUrl);
              if (supported) {
                await Linking.openURL(webUrl);
              }
            },
            style: 'default',
          },
        ]
      });
    } catch (error: any) {
      // Error handling
    }
  };

  const formatCurrency = (amount: number): string => {
    return `₵${parseFloat(String(amount || 0)).toFixed(2)}`;
  };

  const calculateChange = (current: number, previous: number): string => {
    if (previous === 0) return '0';
    return (((current - previous) / previous) * 100).toFixed(1);
  };

  const renderTrendIndicator = (current: number, previous: number): React.ReactElement | null => {
    const change = calculateChange(current, previous);
    const isPositive = parseFloat(change) >= 0;
    
    if (change === '0' || change === '0.0') {
      return null;
    }

    return (
      <View style={[styles.trendBadge, { backgroundColor: isPositive ? '#DCFCE7' : '#FEE2E2' }]}>
        {isPositive ? (
          <TrendingUp size={12} color="#16A34A" strokeWidth={2} />
        ) : (
          <TrendingDown size={12} color="#DC2626" strokeWidth={2} />
        )}
        <Text style={[styles.trendText, { color: isPositive ? '#16A34A' : '#DC2626' }]}>
          {Math.abs(parseFloat(change))}%
        </Text>
      </View>
    );
  };

  const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, subValue, trendCurrent, trendPrevious, iconBg, iconColor }) => (
    <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <View style={[styles.statIconContainer, { backgroundColor: iconBg }]}>
        <Icon size={18} color={iconColor} strokeWidth={2} />
      </View>
      
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
        {trendCurrent !== undefined && trendPrevious !== undefined && 
          renderTrendIndicator(trendCurrent, trendPrevious)
        }
      </View>
      
      {subValue && (
        <Text style={[styles.statSubValue, { color: colors.textSecondary }]}>{subValue}</Text>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading reports...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Reports</Text>
        <View style={{ width: 40 }} />
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
        {/* Period Indicator */}
        <View style={[styles.periodCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Calendar size={20} color={colors.iconSecondary} strokeWidth={1.5} />
          <Text style={[styles.periodText, { color: colors.text }]}>
            Current Period (Last 30 Days)
          </Text>
        </View>

        {/* Quick Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard
            icon={Users}
            label="Total Referrals"
            value={stats.totalReferrals.current.toString()}
            trendCurrent={stats.totalReferrals.current}
            trendPrevious={stats.totalReferrals.previous}
            iconBg={isDark ? colors.backgroundSecondary : '#EEF2FF'}
            iconColor="#6366F1"
          />
          
          <StatCard
            icon={FolderOpen}
            label="Active Projects"
            value={stats.activeProjects.current.toString()}
            trendCurrent={stats.activeProjects.current}
            trendPrevious={stats.activeProjects.previous}
            iconBg={isDark ? colors.backgroundSecondary : '#FEF3C7'}
            iconColor="#F59E0B"
          />
          
          <StatCard
            icon={DollarSign}
            label="Total Earnings"
            value={formatCurrency(stats.totalEarnings.current)}
            trendCurrent={stats.totalEarnings.current}
            trendPrevious={stats.totalEarnings.previous}
            iconBg={isDark ? colors.backgroundSecondary : '#D1FAE5'}
            iconColor="#10B981"
          />
          
          <StatCard
            icon={Clock}
            label="Pending"
            value={formatCurrency(stats.pendingCommissions.current)}
            trendCurrent={stats.pendingCommissions.current}
            trendPrevious={stats.pendingCommissions.previous}
            iconBg={isDark ? colors.backgroundSecondary : '#FEE2E2'}
            iconColor="#EF4444"
          />
          
          <StatCard
            icon={CheckCircle}
            label="Completed"
            value={stats.completedProjects.current.toString()}
            subValue="Projects"
            trendCurrent={stats.completedProjects.current}
            trendPrevious={stats.completedProjects.previous}
            iconBg={isDark ? colors.backgroundSecondary : '#E0F2FE'}
            iconColor="#0EA5E9"
          />
          
          <StatCard
            icon={Target}
            label="Conversion Rate"
            value={`${stats.conversionRate.current.toFixed(2)}%`}
            trendCurrent={stats.conversionRate.current}
            trendPrevious={stats.conversionRate.previous}
            iconBg={isDark ? colors.backgroundSecondary : '#FCE7F3'}
            iconColor="#EC4899"
          />
        </View>

        {/* Full Reports CTA */}
        <View style={[styles.webReportsCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.ctaIconContainer}>
            <BarChart3 size={28} color={COLORS.APP_GREEN} strokeWidth={2} />
          </View>
          
          <Text style={[styles.ctaTitle, { color: colors.text }]}>
            Want Detailed Analytics?
          </Text>
          
          <Text style={[styles.ctaDescription, { color: colors.textSecondary }]}>
            View interactive charts, trends, and export reports on web
          </Text>
          
          <TouchableOpacity
            style={styles.webButton}
            onPress={handleViewFullReports}
            activeOpacity={0.8}
          >
            <Text style={styles.webButtonText}>Open Web Reports</Text>
            <ExternalLink size={18} color={COLORS.WHITE} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CustomDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={hideDialog}
      />
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
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  periodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  periodText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    marginBottom: SPACING.xs,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  statSubValue: {
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  trendText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  webReportsCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  ctaIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  ctaTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  ctaDescription: {
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  webButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.APP_GREEN,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: SPACING.sm,
  },
  webButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default MarketerReports;





