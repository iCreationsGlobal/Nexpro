import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Users,
  Building2,
  Link,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Clock,
  LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import AdminHeader from '../../components/admin/AdminHeader';
import COLORS from '../../constants/colors';
import apiClient from '../../services/apiClient';
import type { AdminTabScreenProps } from '../../types/navigation';

type AdminDashboardScreenProps = AdminTabScreenProps<'Home'>;

interface StatValue {
  current: number;
  previous: number;
  change: number;
}

interface DashboardStats {
  totalUsers?: StatValue;
  totalBusinesses?: StatValue;
  totalMarketers?: StatValue;
  totalReferrals?: StatValue;
  totalRevenue?: StatValue;
  pendingApprovals?: number;
  activeCashouts?: number;
}

const AdminDashboardScreen: React.FC = () => {
  const navigation = useNavigation<AdminDashboardScreenProps['navigation']>();
  const { theme, effectiveTheme, isDark } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: { current: 0, previous: 0, change: 0 },
    totalBusinesses: { current: 0, previous: 0, change: 0 },
    totalMarketers: { current: 0, previous: 0, change: 0 },
    totalReferrals: { current: 0, previous: 0, change: 0 },
    totalRevenue: { current: 0, previous: 0, change: 0 },
    pendingApprovals: 0,
    activeCashouts: 0,
  });
  const [timeFilter, setTimeFilter] = useState<string>('today');

  useEffect(() => {
    // Add a small delay to avoid simultaneous requests when navigating to admin
    const timeoutId = setTimeout(() => {
      fetchDashboardData();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [timeFilter]);

  const fetchDashboardData = async (): Promise<void> => {
    try {
      setLoading(true);
      // Use the same endpoint as web app: /api/admin/reports
      const response = await apiClient.get<{ 
        success: boolean; 
        data: { 
          platformStats?: {
            totalUsers?: number;
            activeMarketers?: number;
            activeBusinesses?: number;
            totalRevenue?: number;
            totalReferrals?: number;
            userGrowth?: number;
            marketerGrowth?: number;
            businessGrowth?: number;
            revenueGrowth?: number;
            referralGrowth?: number;
          };
        } 
      }>(`/api/admin/reports?period=${timeFilter}`);
      
      if (response?.data?.success && response.data.data?.platformStats) {
        const platformStats = response.data.data.platformStats;
        
        // Transform the response to match mobile app's expected format
        // Calculate previous values from current and growth
        const previousUsers = (platformStats.totalUsers || 0) - (platformStats.userGrowth || 0);
        const previousMarketers = (platformStats.activeMarketers || 0) - (platformStats.marketerGrowth || 0);
        const previousBusinesses = (platformStats.activeBusinesses || 0) - (platformStats.businessGrowth || 0);
        const previousRevenue = (platformStats.totalRevenue || 0) - (platformStats.revenueGrowth || 0);
        const previousReferrals = (platformStats.totalReferrals || 0) - (platformStats.referralGrowth || 0);
        
        setStats({
          totalUsers: {
            current: platformStats.totalUsers || 0,
            previous: previousUsers,
            change: platformStats.userGrowth || 0,
          },
          totalMarketers: {
            current: platformStats.activeMarketers || 0,
            previous: previousMarketers,
            change: platformStats.marketerGrowth || 0,
          },
          totalBusinesses: {
            current: platformStats.activeBusinesses || 0,
            previous: previousBusinesses,
            change: platformStats.businessGrowth || 0,
          },
          totalReferrals: {
            current: platformStats.totalReferrals || 0,
            previous: previousReferrals,
            change: platformStats.referralGrowth || 0,
          },
          totalRevenue: {
            current: platformStats.totalRevenue || 0,
            previous: previousRevenue,
            change: platformStats.revenueGrowth || 0,
          },
          pendingApprovals: 0, // Will be fetched separately if needed
          activeCashouts: 0, // Will be fetched separately if needed
        });
      } else {
        console.warn('[AdminDashboard] Unexpected response structure:', response?.data);
      }
    } catch (error: any) {
      // Enhanced error logging for token issues
      if (error?.response?.status === 401) {
        console.error('[AdminDashboard] ⚠️ Token expired or invalid:', {
          status: error.response.status,
          code: error.response?.data?.code,
          message: error.response?.data?.message,
          expiredAt: error.response?.data?.expiredAt,
          url: `/api/admin/reports?period=${timeFilter}`,
        });
        // Token refresh should be handled by apiClient interceptor
      } else if (error?.response?.status === 403) {
        console.error('[AdminDashboard] ⚠️ Access forbidden - not an admin:', error.response?.data);
        Alert.alert('Access Denied', 'You do not have admin access.');
      } else {
        console.error('[AdminDashboard] Failed to fetch dashboard data:', {
          message: error?.message,
          status: error?.response?.status,
          statusText: error?.response?.statusText,
          data: error?.response?.data,
        });
        Alert.alert('Error', 'Failed to load dashboard data. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const renderStatCard = (
    title: string, 
    value: number | string, 
    icon: React.ReactElement, 
    change: number | undefined, 
    color: string = COLORS.APP_GREEN
  ): React.ReactElement => {
    const isPositive = change !== undefined ? change >= 0 : true;
    const TrendIcon: LucideIcon = isPositive ? TrendingUp : TrendingDown;

    return (
      <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.statHeader}>
          <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
            {icon}
          </View>
          <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{title}</Text>
        </View>
        <Text style={[styles.statValue, { color: colors.text }]}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Text>
        {change !== undefined && (
          <View style={styles.changeContainer}>
            <TrendIcon
              size={16}
              color={isPositive ? COLORS.SUCCESS : COLORS.ERROR}
              strokeWidth={2}
            />
            <Text style={[styles.changeText, { color: isPositive ? COLORS.SUCCESS : COLORS.ERROR }]}>
              {Math.abs(change).toFixed(1)}% vs previous
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderQuickAction = (
    title: string, 
    subtitle: string, 
    onPress: () => void, 
    icon: React.ReactElement, 
    badgeCount: number = 0
  ): React.ReactElement => {
    return (
      <TouchableOpacity
        style={[styles.quickAction, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        onPress={onPress}
      >
        <View style={styles.quickActionContent}>
          <View style={[styles.quickActionIcon, { backgroundColor: `${COLORS.APP_GREEN}15` }]}>
            {icon}
          </View>
          <View style={styles.quickActionText}>
            <Text style={[styles.quickActionTitle, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.quickActionSubtitle, { color: colors.textSecondary }]}>
              {subtitle}
            </Text>
          </View>
          {badgeCount > 0 && (
            <View style={[styles.actionBadge, { backgroundColor: COLORS.ERROR }]}>
              <Text style={styles.actionBadgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const timeFilters = [
    { label: 'Today', value: 'today' },
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
    { label: 'Year', value: 'year' },
  ];

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AdminHeader title="Dashboard" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading dashboard...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AdminHeader title="Dashboard" />
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.APP_GREEN}
          />
        }
      >
        {/* Time Filters */}
        <View style={styles.filtersContainer}>
          {timeFilters.map((filter) => (
            <TouchableOpacity
              key={filter.value}
              style={[
                styles.filterButton,
                {
                  backgroundColor:
                    timeFilter === filter.value ? COLORS.APP_GREEN : colors.cardBackground,
                  borderColor: timeFilter === filter.value ? COLORS.APP_GREEN : colors.border,
                },
              ]}
              onPress={() => setTimeFilter(filter.value)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  {
                    color:
                      timeFilter === filter.value ? COLORS.WHITE : colors.text,
                  },
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats Grid - 2 Cards Per Row */}
        <View style={styles.statsGrid}>
          {renderStatCard(
            'Businesses',
            stats?.totalBusinesses?.current || 0,
            <Building2 size={24} color="#3B82F6" strokeWidth={2} />,
            stats?.totalBusinesses?.change || 0,
            '#3B82F6'
          )}
          {renderStatCard(
            'Marketers',
            stats?.totalMarketers?.current || 0,
            <Users size={24} color="#8B5CF6" strokeWidth={2} />,
            stats?.totalMarketers?.change || 0,
            '#8B5CF6'
          )}
          {renderStatCard(
            'Referrals',
            stats?.totalReferrals?.current || 0,
            <Link size={24} color="#F59E0B" strokeWidth={2} />,
            stats?.totalReferrals?.change || 0,
            '#F59E0B'
          )}
          {renderStatCard(
            'Revenue',
            `GHS ${(stats?.totalRevenue?.current || 0).toLocaleString()}`,
            <DollarSign size={24} color="#10B981" strokeWidth={2} />,
            stats?.totalRevenue?.change || 0,
            '#10B981'
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
          {renderQuickAction(
            'Pending Approvals',
            'Review business applications',
            () => navigation.navigate('AdminBusinesses' as any),
            <CheckCircle size={24} color={COLORS.APP_GREEN} strokeWidth={2} />,
            stats.pendingApprovals || 0
          )}
          {renderQuickAction(
            'Cashout Requests',
            'Process marketer payments',
            () => navigation.navigate('AdminCashoutRequests' as any),
            <DollarSign size={24} color={COLORS.APP_GREEN} strokeWidth={2} />,
            stats.activeCashouts || 0
          )}
          {renderQuickAction(
            'View All Businesses',
            'Manage all businesses',
            () => navigation.navigate('AdminBusinesses' as any),
            <Building2 size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
          )}
          {renderQuickAction(
            'View All Marketers',
            'Manage all marketers',
            () => navigation.navigate('AdminMarketers' as any),
            <Users size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  filtersContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    maxWidth: '48%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  quickAction: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  quickActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    flex: 1,
    marginLeft: 16,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  quickActionSubtitle: {
    fontSize: 13,
  },
  actionBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  actionBadgeText: {
    color: COLORS.WHITE,
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default AdminDashboardScreen;



