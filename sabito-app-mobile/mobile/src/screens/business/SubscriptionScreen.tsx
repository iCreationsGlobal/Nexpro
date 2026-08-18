import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Crown, CheckCircle, Calendar, CreditCard, Users, TrendingUp } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Business, PricingPlan } from '../../types/api';

type SubscriptionScreenProps = RootStackScreenProps<'Subscription'>;

interface UsageData {
  marketerLimit?: number;
  currentMarketers?: number;
  referralLimit?: number;
  currentReferrals?: number;
}

interface SubscriptionData {
  business?: Business & {
    subscriptionStartDate?: string;
    subscriptionEndDate?: string;
    isSubscriptionActive?: boolean;
  };
  planConfig?: PricingPlan & {
    price?: number;
    newClientFee?: number;
    returningClientFee?: number;
  };
  usage?: UsageData;
}

const SubscriptionScreen: React.FC<SubscriptionScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async (): Promise<void> => {
    try {
      setIsLoading(true);

      // Fetch complete subscription data from backend (same as web)
      const response = await apiClient.get('/api/subscriptions/business');

      if (response.data.success && response.data.data) {
        setSubscriptionData(response.data.data as SubscriptionData);
      }
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data?.code === 'NO_SUBSCRIPTION_PLAN') {
        // No subscription plan found - could show message or default state
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading subscription...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Subscription</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
        {/* Current Plan Card */}
        <View style={[styles.planCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.planHeader}>
            <View style={[styles.planIconContainer, { 
              backgroundColor: isDark ? colors.backgroundSecondary : '#F0FDF4' 
            }]}>
              <Crown size={32} color={COLORS.APP_GREEN} strokeWidth={1.5} />
            </View>
            <View style={styles.planInfo}>
              <Text style={[styles.planName, { color: colors.text }]}>{subscriptionData?.planConfig?.name || 'Free'} Plan</Text>
              <Text style={[styles.planPrice, { color: colors.textSecondary }]}>
                {subscriptionData?.planConfig?.price === 0 
                  ? 'Free Forever' 
                  : `₵${subscriptionData?.planConfig?.price}/month`}
              </Text>
            </View>
            {subscriptionData?.business?.isSubscriptionActive && (
              <View style={[styles.activeBadge, { 
                backgroundColor: isDark ? colors.backgroundSecondary : '#D1FAE5' 
              }]}>
                <CheckCircle size={16} color="#10B981" strokeWidth={2} />
                <Text style={[styles.activeBadgeText, { 
                  color: isDark ? '#22C55E' : '#065F46' 
                }]}>Active</Text>
              </View>
            )}
          </View>
        </View>

        {/* Plan Details */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Plan Details</Text>
          <View style={[styles.detailsGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
              <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Users size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Marketer Partnerships</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {subscriptionData?.usage?.marketerLimit === -1 
                    ? 'Unlimited' 
                    : `${subscriptionData?.usage?.currentMarketers || 0} / ${subscriptionData?.usage?.marketerLimit || 0}`}
                </Text>
              </View>
            </View>

            <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
              <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Calendar size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Referrals per Month</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {subscriptionData?.usage?.referralLimit === -1 
                    ? 'Unlimited' 
                    : `${subscriptionData?.usage?.currentReferrals || 0} / ${subscriptionData?.usage?.referralLimit || 0}`}
                </Text>
              </View>
            </View>

            {subscriptionData?.business?.subscriptionStartDate && (
              <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
                <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                  <Calendar size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Started On</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {new Date(subscriptionData.business.subscriptionStartDate).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            )}

            {subscriptionData?.business?.subscriptionEndDate && (
              <View style={[styles.detailItem, styles.lastDetailItem]}>
                <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                  <Calendar size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Renews On</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {new Date(subscriptionData.business.subscriptionEndDate).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Platform Fees */}
        {subscriptionData?.planConfig && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Platform Fees</Text>
            <View style={[styles.detailsGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
                <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                  <CreditCard size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>New Client Fee</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {subscriptionData.planConfig.newClientFee || 0}%
                  </Text>
                </View>
              </View>

              <View style={[styles.detailItem, styles.lastDetailItem]}>
                <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                  <CreditCard size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Returning Client Fee</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {subscriptionData.planConfig.returningClientFee || 0}%
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Upgrade Plan Button */}
        {subscriptionData?.business && (
          <View style={styles.upgradeSection}>
            <TouchableOpacity 
              style={styles.upgradeButton}
              onPress={() => navigation.navigate('SignupPlan' as any, { 
                isUpgrade: true,
                currentPlan: subscriptionData?.business?.subscriptionPlan 
              })}
            >
              <View style={styles.upgradeIconContainer}>
                <TrendingUp size={24} color={COLORS.WHITE} strokeWidth={2} />
              </View>
              <View style={styles.upgradeContent}>
                <Text style={styles.upgradeTitle}>Upgrade Your Plan</Text>
                <Text style={styles.upgradeSubtitle}>
                  Unlock more features and grow faster
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  scrollView: {
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
    color: COLORS.GRAY,
  },
  planCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  planPrice: {
    fontSize: FONT_SIZES.md,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    paddingHorizontal: 16,
    paddingVertical: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailsGroup: {
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  lastDetailItem: {
    borderBottomWidth: 0,
  },
  detailIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: FONT_SIZES.sm,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  upgradeSection: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
  upgradeButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 12,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  upgradeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  upgradeContent: {
    flex: 1,
  },
  upgradeTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
    marginBottom: 4,
  },
  upgradeSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.WHITE,
    opacity: 0.9,
  },
});

export default SubscriptionScreen;






