import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Paystack } from 'react-native-paystack-webview';
import { Check, Sparkles, Globe, TrendingUp, Award, Zap, ArrowLeft } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES } from '../../constants/sizes';
import { PAYSTACK_CONFIG } from '../../config/env';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import BackButton from '../../components/common/BackButton';
import {
  getProfessionalPlanInfo,
  upgradeToProfessional,
  refreshUserProfile
} from '../../api/professionalPlan';
import type { RootStackScreenProps } from '../../types/navigation';
import type { User as UserType, PricingPlan } from '../../types/api';

type MarketerUpgradeScreenProps = RootStackScreenProps<'MarketerUpgrade'>;

interface PlanInfo {
  currentPlan: string;
  professionalPlan: PricingPlan;
  benefits: string[];
}

const MarketerUpgradeScreen: React.FC<MarketerUpgradeScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [user, setUser] = useState<UserType | null>(null);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  const paystackWebViewRef = useRef<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (): Promise<void> => {
    try {
      // Load user
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const parsedUser = JSON.parse(userData) as UserType;
        setUser(parsedUser);
      }

      // Load plan info
      const result = await getProfessionalPlanInfo();
      if (result.success && result.data) {
        setPlanInfo(result.data as PlanInfo);
      } else {
        showDialog({
          title: 'Error',
          message: result.error || 'Failed to load plan details',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Failed to load plan details',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayment = (): void => {
    if (!user?.email || !user?.name) {
      showDialog({
        title: 'Error',
        message: 'User information not found. Please log in again.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
      return;
    }

    setIsProcessing(true);
    
    // Trigger Paystack WebView
    if (paystackWebViewRef.current) {
      paystackWebViewRef.current.startTransaction();
    }
  };

  const handlePaystackSuccess = async (response: any): Promise<void> => {
    try {
      setIsProcessing(true);
      
      // Call backend to upgrade the user
      const result = await upgradeToProfessional({
        paystackReference: response.reference || response.transactionRef?.reference,
        billingCycle: selectedBillingCycle,
      });

      if (result.success) {
        // Refresh user profile
        await refreshUserProfile();
        
        // Reload updated user
        const userData = await AsyncStorage.getItem('user');
        if (userData) {
          setUser(JSON.parse(userData) as UserType);
        }

        // Show success message
        showDialog({
          title: '🎉 Welcome to Professional!',
          message: 'Your account has been upgraded successfully. Enjoy your new features!',
          buttons: [
            {
              text: 'Continue',
              style: 'default',
              onPress: () => {
                hideDialog();
                navigation.goBack();
              }
            }
          ]
        });
      } else {
        showDialog({
          title: 'Error',
          message: result.error || 'Failed to upgrade account',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error.message || 'Failed to upgrade account',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaystackClose = (): void => {
    setIsProcessing(false);
  };

  const calculatePrice = (): number => {
    if (!planInfo?.professionalPlan) return 0;
    return selectedBillingCycle === 'monthly' 
      ? (planInfo.professionalPlan.monthlyPrice || 0)
      : (planInfo.professionalPlan.yearlyPrice || planInfo.professionalPlan.monthlyPrice * 12);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading plan details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user || !planInfo) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Unable to load plan information</Text>
        </View>
      </SafeAreaView>
    );
  }

  const price = calculatePrice();

  return (
    <>
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Upgrade to Professional</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={[styles.scrollView, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Upgrade Banner */}
        <View style={[styles.banner, { backgroundColor: COLORS.APP_GREEN }]}>
          <Sparkles size={32} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.bannerTitle}>Unlock Your Full Potential</Text>
          <Text style={styles.bannerSubtitle}>Get access to premium features and grow faster</Text>
        </View>

        {/* Billing Cycle Toggle */}
        <View style={[styles.billingToggle, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.billingOption,
              selectedBillingCycle === 'monthly' && { backgroundColor: COLORS.APP_GREEN }
            ]}
            onPress={() => setSelectedBillingCycle('monthly')}
          >
            <Text style={[
              styles.billingOptionText,
              selectedBillingCycle === 'monthly' && styles.billingOptionTextActive
            ]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.billingOption,
              selectedBillingCycle === 'yearly' && { backgroundColor: COLORS.APP_GREEN }
            ]}
            onPress={() => setSelectedBillingCycle('yearly')}
          >
            <Text style={[
              styles.billingOptionText,
              selectedBillingCycle === 'yearly' && styles.billingOptionTextActive
            ]}>
              Yearly
            </Text>
          </TouchableOpacity>
        </View>

        {/* Price Display */}
        <View style={[styles.priceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.priceAmount, { color: colors.text }]}>₵{price.toFixed(2)}</Text>
          <Text style={[styles.pricePeriod, { color: colors.textSecondary }]}>
            per {selectedBillingCycle === 'monthly' ? 'month' : 'year'}
          </Text>
          {selectedBillingCycle === 'yearly' && (
            <Text style={[styles.priceSavings, { color: COLORS.APP_GREEN }]}>
              Save {planInfo.professionalPlan.yearlyDiscount || 0}%
            </Text>
          )}
        </View>

        {/* Features List */}
        <View style={[styles.featuresCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.featuresTitle, { color: colors.text }]}>Professional Features</Text>
          {planInfo.benefits && planInfo.benefits.map((benefit, index) => (
            <View key={index} style={styles.featureItem}>
              <Check size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
              <Text style={[styles.featureText, { color: colors.text }]}>{benefit}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Upgrade Button */}
      <View style={[styles.bottomSection, { backgroundColor: colors.cardBackground, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.upgradeButton, isProcessing && styles.upgradeButtonDisabled]}
          onPress={handlePayment}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={COLORS.WHITE} />
          ) : (
            <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Paystack WebView */}
      <Paystack
        ref={paystackWebViewRef}
        publicKey={PAYSTACK_CONFIG.publicKey}
        amount={price * 100} // Convert to kobo
        billingEmail={user.email}
        billingName={user.name}
        currency="GHS"
        channels={['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer']}
        onCancel={handlePaystackClose}
        onSuccess={handlePaystackSuccess}
        onClose={handlePaystackClose}
      />
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
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  banner: {
    padding: SPACING.xl,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  bannerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  bannerSubtitle: {
    fontSize: FONT_SIZES.md,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  billingToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: SPACING.lg,
    borderWidth: 1,
  },
  billingOption: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  billingOptionText: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'medium',
    color: COLORS.GRAY,
  },
  billingOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  priceCard: {
    padding: SPACING.xl,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
  },
  priceAmount: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  pricePeriod: {
    fontSize: FONT_SIZES.md,
    marginTop: SPACING.xs,
  },
  priceSavings: {
    fontSize: FONT_SIZES.sm,
    fontWeight: 'semibold',
    marginTop: SPACING.xs,
  },
  featuresCard: {
    padding: SPACING.lg,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  featuresTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  featureText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
  },
  bottomSection: {
    padding: SPACING.md,
    borderTopWidth: 1,
  },
  upgradeButton: {
    backgroundColor: COLORS.APP_GREEN,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  upgradeButtonDisabled: {
    opacity: 0.5,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
  },
});

export default MarketerUpgradeScreen;






