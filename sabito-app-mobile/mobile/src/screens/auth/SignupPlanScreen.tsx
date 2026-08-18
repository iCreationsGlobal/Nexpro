import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { Zap, TrendingUp, Award, Crown } from 'lucide-react-native';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import PlanCard from '../../components/common/PlanCard';
import StepIndicator from '../../components/common/StepIndicator';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import { getPricingPlans } from '../../api/auth';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import type { AuthStackScreenProps } from '../../types/navigation';
import type { PricingPlan } from '../../types/api';

type SignupPlanScreenProps = AuthStackScreenProps<'SignupPlan'>;

type PlanIconComponent = typeof Zap;

const SignupPlanScreen: React.FC<SignupPlanScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  const { accountType, fullName, email, password, confirmPassword, isUpgrade, currentPlan, googleSignup } = route?.params || {};
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedBilling, setSelectedBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch pricing plans from backend
  useEffect(() => {
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPlans = async (): Promise<void> => {
    try {
      setLoading(true);
      const plansData = await getPricingPlans();
      setPlans(plansData);
      
      // Auto-select the recommended plan (isPopular: true)
      const recommendedPlan = plansData.find(p => p.isPopular === true);
      if (recommendedPlan) {
        setSelectedPlan(recommendedPlan.slug);
      } else {
        // Fallback: select first paid plan or first plan
        const firstPaidPlan = plansData.find(p => p.type !== 'free');
        if (firstPaidPlan) {
          setSelectedPlan(firstPaidPlan.slug);
        } else if (plansData.length > 0) {
          setSelectedPlan(plansData[0].slug);
        }
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Failed to load pricing plans. Please try again.',
        buttons: [
          {
            text: 'Retry',
            onPress: () => {
              hideDialog();
              fetchPlans();
            },
            style: 'default',
          },
          {
            text: 'Go Back',
            onPress: () => {
              hideDialog();
              navigation.goBack();
            },
            style: 'cancel',
          },
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  const handleSelectPlan = async (planSlug: string): Promise<void> => {
    const plan = plans.find(p => p.slug === planSlug);
    if (!plan) return;

    setSelectedPlan(planSlug);

    // For ALL plans, go to confirmation screen first
    navigation.navigate('PlanConfirmation', {
      accountType: accountType!,
      fullName: fullName!,
      email: email!,
      password,
      confirmPassword,
      plan: plan,
      planSlug: plan.slug,
      planType: plan.type || 'free',
      billingCycle: selectedBilling,
      planPrice: plan.type === 'free' || plan.monthlyPrice === 0 
        ? 0 
        : (selectedBilling === 'yearly' ? (plan.yearlyPrice || plan.monthlyPrice * 12) : plan.monthlyPrice),
      isUpgrade: isUpgrade || false,
      currentPlan: currentPlan || null,
      googleSignup: googleSignup || false, // Pass through Google signup flag
    });
  };

  const getIconForPlan = (planType?: string): PlanIconComponent => {
    const iconMap: Record<string, PlanIconComponent> = {
      free: Zap,
      starter: TrendingUp,
      pro: Award,
      premium: Crown,
    };
    return iconMap[planType?.toLowerCase() || ''] || Zap;
  };

  const formatPrice = (plan: PricingPlan, billing: 'monthly' | 'yearly'): string => {
    if (plan.type === 'free' || !plan.monthlyPrice) return '₵ 0.00';
    
    if (billing === 'yearly') {
      const yearlyPrice = plan.yearlyPrice || (plan.monthlyPrice * 12 * (1 - (plan.yearlyDiscount || 0) / 100));
      return `₵ ${yearlyPrice.toFixed(2)}/year`;
    }
    
    return `₵ ${plan.monthlyPrice}/mo`;
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading plans...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Top Navigation Bar */}
      <View style={styles.topNav}>
        {/* Back Button */}
        <TouchableOpacity onPress={handleBack} style={[styles.backButton, { borderColor: colors.border }]}>
          <ArrowLeft size={ICON_SIZES.md} color={colors.text} strokeWidth={1.5} />
        </TouchableOpacity>

        {/* Step Indicators - Only show during signup */}
        {!isUpgrade && <StepIndicator currentStep={4} totalSteps={4} />}
        
        {/* Spacer for upgrade flow to maintain alignment */}
        {isUpgrade && <View style={{ width: 60 }} />}
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {isUpgrade ? 'Upgrade Your Plan' : 'Choose a plan'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {isUpgrade 
              ? `You're currently on the ${currentPlan} plan. Select a higher plan to unlock more features.` 
              : 'Select the plan that fits your needs.'}
          </Text>
        </View>

        {/* Plan Cards */}
        <View style={styles.plansContainer}>
          {plans.map((plan) => {
            const PlanIcon = getIconForPlan(plan.type);
            
            // Build features array from backend data
            const features: string[] = [
              // Key limits first
              plan.maxMarketerPartnerships === -1 || plan.maxMarketerPartnerships === null
                ? 'Unlimited marketer partnerships'
                : `Up to ${plan.maxMarketerPartnerships} marketer partnerships`,
              plan.maxReferralsPerMonth === -1 || plan.maxReferralsPerMonth === null
                ? 'Unlimited referrals per month'
                : `Up to ${plan.maxReferralsPerMonth} referrals per month`,
              `${plan.platformFeeNew || 0}% platform fee for new clients`,
              `${plan.platformFeeReturning || 0}% platform fee for returning clients`,
              
              // Add features from database (features.core array)
              ...(plan.features?.core?.map(f => typeof f === 'string' ? f : f.text) || []),
            ];

            // Use isPopular from backend for recommended badge and default expansion
            const isRecommended = plan.isPopular === true;

            return (
              <PlanCard
                key={plan.id}
                name={plan.name}
                price={formatPrice(plan, selectedBilling)}
                tagline={plan.description || 'Great for growing businesses'}
                Icon={PlanIcon}
                features={features}
                recommended={isRecommended}
                defaultExpanded={isRecommended}
                onSelectPlan={() => handleSelectPlan(plan.slug)}
                isSelected={selectedPlan === plan.slug}
              />
            );
          })}
        </View>
      </ScrollView>

      <CustomDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={hideDialog}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.md,
  },
  backButton: {
    padding: SPACING.sm,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: SPACING.xxl,
  },
  header: {
    marginBottom: SPACING.xl,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: Platform.select({
      ios: 28,
      android: 24,
      default: 24,
    }),
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontSize: Platform.select({
      ios: 18,
      android: 15,
      default: 16,
    }),
  },
  plansContainer: {
    // Plan cards container
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    marginTop: SPACING.md,
  },
});

export default SignupPlanScreen;






