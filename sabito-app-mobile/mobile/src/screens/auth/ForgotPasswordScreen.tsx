import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { Button } from 'react-native-paper';
import { CheckCircle } from 'lucide-react-native';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import TextInput from '../../components/common/TextInput';
import { requestPasswordReset } from '../../api/auth';
import BackButton from '../../components/common/BackButton';
import type { AuthStackScreenProps } from '../../types/navigation';

type ForgotPasswordScreenProps = AuthStackScreenProps<'ForgotPassword'>;

const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({ navigation }) => {
  const [email, setEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Validate email
  const validateEmail = (): boolean => {
    if (!email) {
      setError('Email is required');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Email is invalid');
      return false;
    }
    return true;
  };

  // Handle password reset request
  const handleResetPassword = async (): Promise<void> => {
    if (!validateEmail()) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await requestPasswordReset(email);
      setIsSuccess(true);
    } catch (error: any) {
      setError(error?.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Success view
  if (isSuccess) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.WHITE} />
        <View style={styles.successContainer}>
          <CheckCircle size={80} color={COLORS.APP_GREEN} strokeWidth={1.5} />
          
          <Text style={styles.successTitle}>Check Your Email</Text>
          <Text style={styles.successMessage}>
            We've sent password reset instructions to
          </Text>
          <Text style={styles.emailText}>{email}</Text>
          
          <Text style={styles.successHint}>
            Didn't receive the email? Check your spam folder or try again.
          </Text>

          <Button
            mode="contained"
            onPress={() => navigation.navigate('Login')}
            style={styles.backButton}
            contentStyle={styles.backButtonContent}
            labelStyle={styles.backButtonLabel}
          >
            Back to Sign In
          </Button>

          <TouchableOpacity
            onPress={() => setIsSuccess(false)}
            style={styles.resendButton}
          >
            <Text style={styles.resendText}>Resend Email</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Reset form view
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.WHITE} />
      
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button */}
        <View style={styles.backButtonContainer}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>
            Don't worry! Enter your email address and we'll send you instructions to reset your password.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (error) {
                setError('');
              }
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            helperText={error}
          />

          {/* Submit Button */}
          <Button
            mode="contained"
            onPress={handleResetPassword}
            loading={isLoading}
            disabled={isLoading}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
            labelStyle={styles.submitButtonLabel}
          >
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </Button>
        </View>
      </ScrollView>
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
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.select({
      ios: SPACING.xxl,
      android: SPACING.md,
      default: SPACING.lg,
    }),
  },
  backButtonContainer: {
    marginBottom: SPACING.lg,
  },
  header: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES['2xl'],
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    lineHeight: 24,
  },
  form: {
    flex: 1,
  },
  submitButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 12,
    marginTop: SPACING.lg,
  },
  submitButtonContent: {
    paddingVertical: SPACING.md,
  },
  submitButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  successTitle: {
    fontSize: FONT_SIZES['2xl'],
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  successMessage: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  emailText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.APP_GREEN,
    marginBottom: SPACING.xl,
  },
  successHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  backButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  backButtonContent: {
    paddingVertical: SPACING.md,
  },
  backButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  resendButton: {
    paddingVertical: SPACING.md,
  },
  resendText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default ForgotPasswordScreen;






