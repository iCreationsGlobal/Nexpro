import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from 'react-native-paper';
import { ArrowLeft, CheckCircle, Zap, TrendingUp, Award, Crown } from 'lucide-react-native';
import { Paystack } from 'react-native-paystack-webview';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import StepIndicator from '../../components/common/StepIndicator';
import AccountCreatedModal from '../../components/common/AccountCreatedModal';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import { createPassword, completeGoogleSignup } from '../../api/auth';
import apiClient from '../../services/apiClient';
import { PAYSTACK_CONFIG } from '../../config/env';
import type { AuthStackScreenProps } from '../../types/navigation';
import type { PricingPlan } from '../../types/api';

type PlanConfirmationScreenProps = AuthStackScreenProps<'PlanConfirmation'>;

interface GoogleSignupData {
  email: string;
  name: string;
  picture?: string;
  googleSub: string;
  accountType: string;
  isVerified: boolean;
}

interface PaystackResponse {
  transactionRef?: {
    reference: string;
  };
  reference?: string;
}

type PlanIconComponent = typeof Zap;

const PlanConfirmationScreen: React.FC<PlanConfirmationScreenProps> = ({ navigation, route }) => {
  const { dialog, showDialog, hideDialog } = useDialog();
  const {
    accountType,
    fullName,
    email,
    password,
    confirmPassword,
    plan,
    planSlug,
    planType,
    billingCycle,
    planPrice,
    isUpgrade,
    currentPlan,
    googleSignup, // Flag to indicate this is a Google signup
  } = route?.params || {};

  const [isCreatingAccount, setIsCreatingAccount] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [isPaystackOpen, setIsPaystackOpen] = useState<boolean>(false);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>((billingCycle as 'monthly' | 'yearly') || 'monthly');
  const [googleSignupData, setGoogleSignupData] = useState<GoogleSignupData | null>(null);
  const paystackWebViewRef = useRef<any>(null);

  // Load pending Google signup data if this is a Google signup
  useEffect(() => {
    const loadGoogleSignupData = async (): Promise<void> => {
      if (googleSignup) {
        try {
          const data = await AsyncStorage.getItem('pendingGoogleSignup');
          if (data) {
            const parsedData = JSON.parse(data);
            setGoogleSignupData(parsedData);
          }
        } catch (error) {
          // Handle error silently
        }
      }
    };
    loadGoogleSignupData();
  }, [googleSignup]);

  const selectedPlan = (plan as PricingPlan) || ({} as PricingPlan);
  const isFree = planType === 'free' || planPrice === 0;
  
  // Calculate prices based on billing cycle
  const monthlyPrice = parseFloat(String(selectedPlan.monthlyPrice)) || 0;
  const yearlyDiscount = parseFloat(String(selectedPlan.yearlyDiscount)) || 20;
  const yearlyPrice = selectedPlan.yearlyPrice 
    ? parseFloat(String(selectedPlan.yearlyPrice)) 
    : monthlyPrice * 12 * (1 - yearlyDiscount / 100);
  
  const displayPrice = selectedBillingCycle === 'yearly' ? yearlyPrice : monthlyPrice;
  const savingsAmount = (monthlyPrice * 12) - yearlyPrice;
  const savingsPercentage = yearlyDiscount;

  // Monitor when Paystack ref is ready
  useEffect(() => {
    if (!isFree && paystackWebViewRef.current) {
      // Paystack ref is ready
    } else if (!isFree) {
      // Paystack ref not ready yet
    }
  }, [isFree]);

  const handleBack = (): void => {
    navigation.goBack();
  };

  const handleViewAllPlans = (): void => {
    navigation.goBack(); // Go back to plan selection
  };

  const handleLoginPress = (): void => {
    setShowSuccessModal(false);
    navigation.replace('Login' as any);
  };

  const handleUpgrade = async (): Promise<void> => {
    setIsCreatingAccount(true);
    
    try {
      // Use centralized API client instead of direct axios call
      await apiClient.put('/api/subscriptions/business/plan', {
        subscriptionPlan: planSlug,
        billingCycle: selectedBillingCycle,
      });
      // Show success alert
      showDialog({
        title: 'Success!',
        message: `Your plan has been upgraded to ${selectedPlan.name}. Enjoy your new features!`,
        buttons: [
          {
            text: 'OK',
            onPress: () => {
              hideDialog();
              // Navigate back to subscription screen
              navigation.navigate('BusinessTabNavigator' as any, { screen: 'Account' });
            },
            style: 'default',
          },
        ]
      });
    } catch (error) {
      // Handle error
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleContinue = async (): Promise<void> => {
    // Check if it's an upgrade flow
    if (isUpgrade) {
      await handleUpgrade();
      return;
    }

    // Regular signup flow
    if (isFree) {
      // Free plan - create account immediately
      await handleFreePlanSignup();
    } else {
      // Paid plan - trigger Paystack payment
      if (paystackWebViewRef.current) {
        setIsPaystackOpen(true); // Hide loading, show Paystack modal
        paystackWebViewRef.current.startTransaction();
      }
    }
  };

  const handleFreePlanSignup = async (): Promise<void> => {
    setIsCreatingAccount(true);

    try {
      let response;
      
      // Check if this is a Google signup
      if (googleSignup && googleSignupData) {
        // Complete Google signup with plan (no payment needed for free plan)
        response = await completeGoogleSignup({
          email: googleSignupData.email,
          name: googleSignupData.name,
          picture: googleSignupData.picture,
          googleSub: googleSignupData.googleSub,
          accountType: accountType! as 'business' | 'marketer',
          planSlug: planSlug!,
          planType: 'free',
          billingCycle: selectedBillingCycle,
        });
        
        // Clear pending Google signup data
        await AsyncStorage.removeItem('pendingGoogleSignup');
        
      } else {
        // Regular email signup - create account with password and free plan
        response = await createPassword({
          email: email!,
          password: password!,
          confirmPassword: confirmPassword!,
          accountType: accountType! as 'business' | 'marketer',
          planSlug: planSlug!,
          planType: 'free',
          billingCycle: selectedBillingCycle,
        } as any);
      }

      // Store tokens
      if (response.accessToken) {
        await AsyncStorage.setItem('accessToken', response.accessToken);
        await AsyncStorage.setItem('refreshToken', response.refreshToken);
        await AsyncStorage.setItem('user', JSON.stringify(response.user));
      }

      // For Google signup: Auto-login (no modal needed)
      // For Email signup: Show success modal
      if (googleSignup) {
        // New business users always go to setup (no profile yet)
        navigation.replace('BusinessSetup' as any);
      } else {
        // Show success modal for email signups
        setShowSuccessModal(true);
      }

    } catch (error: any) {
      let errorMessage = 'Unable to create your account. Please try again.';
      let errorTitle = 'Signup Error';
      
      // Check if account already exists
      if (error?.response?.data?.code === 'USER_EXISTS' || 
          error?.response?.data?.message?.toLowerCase().includes('already exists') ||
          error?.response?.data?.message?.toLowerCase().includes('account exists') ||
          error?.message?.toLowerCase().includes('already exists')) {
        errorTitle = 'Account Already Exists';
        errorMessage = 'An account with this email already exists. Please sign in instead.';
        showDialog({
          title: errorTitle,
          message: errorMessage,
          buttons: [
            { 
              text: 'Sign In', 
              style: 'default', 
              onPress: () => {
                hideDialog();
                navigation.replace('Login' as any);
              }
            },
            { 
              text: 'OK', 
              style: 'cancel', 
              onPress: hideDialog 
            }
          ]
        });
      } else {
        errorMessage = error?.response?.data?.message || error?.message || errorMessage;
        showDialog({
          title: errorTitle,
          message: errorMessage,
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handlePaymentSuccess = async (response: PaystackResponse): Promise<void> => {
    setIsPaystackOpen(false); // Close Paystack modal state
    setIsCreatingAccount(true); // Show loading for account creation
    
    try {
      let accountResponse;
      
      // Check if this is a Google signup
      if (googleSignup && googleSignupData) {
        // Complete Google signup with plan and payment
        accountResponse = await completeGoogleSignup({
          email: googleSignupData.email,
          name: googleSignupData.name,
          picture: googleSignupData.picture,
          googleSub: googleSignupData.googleSub,
          accountType: accountType! as 'business' | 'marketer',
          planSlug: planSlug!,
          planType: planType!,
          billingCycle: selectedBillingCycle,
          paymentReference: response.transactionRef?.reference || response.reference,
        });
        
        // Clear pending Google signup data
        await AsyncStorage.removeItem('pendingGoogleSignup');
        
      } else {
        // Regular email signup - create account with password and payment
        accountResponse = await createPassword({
          email: email!,
          password: password!,
          confirmPassword: confirmPassword!,
          accountType: accountType! as 'business' | 'marketer',
          planSlug: planSlug!,
          planType: planType!,
          billingCycle: selectedBillingCycle,
          paymentReference: response.transactionRef?.reference || response.reference,
          paymentStatus: 'completed',
        } as any);
      }
      // Store tokens
      if (accountResponse.accessToken) {
        await AsyncStorage.setItem('accessToken', accountResponse.accessToken);
        await AsyncStorage.setItem('refreshToken', accountResponse.refreshToken);
        await AsyncStorage.setItem('user', JSON.stringify(accountResponse.user));
      }

      // For Google signup: Auto-login (no modal needed)
      // For Email signup: Show success modal
      if (googleSignup) {
        // New business users always go to setup (no profile yet)
        navigation.replace('BusinessSetup' as any);
      } else {
        // Show success modal for email signups
        setShowSuccessModal(true);
      }

    } catch (error: any) {
      let errorMessage = 'Unable to create your account. Please try again.';
      let errorTitle = 'Signup Error';
      
      // Check if account already exists
      if (error?.response?.data?.code === 'USER_EXISTS' || 
          error?.response?.data?.message?.toLowerCase().includes('already exists') ||
          error?.response?.data?.message?.toLowerCase().includes('account exists') ||
          error?.message?.toLowerCase().includes('already exists')) {
        errorTitle = 'Account Already Exists';
        errorMessage = 'An account with this email already exists. Please sign in instead.';
        showDialog({
          title: errorTitle,
          message: errorMessage,
          buttons: [
            { 
              text: 'Sign In', 
              style: 'default', 
              onPress: () => {
                hideDialog();
                navigation.replace('Login' as any);
              }
            },
            { 
              text: 'OK', 
              style: 'cancel', 
              onPress: hideDialog 
            }
          ]
        });
      } else {
        errorMessage = error?.response?.data?.message || error?.message || errorMessage;
        showDialog({
          title: errorTitle,
          message: errorMessage,
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handlePaymentCancel = (): void => {
    setIsPaystackOpen(false); // Close Paystack modal state
  };

  const getIconForPlan = (type?: string): PlanIconComponent => {
    const iconMap: Record<string, PlanIconComponent> = {
      free: Zap,
      starter: TrendingUp,
      pro: Award,
      premium: Crown,
      enterprise: Crown,
      vip: Crown,
    };
    return iconMap[type?.toLowerCase() || ''] || Zap;
  };

  const PlanIcon = getIconForPlan(selectedPlan.type || planType);

  const formatPrice = (): string => {
    if (isFree || displayPrice === 0) return 'Free';
    
    if (selectedBillingCycle === 'yearly') {
      return `₵ ${displayPrice.toFixed(2)}/year`;
    }
    return `₵ ${displayPrice.toFixed(2)}/mo`;
  };

  const getBillingText = (): string => {
    if (isFree) return '';
    
    if (selectedBillingCycle === 'yearly') {
      const monthlyEquivalent = (displayPrice / 12).toFixed(2);
      return `Billed yearly (₵ ${monthlyEquivalent}/month)`;
    }
    return 'Billed monthly';
  };

  // Extract features from plan
  const features = selectedPlan.features?.core || [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.WHITE} />
      
      {/* Top Navigation Bar */}
      <View style={styles.topNav}>
        {/* Back Button */}
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={ICON_SIZES.md} color={COLORS.BLACK} strokeWidth={1.5} />
        </TouchableOpacity>

        {/* Step Indicators - Only show during signup */}
        {!isUpgrade && <StepIndicator currentStep={4} totalSteps={4} />}
        
        {/* Spacer for upgrade flow */}
        {isUpgrade && <View style={{ width: 60 }} />}
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Centered Content Section */}
        <View style={styles.topSection}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {isUpgrade ? 'Confirm Plan Upgrade' : 'Confirm your plan'}
            </Text>
            <Text style={styles.subtitle}>
              {isUpgrade 
                ? `Upgrade from ${currentPlan} plan to ${selectedPlan.name} plan.` 
                : 'Review your selected plan before proceeding.'}
            </Text>
          </View>

          {/* Plan Summary Card */}
          <View style={styles.planCard}>
            {/* Plan Header */}
            <View style={styles.planHeader}>
              <View style={styles.iconContainer}>
                <PlanIcon 
                  size={24} 
                  color={COLORS.APP_GREEN} 
                  strokeWidth={1.5}
                />
              </View>
              
              <View style={styles.planTitleContainer}>
                <Text style={styles.planName}>{selectedPlan.name || 'Selected Plan'}</Text>
                {selectedPlan.isPopular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>Recommended</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Billing Cycle Toggle */}
            {!isFree && selectedPlan.showYearlyToggle && (
              <View style={styles.billingToggleContainer}>
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    selectedBillingCycle === 'monthly' && styles.toggleOptionActive
                  ]}
                  onPress={() => setSelectedBillingCycle('monthly')}
                >
                  <Text style={[
                    styles.toggleText,
                    selectedBillingCycle === 'monthly' && styles.toggleTextActive
                  ]}>
                    Monthly
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    selectedBillingCycle === 'yearly' && styles.toggleOptionActive
                  ]}
                  onPress={() => setSelectedBillingCycle('yearly')}
                >
                  <Text style={[
                    styles.toggleText,
                    selectedBillingCycle === 'yearly' && styles.toggleTextActive
                  ]}>
                    Yearly
                  </Text>
                  {savingsPercentage > 0 && (
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsBadgeText}>Save {savingsPercentage.toFixed(0)}%</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Price Section */}
            <View style={styles.priceSection}>
              <Text style={styles.priceLabel}>Total Amount</Text>
              <Text style={styles.priceAmount}>{formatPrice()}</Text>
              <Text style={styles.billingCycle}>{getBillingText()}</Text>
              {selectedBillingCycle === 'yearly' && savingsAmount > 0 && (
                <Text style={styles.savingsText}>
                  You save ₵ {savingsAmount.toFixed(2)} per year
                </Text>
              )}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Plan Details */}
            <View style={styles.detailsSection}>
              <Text style={styles.sectionTitle}>Plan includes:</Text>
              
              {/* Key Limits */}
              <View style={styles.limitRow}>
                <CheckCircle size={14} color={COLORS.APP_GREEN} strokeWidth={2.5} />
                <Text style={styles.limitText}>
                  {selectedPlan.maxMarketerPartnerships === -1 || selectedPlan.maxMarketerPartnerships === null
                    ? 'Unlimited'
                    : selectedPlan.maxMarketerPartnerships} marketer partnerships/month
                </Text>
              </View>

              <View style={styles.limitRow}>
                <CheckCircle size={14} color={COLORS.APP_GREEN} strokeWidth={2.5} />
                <Text style={styles.limitText}>
                  {selectedPlan.maxReferralsPerMonth === -1 || selectedPlan.maxReferralsPerMonth === null
                    ? 'Unlimited'
                    : selectedPlan.maxReferralsPerMonth} referrals/month
                </Text>
              </View>

              <View style={styles.limitRow}>
                <CheckCircle size={14} color={COLORS.APP_GREEN} strokeWidth={2.5} />
                <Text style={styles.limitText}>
                  {selectedPlan.platformFeeNew || 0}% platform fee on new clients
                </Text>
              </View>

              <View style={styles.limitRow}>
                <CheckCircle size={14} color={COLORS.APP_GREEN} strokeWidth={2.5} />
                <Text style={styles.limitText}>
                  {selectedPlan.platformFeeReturning || 0}% platform fee on returning clients
                </Text>
              </View>

              {/* Additional Features */}
              {features.length > 0 && (
                <>
                  <View style={styles.featuresDivider} />
                  {features.slice(0, 3).map((feature, index) => (
                    <View key={index} style={styles.featureRow}>
                      <CheckCircle size={12} color={COLORS.APP_GREEN} strokeWidth={2.5} />
                      <Text style={styles.featureText}>
                        {typeof feature === 'string' ? feature : (feature as any).text || String(feature)}
                      </Text>
                    </View>
                  ))}
                  {features.length > 3 && (
                    <Text style={styles.moreFeatures}>
                      +{features.length - 3} more features
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>
        </View>

        {/* Bottom Section */}
        <View style={styles.bottomSection}>
          {/* Continue Button */}
          <Button
            mode="contained"
            onPress={handleContinue}
            loading={isCreatingAccount && !isPaystackOpen}
            disabled={isCreatingAccount || isPaystackOpen}
            style={styles.primaryButton}
            contentStyle={styles.primaryButtonContent}
            labelStyle={styles.primaryButtonLabel}
          >
            {isCreatingAccount && !isPaystackOpen
              ? 'Processing...' 
              : (isFree ? 'Confirm' : 'Make Payment')}
          </Button>

          {/* View All Plans Button */}
          {!isCreatingAccount && !isPaystackOpen && (
            <Button
              mode="outlined"
              onPress={handleViewAllPlans}
              style={styles.secondaryButton}
              contentStyle={styles.secondaryButtonContent}
              labelStyle={styles.secondaryButtonLabel}
            >
              View All Plans
            </Button>
          )}
        </View>
      </ScrollView>

      {/* Paystack WebView (hidden, triggered programmatically for paid plans) */}
      {!isFree && displayPrice > 0 && email && fullName && (
        <Paystack
          paystackKey={PAYSTACK_CONFIG.publicKey}
          billingEmail={email}
          billingName={fullName}
          amount={displayPrice * 100} // Convert to pesewas (smallest unit)
          currency="GHS" // Use currency code, not symbol
          channels={['card', 'mobile_money', 'bank']}
          refNumber={`sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`}
          onCancel={handlePaymentCancel}
          onSuccess={handlePaymentSuccess}
          autoStart={false}
          ref={paystackWebViewRef}
        />
      )}

      {/* Processing Overlay - Shows when creating account after payment */}
      {isCreatingAccount && !isPaystackOpen && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <Text style={styles.processingText}>Creating your account...</Text>
            <Text style={styles.processingSubtext}>Please wait</Text>
          </View>
        </View>
      )}

      {/* Account Created Success Modal */}
      <AccountCreatedModal
        visible={showSuccessModal}
        accountType={accountType}
        onLoginPress={handleLoginPress}
      />

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
    backgroundColor: COLORS.WHITE,
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
    borderColor: COLORS.STROKE_COLOR,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: LAYOUT_PADDING,
    paddingTop: SPACING.md,
    justifyContent: 'space-between',
  },
  topSection: {
    flex: 1,
  },
  header: {
    marginBottom: SPACING.md,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: Platform.select({
      ios: 24,
      android: 22,
      default: 22,
    }),
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: Platform.select({
      ios: 15,
      android: 14,
      default: 14,
    }),
    color: COLORS.GRAY,
  },
  planCard: {
    backgroundColor: COLORS.WHITE,
    borderWidth: 1,
    borderColor: COLORS.APP_GREEN,
    borderRadius: 8,
    padding: SPACING.md,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  billingToggleContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.WHITE,
    borderRadius: 8,
    padding: 4,
    marginBottom: SPACING.md,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  toggleOptionActive: {
    backgroundColor: COLORS.WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.GRAY,
  },
  toggleTextActive: {
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.bold,
  },
  savingsBadge: {
    position: 'absolute',
    top: -8,
    right: 4,
    backgroundColor: COLORS.APP_GREEN,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  savingsBadgeText: {
    fontSize: 9,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  planTitleContainer: {
    flex: 1,
  },
  planName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs,
  },
  popularBadge: {
    backgroundColor: COLORS.APP_GREEN,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  popularText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  priceSection: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    backgroundColor: '#F9FFF7',
    borderRadius: 8,
    marginBottom: SPACING.md,
  },
  priceLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    marginBottom: 2,
  },
  priceAmount: {
    fontSize: 28,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
    marginBottom: 2,
  },
  billingCycle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
  },
  savingsText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.xs,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.STROKE_COLOR,
    marginVertical: SPACING.sm,
  },
  detailsSection: {
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: SPACING.sm,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    paddingVertical: 2,
  },
  limitText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.BLACK,
    marginLeft: SPACING.sm,
    flex: 1,
    fontWeight: FONT_WEIGHTS.medium,
  },
  featuresDivider: {
    height: 1,
    backgroundColor: COLORS.STROKE_COLOR,
    marginVertical: SPACING.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  featureText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.BLACK,
    marginLeft: SPACING.sm,
    flex: 1,
    lineHeight: 18,
  },
  moreFeatures: {
    fontSize: FONT_SIZES.md,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  bottomSection: {
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  primaryButton: {
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  primaryButtonContent: {
    paddingVertical: SPACING.xs,
  },
  primaryButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  secondaryButton: {
    borderRadius: 8,
    borderColor: COLORS.APP_GREEN,
    marginBottom: SPACING.xl,
  },
  secondaryButtonContent: {
    paddingVertical: SPACING.xs,
  },
  secondaryButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.APP_GREEN,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  processingCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 16,
    padding: SPACING.xxl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  processingText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs,
  },
  processingSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
});

export default PlanConfirmationScreen;






