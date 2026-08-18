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

type SignupPasswordScreenProps = AuthStackScreenProps<'SignupPassword'> & {
  /** Injected by RootNavigator so success can enter marketer tabs. */
  onLoginSuccess?: () => void;
};

/** Marketer-only ABS signup step 2: set password and register via registerMarketer. */
const SignupPasswordScreen: React.FC<SignupPasswordScreenProps> = ({
  navigation,
  route,
  onLoginSuccess,
}) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();

  const params = route?.params ?? {};
  const fullName = typeof params.fullName === 'string' ? params.fullName : undefined;
  const email = typeof params.email === 'string' ? params.email : undefined;
  const phone = typeof params.phone === 'string' ? params.phone : undefined;

  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string>('');

  const handleBack = (): void => {
    navigation.goBack();
  };

  const getPasswordValidationError = (
    pwd: string = password,
    confirmPwd: string = confirmPassword
  ): string => {
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
    // registerMarketer already stored sabito_marketer_token — enter app when possible
    if (typeof onLoginSuccess === 'function') {
      onLoginSuccess();
    } else {
      navigation.replace('Login');
    }
  };

  const handleContinue = async (): Promise<void> => {
    const validationError = getPasswordValidationError();
    if (validationError) {
      setPasswordError(validationError);
      return;
    }
    setPasswordError('');

    if (!fullName || !email) {
      showDialog({
        title: 'Missing details',
        message: 'Please go back and enter your name and email.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }],
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await createPassword({
        name: fullName,
        email,
        phone,
        password,
      });

      if (response.user) {
        await AsyncStorage.setItem('user', JSON.stringify(response.user));
      }

      setShowSuccessModal(true);
    } catch (error: any) {
      let errorMessage = 'Unable to create your account. Please try again.';
      let errorTitle = 'Signup Error';

      if (
        error?.response?.data?.code === 'USER_EXISTS' ||
        error?.response?.data?.message?.toLowerCase().includes('already exists') ||
        error?.response?.data?.message?.toLowerCase().includes('account exists') ||
        error?.message?.toLowerCase().includes('already exists')
      ) {
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
              },
            },
            {
              text: 'OK',
              style: 'cancel',
              onPress: hideDialog,
            },
          ],
        });
      } else {
        errorMessage = error?.response?.data?.message || error?.message || errorMessage;
        showDialog({
          title: errorTitle,
          message: errorMessage,
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }],
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.topNav}>
        <TouchableOpacity onPress={handleBack} style={[styles.backButton, { borderColor: colors.border }]}>
          <ArrowLeft size={ICON_SIZES.md} color={colors.text} strokeWidth={1.5} />
        </TouchableOpacity>
        <StepIndicator currentStep={2} totalSteps={2} />
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
          <View style={styles.topSection}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>Protect your account</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Setup password for your account.
              </Text>
            </View>

            <View style={styles.formContainer}>
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

              <PasswordRequirements password={password} />
              {passwordError ? (
                <Text style={[styles.errorText, { color: COLORS.ERROR }]}>{passwordError}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.bottomSection}>
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

      <AccountCreatedModal visible={showSuccessModal} onLoginPress={handleLoginPress} />

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
