import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Platform,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, TrendingUp, Info } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Business, PricingPlan } from '../../types/api';

type CommissionsSetupScreenProps = RootStackScreenProps<'CommissionsSetup'>;

const CommissionsSetupScreen: React.FC<CommissionsSetupScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [business, setBusiness] = useState<Business | null>(null);
  const [pricingPlan, setPricingPlan] = useState<PricingPlan | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    loadCommissionData();

    return () => {
      // Cleanup if needed
    };
  }, []);

  const loadCommissionData = async (isRefresh = false): Promise<void> => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const businessData = await AsyncStorage.getItem('business');

      if (businessData) {
        const parsedBusiness = JSON.parse(businessData) as Business;
        setBusiness(parsedBusiness);
        // Fetch pricing plan for platform fees
        if (parsedBusiness.subscriptionPlan) {
          const response = await apiClient.get('/api/pricing/active');
          
          if (response.data.success && response.data.plans) {
            const plan = (response.data.plans as PricingPlan[]).find(p => p.slug === parsedBusiness.subscriptionPlan);
            if (plan) {
              setPricingPlan(plan);
            }
          }
        }
      }
    } catch (error) {
      // Silent fail
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    loadCommissionData(true);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading commission setup...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Commissions Setup</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={[styles.scrollView, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={[COLORS.APP_GREEN]}
            tintColor={COLORS.APP_GREEN}
          />
        }
      >
        {/* Info Box */}
        <View style={[styles.infoBox, { 
          backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6' 
        }]}>
          <Info size={18} color={colors.iconSecondary} strokeWidth={2} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            View your commission structure for platform fees and marketer payments.
          </Text>
        </View>

        {/* Platform Fees Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Platform Fees</Text>
          </View>
          
          <View style={styles.ratesContainer}>
            <View style={[styles.rateCard, { 
              backgroundColor: colors.cardBackground,
              borderColor: colors.border
            }]}>
              <View style={styles.rateHeader}>
                <Users size={20} color={colors.iconSecondary} strokeWidth={2} />
                <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>New Clients</Text>
              </View>
              <Text style={[styles.rateValue, { color: colors.text }]}>{pricingPlan?.platformFeeNew || 8}%</Text>
              <Text style={[styles.rateDescription, { color: colors.textSecondary }]}>
                Fee charged on first-time client projects
              </Text>
            </View>

            <View style={[styles.rateCard, { 
              backgroundColor: colors.cardBackground,
              borderColor: colors.border
            }]}>
              <View style={styles.rateHeader}>
                <TrendingUp size={20} color={colors.iconSecondary} strokeWidth={2} />
                <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>Returning Clients</Text>
              </View>
              <Text style={[styles.rateValue, { color: colors.text }]}>{pricingPlan?.platformFeeReturning || 2}%</Text>
              <Text style={[styles.rateDescription, { color: colors.textSecondary }]}>
                Fee charged on repeat client projects
              </Text>
            </View>
          </View>
        </View>

        {/* Marketer Commissions Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Marketer Commissions</Text>
          </View>
          
          <View style={styles.ratesContainer}>
            <View style={[styles.rateCard, { 
              backgroundColor: colors.cardBackground,
              borderColor: colors.border
            }]}>
              <View style={styles.rateHeader}>
                <Users size={20} color={colors.iconSecondary} strokeWidth={2} />
                <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>New Clients</Text>
              </View>
              <Text style={[styles.rateValue, { color: colors.text }]}>{business?.commissionRateNew || 15}%</Text>
              <Text style={[styles.rateDescription, { color: colors.textSecondary }]}>
                Paid to marketers for new clients
              </Text>
            </View>

            <View style={[styles.rateCard, { 
              backgroundColor: colors.cardBackground,
              borderColor: colors.border
            }]}>
              <View style={styles.rateHeader}>
                <TrendingUp size={20} color={colors.iconSecondary} strokeWidth={2} />
                <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>Returning Clients</Text>
              </View>
              <Text style={[styles.rateValue, { color: colors.text }]}>{business?.commissionRateReturning || 10}%</Text>
              <Text style={[styles.rateDescription, { color: colors.textSecondary }]}>
                Paid when clients return
              </Text>
            </View>
          </View>
        </View>

        {/* Example Calculation */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Example Calculation</Text>
          </View>

          {/* New Client Example */}
          <View style={[styles.exampleCard, { 
            backgroundColor: colors.cardBackground,
            borderColor: colors.border
          }]}>
            <View style={styles.exampleHeader}>
              <Text style={[styles.exampleType, { color: colors.text }]}>New Client</Text>
              <Text style={[styles.exampleAmount, { color: colors.textSecondary }]}>₵1,000</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.calcRow}>
              <Text style={[styles.calcLabel, { color: colors.textSecondary }]}>Project Amount</Text>
              <Text style={[styles.calcValue, { color: colors.text }]}>₵1,000.00</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={[styles.calcLabel, { color: colors.textSecondary }]}>Platform Fee ({pricingPlan?.platformFeeNew || 8}%)</Text>
              <Text style={[styles.calcDeduction, { color: colors.textSecondary }]}>
                -₵{((1000 * (pricingPlan?.platformFeeNew || 8)) / 100).toFixed(2)}
              </Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={[styles.calcLabel, { color: colors.textSecondary }]}>Marketer Fee ({business?.commissionRateNew || 15}%)</Text>
              <Text style={[styles.calcDeduction, { color: colors.textSecondary }]}>
                -₵{((1000 * (business?.commissionRateNew || 15)) / 100).toFixed(2)}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.calcRow}>
              <Text style={[styles.calcTotal, { color: colors.text }]}>You Receive</Text>
              <Text style={[styles.calcTotalValue, { color: COLORS.APP_GREEN }]}>
                ₵{(1000 - ((1000 * (pricingPlan?.platformFeeNew || 8)) / 100) - ((1000 * (business?.commissionRateNew || 15)) / 100)).toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Returning Client Example */}
          <View style={[styles.exampleCard, { 
            backgroundColor: colors.cardBackground,
            borderColor: colors.border
          }]}>
            <View style={styles.exampleHeader}>
              <Text style={[styles.exampleType, { color: colors.text }]}>Returning Client</Text>
              <Text style={[styles.exampleAmount, { color: colors.textSecondary }]}>₵1,000</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.calcRow}>
              <Text style={[styles.calcLabel, { color: colors.textSecondary }]}>Project Amount</Text>
              <Text style={[styles.calcValue, { color: colors.text }]}>₵1,000.00</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={[styles.calcLabel, { color: colors.textSecondary }]}>Platform Fee ({pricingPlan?.platformFeeReturning || 2}%)</Text>
              <Text style={[styles.calcDeduction, { color: colors.textSecondary }]}>
                -₵{((1000 * (pricingPlan?.platformFeeReturning || 2)) / 100).toFixed(2)}
              </Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={[styles.calcLabel, { color: colors.textSecondary }]}>Marketer Fee ({business?.commissionRateReturning || 10}%)</Text>
              <Text style={[styles.calcDeduction, { color: colors.textSecondary }]}>
                -₵{((1000 * (business?.commissionRateReturning || 10)) / 100).toFixed(2)}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.calcRow}>
              <Text style={[styles.calcTotal, { color: colors.text }]}>You Receive</Text>
              <Text style={[styles.calcTotalValue, { color: COLORS.APP_GREEN }]}>
                ₵{(1000 - ((1000 * (pricingPlan?.platformFeeReturning || 2)) / 100) - ((1000 * (business?.commissionRateReturning || 10)) / 100)).toFixed(2)}
              </Text>
            </View>
          </View>
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
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scrollView: {
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 8,
    padding: SPACING.md,
    margin: 16,
    gap: SPACING.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  ratesContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: 16,
  },
  rateCard: {
    flex: 1,
    borderRadius: 8,
    padding: SPACING.md,
    borderWidth: 1,
  },
  rateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  rateLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  rateValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    marginVertical: SPACING.xs,
  },
  rateDescription: {
    fontSize: FONT_SIZES.xs,
    lineHeight: 16,
  },
  exampleCard: {
    borderRadius: 8,
    padding: SPACING.md,
    marginHorizontal: 16,
    marginBottom: SPACING.sm,
    borderWidth: 1,
  },
  exampleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  exampleType: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  exampleAmount: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  divider: {
    height: 1,
    marginVertical: SPACING.sm,
    marginHorizontal: -SPACING.md, // Negative margin to extend to card edges
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  calcLabel: {
    fontSize: FONT_SIZES.sm,
    flex: 1,
  },
  calcValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  calcDeduction: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  calcTotal: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  calcTotalValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default CommissionsSetupScreen;






