import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Button } from 'react-native-paper';
import { ArrowLeft } from 'lucide-react-native';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import OTPInput from '../../components/common/OTPInput';
import StepIndicator from '../../components/common/StepIndicator';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import { verifyOtp, sendOtp } from '../../api/auth';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import type { AuthStackScreenProps } from '../../types/navigation';

type SignupOTPScreenProps = AuthStackScreenProps<'SignupOTP'>;

const SignupOTPScreen: React.FC<SignupOTPScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  const { fullName, email } = route.params || {};
  const [otp, setOtp] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(60); // 60 seconds cooldown
  const [otpError, setOtpError] = useState<string>('');

  // Log route params on mount
  useEffect(() => {
    if (!email) {
      console.warn('SignupOTPScreen - Missing required params:', { email });
    }
  }, [email]);

  // Start cooldown timer on mount
  useEffect(() => {
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleBack = (): void => {
    navigation.goBack();
  };

  const handleVerify = async (): Promise<void> => {
    if (otp.length !== 6) {
      setOtpError('Please enter the 6-digit verification code.');
      return;
    }

    if (!email) {
      showDialog({
        title: 'Missing Information',
        message: 'Please go back and try again.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
      return;
    }

    setIsLoading(true);
    setOtpError('');

    try {
      // Verify OTP with backend (legacy screen; ABS signup skips OTP)
      await verifyOtp({
        email,
        otp,
      } as any);

      // Navigate to password creation
      navigation.navigate('SignupPassword', {
        fullName,
        email,
      });

    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to verify OTP. Please try again.';
      setOtpError(errorMessage);
      console.error('OTP Verification Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async (): Promise<void> => {
    if (resendCooldown > 0) {
      return;
    }

    if (!email || !fullName) {
      showDialog({
        title: 'Missing Information',
        message: 'Please go back and try again.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
      return;
    }

    try {
      // Resend OTP (legacy screen; ABS signup skips OTP)
      const response = await sendOtp({
        name: fullName,
        email,
      } as any);

      // Show OTP in dev mode
      if (response.isDevelopmentMode && response.otp) {
        showDialog({
          title: 'Development Mode',
          message: `Your OTP is: ${response.otp}`,
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      } else {
        showDialog({
          title: 'Code Sent',
          message: 'A new verification code has been sent to your email.',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }

      // Restart cooldown
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Cleanup on unmount
      return () => clearInterval(interval);
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error?.message || 'Failed to resend code. Please try again.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Navigation Bar */}
        <View style={styles.topNav}>
          {/* Back Button */}
          <TouchableOpacity onPress={handleBack} style={[styles.backButton, { borderColor: colors.border }]}>
            <ArrowLeft size={ICON_SIZES.md} color={colors.text} strokeWidth={1.5} />
          </TouchableOpacity>

          {/* Step Indicators */}
          <StepIndicator currentStep={2} totalSteps={4} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Verify Your Email</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              We've sent a 6-digit verification code to
            </Text>
            <Text style={[styles.email, { color: COLORS.APP_GREEN }]}>{email}</Text>
          </View>

          {/* OTP Input */}
          <View style={styles.otpContainer}>
            <OTPInput
              onChangeOTP={setOtp}
            />
            {otpError ? (
              <Text style={styles.errorText}>{otpError}</Text>
            ) : null}
          </View>

          {/* Resend Code */}
          <View style={styles.resendContainer}>
            <Text style={[styles.resendText, { color: colors.textSecondary }]}>
              Didn't receive the code?{' '}
            </Text>
            <TouchableOpacity
              onPress={handleResend}
              disabled={resendCooldown > 0}
              style={styles.resendButton}
            >
              <Text style={[
                styles.resendButtonText,
                { color: resendCooldown > 0 ? colors.textSecondary : COLORS.APP_GREEN }
              ]}>
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Button */}
        <View style={styles.bottomSection}>
          <Button
            mode="contained"
            onPress={handleVerify}
            loading={isLoading}
            disabled={isLoading || otp.length !== 6}
            style={[styles.continueButton, (isLoading || otp.length !== 6) && { opacity: 0.5 }]}
            contentStyle={styles.continueButtonContent}
            labelStyle={styles.continueButtonLabel}
          >
            {isLoading ? 'Verifying...' : 'Continue'}
          </Button>
        </View>
      </ScrollView>

      {/* Dialog */}
      <CustomDialog {...dialog} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: LAYOUT_PADDING,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.select({
      ios: SPACING.xxl,
      android: SPACING.md,
      default: SPACING.lg,
    }),
    marginBottom: SPACING.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: SPACING.xxl,
    alignItems: 'center',
  },
  title: {
    fontSize: FONT_SIZES['2xl'],
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  email: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'center',
  },
  otpContainer: {
    marginBottom: SPACING.xl,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.ERROR,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  resendText: {
    fontSize: FONT_SIZES.md,
  },
  resendButton: {
    padding: SPACING.xs,
  },
  resendButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  bottomSection: {
    paddingBottom: Platform.select({
      ios: SPACING.xl,
      android: SPACING.lg,
      default: SPACING.md,
    }),
  },
  continueButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 12,
  },
  continueButtonContent: {
    paddingVertical: SPACING.md,
  },
  continueButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
});

export default SignupOTPScreen;






