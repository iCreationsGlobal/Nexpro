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
  Share2,
  CheckCircle,
  BarChart3,
  ExternalLink,
  Calendar,
  Target,
  Award,
  CreditCard,
  Landmark
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

type BusinessReportsProps = RootStackScreenProps<'BusinessReports'>;

interface StatValue {
  current: number;
  previous: number;
}

interface Stats {
  totalMarketers: StatValue;
  activeReferrals: StatValue;
  totalProjects: StatValue;
  activeProjects: StatValue;
  completedProjects: StatValue;
  totalRevenue: StatValue;
  marketerCommissions: StatValue;
  platformFees: StatValue;
  conversionRate: StatValue;
}

const BusinessReports: React.FC<BusinessReportsProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [stats, setStats] = useState<Stats>({
    totalMarketers: { current: 0, previous: 0 },
    activeReferrals: { current: 0, previous: 0 },
    totalProjects: { current: 0, previous: 0 },
    activeProjects: { current: 0, previous: 0 },
    completedProjects: { current: 0, previous: 0 },
    totalRevenue: { current: 0, previous: 0 },
    marketerCommissions: { current: 0, previous: 0 },
    platformFees: { current: 0, previous: 0 },
    conversionRate: { current: 0, previous: 0 },
  });

  useEffect(() => {
    fetchReportsData();
  }, []);

  const fetchReportsData = async (): Promise<void> => {
    try {
      // Fetch reports data
      const response = await apiClient.get('/api/business/reports?period=30days');
      // Fetch platform fees separately
      let platformFeesTotal = 0;
      try {
        const platformFeesResponse = await apiClient.get('/api/platform-fees/business');
        
        if ((platformFeesResponse.data as any)?.fees) {
          // Calculate total paid platform fees
          platformFeesTotal = ((platformFeesResponse.data as any).fees as any[])
            .filter((fee: any) => fee.status === 'paid')
            .reduce((sum: number, fee: any) => sum + (fee.amount || 0), 0);
        }
      } catch (pfError) {
        platformFeesTotal = 0;
      }

      if ((response.data as any)?.success && (response.data as any)?.data) {
        const businessStats = (response.data as any).data.businessStats || {};
        // Extract conversion rate with detailed logging
        const conversionRateCurrent = businessStats.conversionRate?.current || 0;
        // Map backend data to our stats structure with previous period calculation
        const mappedStats: Stats = {
          totalMarketers: {
            current: businessStats.activeMarketers?.current || 0,
            previous: Math.max(0, (businessStats.activeMarketers?.current || 0) - (businessStats.activeMarketers?.change || 0)),
          },
          activeReferrals: {
            current: businessStats.totalReferrals?.current || 0,
            previous: Math.max(0, (businessStats.totalReferrals?.current || 0) - (businessStats.totalReferrals?.change || 0)),
          },
          totalProjects: {
            current: businessStats.totalProjects?.current || 0,
            previous: Math.max(0, (businessStats.totalProjects?.current || 0) - (businessStats.totalProjects?.change || 0)),
          },
          activeProjects: {
            current: businessStats.activeProjects?.current || 0,
            previous: Math.max(0, (businessStats.activeProjects?.current || 0) - (businessStats.activeProjects?.change || 0)),
          },
          completedProjects: {
            current: businessStats.completedProjects?.current || 0,
            previous: Math.max(0, (businessStats.completedProjects?.current || 0) - (businessStats.completedProjects?.change || 0)),
          },
          totalRevenue: {
            current: businessStats.totalRevenue?.current || 0,
            previous: Math.max(0, (businessStats.totalRevenue?.current || 0) - (businessStats.totalRevenue?.change || 0)),
          },
          marketerCommissions: {
            current: businessStats.marketerCommissions?.current || 0,
            previous: Math.max(0, (businessStats.marketerCommissions?.current || 0) - (businessStats.marketerCommissions?.change || 0)),
          },
          platformFees: {
            current: platformFeesTotal,
            previous: 0, // Could be calculated if needed
          },
          conversionRate: {
            current: conversionRateCurrent,
            previous: Math.max(0, conversionRateCurrent - (businessStats.conversionRate?.change || 0)),
          },
        };
        setStats(mappedStats);
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error.response?.data?.message || 'Failed to load reports data',
        buttons: [{ text: 'OK' }]
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await fetchReportsData();
  };

  const handleExportReport = async (): Promise<void> => {
    try {
      // Open web app reports page in browser
      const user = await AsyncStorage.getItem('user');
      if (user) {
        const parsedUser = JSON.parse(user);
        const webUrl = `https://app.sabito.app/business/reports?userId=${parsedUser.id}`;
        const supported = await Linking.canOpenURL(webUrl);
        if (supported) {
          await Linking.openURL(webUrl);
        } else {
          showDialog({
            title: 'Error',
            message: 'Cannot open web browser',
            buttons: [{ text: 'OK' }]
          });
        }
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Failed to open reports page',
        buttons: [{ text: 'OK' }]
      });
    }
  };

  const calculateChange = (stat: StatValue): { value: number; isPositive: boolean } => {
    if (stat.previous === 0) {
      return { value: stat.current > 0 ? 100 : 0, isPositive: true };
    }
    const change = ((stat.current - stat.previous) / stat.previous) * 100;
    return { value: Math.abs(change), isPositive: change >= 0 };
  };

  const formatCurrency = (amount: number): string => {
    return `₵${amount.toFixed(2)}`;
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(1)}%`;
  };

  const renderStatCard = (
    icon: React.ReactElement,
    title: string,
    stat: StatValue,
    formatter: (value: number) => string = (v) => v.toString()
  ): React.ReactElement => {
    const change = calculateChange(stat);
    const ChangeIcon = change.isPositive ? TrendingUp : TrendingDown;
    
    return (
      <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.statHeader}>
          <View style={[styles.iconContainer, { backgroundColor: isDark ? 'transparent' : '#F0FDF4', borderWidth: isDark ? 1 : 0, borderColor: colors.border }]}>
            {icon}
          </View>
          <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{title}</Text>
        </View>
        <View style={styles.statValueContainer}>
          <Text style={[styles.statValue, { color: colors.text }]}>{formatter(stat.current)}</Text>
          <View style={[styles.changeContainer, { backgroundColor: isDark ? 'transparent' : (change.isPositive ? '#E8F5E9' : '#FEE2E2'), borderWidth: isDark ? 1 : 0, borderColor: colors.border }]}>
            <ChangeIcon size={14} color={change.isPositive ? COLORS.SUCCESS : COLORS.ERROR} strokeWidth={2} />
            <Text style={[styles.changeText, { color: change.isPositive ? COLORS.SUCCESS : COLORS.ERROR }]}>
              {formatPercentage(change.value)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading reports...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Reports & Analytics</Text>
        <TouchableOpacity onPress={handleExportReport} style={styles.exportButton}>
          <ExternalLink size={20} color={colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={[styles.scrollView, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.APP_GREEN}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Overview Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Overview</Text>
          <View style={styles.statsGrid}>
            {renderStatCard(
              <Users size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Active Marketers',
              stats.totalMarketers
            )}
            {renderStatCard(
              <FolderOpen size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Active Referrals',
              stats.activeReferrals
            )}
            {renderStatCard(
              <BarChart3 size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Total Projects',
              stats.totalProjects
            )}
            {renderStatCard(
              <CheckCircle size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Completed',
              stats.completedProjects
            )}
          </View>
        </View>

        {/* Financial Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Financial</Text>
          <View style={styles.statsGrid}>
            {renderStatCard(
              <DollarSign size={24} color={COLORS.SUCCESS} strokeWidth={1.5} />,
              'Total Revenue',
              stats.totalRevenue,
              formatCurrency
            )}
            {renderStatCard(
              <CreditCard size={24} color={COLORS.WARNING} strokeWidth={1.5} />,
              'Marketer Commissions',
              stats.marketerCommissions,
              formatCurrency
            )}
            {renderStatCard(
              <Landmark size={24} color={COLORS.ERROR} strokeWidth={1.5} />,
              'Platform Fees',
              stats.platformFees,
              formatCurrency
            )}
          </View>
        </View>

        {/* Performance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Performance</Text>
          <View style={styles.statsGrid}>
            {renderStatCard(
              <Target size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Conversion Rate',
              stats.conversionRate,
              formatPercentage
            )}
            {renderStatCard(
              <Award size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Active Projects',
              stats.activeProjects
            )}
          </View>
        </View>

        {/* Export Notice */}
        <View style={[styles.exportNotice, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <ExternalLink size={20} color={colors.primary} strokeWidth={1.5} />
          <Text style={[styles.exportNoticeText, { color: colors.textSecondary }]}>
            For detailed reports and analytics, export to web
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>

    <CustomDialog
      visible={dialog.visible}
      title={dialog.title}
      message={dialog.message}
      buttons={dialog.buttons}
      onClose={hideDialog}
    />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  exportButton: {
    padding: SPACING.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  statTitle: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    fontWeight: FONT_WEIGHTS.medium,
  },
  statValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
  },
  changeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.SUCCESS,
  },
  exportNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
    marginTop: SPACING.md,
  },
  exportNoticeText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
});

export default BusinessReports;






