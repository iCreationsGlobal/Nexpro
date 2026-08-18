import React, { useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from 'react-native-paper';
import { ArrowLeft } from 'lucide-react-native';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import PasswordInput from '../../components/common/PasswordInput';
import PasswordRequirements from '../../components/common/PasswordRequirements';
import StepIndicator from '../../components/common/StepIndicator';
import AccountCreatedModal from '../../components/common/AccountCreatedModal';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import { createPassword } from '../../api/auth';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import type { AuthStackScreenProps } from '../../types/navigation';

type SignupPasswordScreenProps = AuthStackScreenProps<'SignupPassword'>;

const SignupPasswordScreen: React.FC<SignupPasswordScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  const { accountType, fullName, email } = route?.params || {};
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string>('');

  const handleBack = (): void => {
    navigation.goBack();
  };

  const getPasswordValidationError = (pwd: string = password, confirmPwd: string = confirmPassword): string => {
    if (!pwd || pwd.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must include at least one uppercase letter.';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must include at least one number.';
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
      return 'Password must include at least one special character.';
    }
    if (pwd !== confirmPwd) {
      return 'Passwords do not match.';
    }
    return '';
  };

  const isPasswordValid = (): boolean => getPasswordValidationError() === '';

  const handleLoginPress = (): void => {
    setShowSuccessModal(false);
    navigation.replace('Login');
  };

  const handleContinue = async (): Promise<void> => {
    const validationError = getPasswordValidationError();
    if (validationError) {
      setPasswordError(validationError);
      return;
    }
    setPasswordError('');

    setIsLoading(true);

    try {
      // For Business: Go to plan selection first
      if (accountType === 'business') {
        setIsLoading(false);
        navigation.navigate('SignupPlan', {
          accountType,
          fullName,
          email,
          password,
          confirmPassword,
        });
        return;
      }

      // For Marketer: Create account directly (no plan needed)
      const response = await createPassword({
        email,
        password,
        confirmPassword,
        accountType,
      });

      // Store tokens
      if (response.accessToken) {
        await AsyncStorage.setItem('accessToken', response.accessToken);
        await AsyncStorage.setItem('refreshToken', response.refreshToken);
        await AsyncStorage.setItem('user', JSON.stringify(response.user));
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
        showDialog({
          title: errorTitle,
          message: errorMessage,
          buttons: [
            { 
              text: 'Sign In', 
              style: 'default', 
              onPress: () => {
                hideDialog();
                navigation.replace('Login');
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
      setIsLoading(false);
    }
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
        <StepIndicator currentStep={3} totalSteps={4} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Centered Content Section */}
          <View style={styles.topSection}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>Protect your account</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Setup password for your account.</Text>
            </View>

            {/* Form Fields */}
            <View style={styles.formContainer}>
              {/* Password Input */}
              <PasswordInput
                label="Password"
                placeholder="Enter password"
                value={password}
                onChangeText={(value: string) => {
                  setPassword(value);
                  if (passwordError) {
                    setPasswordError(getPasswordValidationError(value, confirmPassword));
                  }
                }}
              />

              {/* Confirm Password Input */}
              <PasswordInput
                label="Confirm password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChangeText={(value: string) => {
                  setConfirmPassword(value);
                  if (passwordError) {
                    setPasswordError(getPasswordValidationError(password, value));
                  }
                }}
              />

              {/* Password Requirements */}
              <PasswordRequirements password={password} />
              {passwordError ? (
                <Text style={[styles.errorText, { color: COLORS.ERROR }]}>
                  {passwordError}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Bottom Section */}
          <View style={styles.bottomSection}>
            {/* Continue Button */}
            <Button
              mode="contained"
              onPress={handleContinue}
              loading={isLoading}
              disabled={!isPasswordValid() || isLoading}
              style={[styles.button, (!isPasswordValid() || isLoading) && styles.buttonDisabled]}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              {isLoading ? 'Creating Account...' : 'Continue'}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
  },
  keyboardView: {
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
    flexGrow: 1,
    paddingHorizontal: LAYOUT_PADDING,
    justifyContent: 'space-between',
  },
  topSection: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: SPACING.lg,
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
  formContainer: {
    marginBottom: SPACING.lg,
  },
  errorText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  bottomSection: {
    marginBottom: SPACING.xxl,
  },
  button: {
    borderRadius: 8,
  },
  buttonDisabled: {
    backgroundColor: COLORS.STROKE_COLOR,
  },
  buttonContent: {
    paddingVertical: SPACING.sm,
  },
  buttonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default SignupPasswordScreen;






