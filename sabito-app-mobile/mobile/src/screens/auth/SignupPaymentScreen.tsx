import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from 'react-native-paper';
import { ArrowLeft, CheckCircle } from 'lucide-react-native';
import { Paystack } from 'react-native-paystack-webview';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import StepIndicator from '../../components/common/StepIndicator';
import AccountCreatedModal from '../../components/common/AccountCreatedModal';
import { createPassword } from '../../api/auth';
import { PAYSTACK_CONFIG } from '../../config/env';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import type { AuthStackScreenProps } from '../../types/navigation';
import type { PricingPlan } from '../../types/api';

type SignupPaymentScreenProps = AuthStackScreenProps<'SignupPayment'>;

interface PaystackResponse {
  transactionRef?: {
    reference: string;
  };
  reference?: string;
}

const SignupPaymentScreen: React.FC<SignupPaymentScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { 
    accountType, 
    fullName, 
    email, 
    password, 
    confirmPassword,
    plan,  // Full plan object from backend
    planSlug, 
    planType, 
    planPrice,
    billingCycle 
  } = route?.params || {};
  
  const paystackWebViewRef = useRef<any>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  // Use actual plan data from backend
  const selectedPlan = (plan as PricingPlan) || ({} as PricingPlan);
  const displayPrice = parseFloat(String(planPrice)) || 0;

  const handleBack = (): void => {
    navigation.goBack();
  };

  const handlePayment = (): void => {
    if (displayPrice === 0) {
      // Free plan - should not reach here (handled in confirmation screen)
      navigation.goBack();
    } else {
      // Trigger Paystack payment
      paystackWebViewRef.current?.startTransaction();
    }
  };

  const handlePaymentSuccess = async (response: PaystackResponse): Promise<void> => {
    setIsProcessing(true);
    
    try {
      // Create account with payment reference
      const accountResponse = await createPassword({
        email: email!,
        password: password!,
        confirmPassword: confirmPassword!,
        accountType: accountType! as 'business' | 'marketer',
        planSlug: planSlug!,
        planType: planType!,
        billingCycle: billingCycle!,
        paymentReference: response.transactionRef?.reference || response.reference,
        paymentStatus: 'completed',
      } as any);
      // Store tokens
      if (accountResponse.accessToken) {
        await AsyncStorage.setItem('accessToken', accountResponse.accessToken);
        await AsyncStorage.setItem('refreshToken', accountResponse.refreshToken);
        await AsyncStorage.setItem('user', JSON.stringify(accountResponse.user));
      }

      // Show success modal
      setShowSuccessModal(true);

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
        Alert.alert(
          errorTitle,
          errorMessage,
          [
            { 
              text: 'Sign In', 
              style: 'default', 
              onPress: () => navigation.replace('Login' as any)
            },
            { 
              text: 'OK', 
              style: 'cancel'
            }
          ]
        );
      } else {
        errorMessage = error?.response?.data?.message || error?.message || errorMessage;
        Alert.alert(errorTitle, errorMessage);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoginPress = (): void => {
    setShowSuccessModal(false);
    navigation.replace('Login' as any);
  };

  const handlePaymentCancel = (): void => {
    setIsProcessing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Top Navigation Bar */}
      <View style={styles.topNav}>
        {/* Back Button */}
        <TouchableOpacity onPress={handleBack} style={[styles.backButton, { borderColor: colors.border }]}>
          <ArrowLeft size={ICON_SIZES.md} color={colors.text} strokeWidth={1.5} />
        </TouchableOpacity>

        {/* Step Indicators */}
        <StepIndicator currentStep={4} totalSteps={4} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Confirm your plan</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Review your selected plan and make payment.</Text>
        </View>

        {/* Plan Summary Card */}
        <View style={[styles.summaryCard, { 
          backgroundColor: colors.cardBackground || colors.background,
          borderColor: COLORS.APP_GREEN 
        }]}>
          <View style={[styles.planHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.planName, { color: colors.text }]}>{selectedPlan.name || 'Selected Plan'}</Text>
              <Text style={styles.planPrice}>
                ₵ {displayPrice.toFixed(2)}
                {billingCycle === 'yearly' ? '/year' : '/mo'}
              </Text>
            </View>
            {selectedPlan.isPopular && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>Recommended</Text>
              </View>
            )}
          </View>

          {/* Features List */}
          <View style={styles.featuresSection}>
            <Text style={[styles.featuresTitle, { color: colors.text }]}>Features include:</Text>
            
            {/* Key limits */}
            <View style={styles.featureRow}>
              <View style={[styles.checkmarkCircle, { 
                borderColor: COLORS.APP_GREEN,
                backgroundColor: colors.cardBackground || colors.background 
              }]}>
                <CheckCircle size={12} color={COLORS.APP_GREEN} strokeWidth={3} />
              </View>
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                {selectedPlan.maxMarketerPartnerships === -1 || selectedPlan.maxMarketerPartnerships === null
                  ? 'Unlimited'
                  : selectedPlan.maxMarketerPartnerships} marketer partnerships/month
              </Text>
            </View>
            
            <View style={styles.featureRow}>
              <View style={[styles.checkmarkCircle, { 
                borderColor: COLORS.APP_GREEN,
                backgroundColor: colors.cardBackground || colors.background 
              }]}>
                <CheckCircle size={12} color={COLORS.APP_GREEN} strokeWidth={3} />
              </View>
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                {selectedPlan.maxReferralsPerMonth === -1 || selectedPlan.maxReferralsPerMonth === null
                  ? 'Unlimited'
                  : selectedPlan.maxReferralsPerMonth} referrals/month
              </Text>
            </View>
            
            <View style={styles.featureRow}>
              <View style={[styles.checkmarkCircle, { 
                borderColor: COLORS.APP_GREEN,
                backgroundColor: colors.cardBackground || colors.background 
              }]}>
                <CheckCircle size={12} color={COLORS.APP_GREEN} strokeWidth={3} />
              </View>
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                {selectedPlan.platformFeeNew || 0}% platform fee on new clients
              </Text>
            </View>
            
            <View style={styles.featureRow}>
              <View style={[styles.checkmarkCircle, { 
                borderColor: COLORS.APP_GREEN,
                backgroundColor: colors.cardBackground || colors.background 
              }]}>
                <CheckCircle size={12} color={COLORS.APP_GREEN} strokeWidth={3} />
              </View>
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                {selectedPlan.platformFeeReturning || 0}% platform fee on returning clients
              </Text>
            </View>
            
            {/* Additional features from database */}
            {selectedPlan.features?.core && selectedPlan.features.core.slice(0, 3).map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <View style={[styles.checkmarkCircle, { 
                  borderColor: COLORS.APP_GREEN,
                  backgroundColor: colors.cardBackground || colors.background 
                }]}>
                  <CheckCircle size={12} color={COLORS.APP_GREEN} strokeWidth={3} />
                </View>
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                  {typeof feature === 'string' ? feature : (feature as any).text || String(feature)}
                </Text>
              </View>
            ))}
          </View>

          {/* Account Summary */}
          <View style={[styles.accountSummary, { borderTopColor: colors.border }]}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>Account Details:</Text>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Name:</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{fullName}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Email:</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{email}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Account Type:</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{accountType}</Text>
            </View>
          </View>
        </View>

        {/* Payment Button */}
        <Button
          mode="contained"
          onPress={handlePayment}
          disabled={isProcessing}
          loading={isProcessing}
          style={styles.paymentButton}
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
        >
          {isProcessing ? 'Processing...' : `Make Payment - ₵ ${displayPrice.toFixed(2)}`}
        </Button>

        {/* Paystack WebView (hidden, triggered programmatically) */}
        {displayPrice > 0 && (
          <Paystack
            paystackKey={PAYSTACK_CONFIG.publicKey}
            billingEmail={email!}
            billingName={fullName!}
            amount={displayPrice * 100} // Convert to pesewas (smallest currency unit)
            currency="GHS" // Use currency code, not symbol
            channels={['card', 'mobile_money', 'bank']}
            refNumber={`sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`}
            onCancel={handlePaymentCancel}
            onSuccess={handlePaymentSuccess}
            ref={paystackWebViewRef}
          />
        )}
      </ScrollView>

      {/* Account Created Success Modal */}
      <AccountCreatedModal
        visible={showSuccessModal}
        accountType={accountType}
        onLoginPress={handleLoginPress}
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
  summaryCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  planName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  planPrice: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.APP_GREEN,
  },
  recommendedBadge: {
    backgroundColor: COLORS.APP_GREEN,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  recommendedText: {
    fontSize: Platform.select({
      android: 10,
      ios: FONT_SIZES.xs,
      default: FONT_SIZES.xs,
    }),
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  featuresSection: {
    marginBottom: SPACING.md,
  },
  featuresTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  checkmarkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
  },
  accountSummary: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  summaryTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.sm,
  },
  summaryValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  paymentButton: {
    borderRadius: 8,
    marginTop: SPACING.md,
  },
  buttonContent: {
    paddingVertical: SPACING.sm,
  },
  buttonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default SignupPaymentScreen;






