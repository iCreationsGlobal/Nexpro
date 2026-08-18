import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Platform,
  Image,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { Button } from 'react-native-paper';
import { ArrowLeft } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import TextInput from '../../components/common/TextInput';
import StepIndicator from '../../components/common/StepIndicator';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import { sendOtp, googleSignIn } from '../../api/auth';
import AccountCreatedModal from '../../components/common/AccountCreatedModal';
import { useGoogleAuth } from '../../services/googleAuth';
import * as AuthSession from 'expo-auth-session';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import type { AuthStackScreenProps } from '../../types/navigation';

type SignupProfileScreenProps = AuthStackScreenProps<'SignupProfile'>;

interface FormErrors {
  fullName?: string | null;
  email?: string | null;
}

interface GoogleUserInfo {
  email: string;
  name: string;
  picture?: string;
  googleSub: string;
}

interface GoogleSignupResponse {
  needsPlanSelection?: boolean;
  googleUserInfo?: GoogleUserInfo;
  accessToken?: string;
  refreshToken?: string;
  user?: any;
}

const SignupProfileScreen: React.FC<SignupProfileScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  const accountType = (route?.params?.accountType || 'marketer') as 'business' | 'marketer';
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  
  // Google Auth Setup (Expo)
  const { request, response, promptAsync, discovery } = useGoogleAuth();

  // Handle Google OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      handleGoogleAuthSuccess(response as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const handleBack = (): void => {
    navigation.goBack();
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!fullName || fullName.trim().length < 2) {
      newErrors.fullName = 'Full name is required (minimum 2 characters)';
    }

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async (): Promise<void> => {
    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Send OTP to user's email
      const response = await sendOtp({
        name: fullName.trim(),
        email: email.trim().toLowerCase(),
        accountType,
      });

      // Check if in development mode (backend returns OTP)
      if ((response as any).isDevelopmentMode && (response as any).otp) {
        // Development mode - OTP is returned in response
      }

      // Navigate to OTP verification
      navigation.navigate('SignupOTP', {
        accountType,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
      });

    } catch (error: any) {
      const message = error?.message || 'Failed to send verification code. Please try again.';
      showDialog({
        title: 'Couldn\'t Start Signup',
        message: message,
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google Auth Success
  const handleGoogleAuthSuccess = async (authResponse: any): Promise<void> => {
    setIsLoading(true);
    
    try {
      // Get the authorization code from the response
      const code = authResponse.params.code;
      
      if (!code) {
        throw new Error('No authorization code received from Google');
      }
      
      // For mobile apps with PKCE, exchange the code for ID token on the client side
      let idToken: string;
      let redirectUri: string | null = null;
      
      // Get redirect URI for fallback case
      if (request?.redirectUri) {
        redirectUri = request.redirectUri;
      } else {
        const clientId = request?.clientId || '';
        redirectUri = clientId ? `${clientId.split('.').reverse().join('.')}:/oauthredirect` : null;
      }
      
      // Extract code_verifier from request (required for PKCE)
      const codeVerifier = request?.codeVerifier || null;
      
      // Send code directly to backend for exchange (backend is configured for PKCE with iOS client ID)
      // This avoids issues with client-side exchange consuming the authorization code
      idToken = code;
      console.log('[Google Signup] 📤 Sending authorization code to backend for PKCE exchange');
      
      // Send ID token (or code) to backend for account creation
      // Include redirectUri and code_verifier if we're sending a code (for backend exchange)
      const response = await googleSignIn(idToken, accountType, idToken.startsWith('4/') ? redirectUri : null, codeVerifier) as GoogleSignupResponse;
      // Check if user needs to select a plan (business users)
      if ((response as any).needsPlanSelection && response.googleUserInfo) {
        // Business users - account NOT created yet, no tokens to store
        // Store Google signup data temporarily (for completing signup after plan selection)
        // Store the verified user info (not the code, since codes expire quickly)
        await AsyncStorage.setItem('pendingGoogleSignup', JSON.stringify({
          email: response.googleUserInfo.email,
          name: response.googleUserInfo.name,
          picture: response.googleUserInfo.picture,
          googleSub: response.googleUserInfo.googleSub,
          accountType: accountType,
          isVerified: true,
        }));
        // Navigate to plan selection (matching email signup flow)
        navigation.navigate('SignupPlan', { 
          email: response.googleUserInfo.email,
          fullName: response.googleUserInfo.name,
          accountType: accountType,
          googleSignup: true,
        });
      } else if (response.accessToken && response.user) {
        // For marketers, account is already created, store tokens
        await AsyncStorage.setItem('accessToken', response.accessToken);
        await AsyncStorage.setItem('refreshToken', response.refreshToken!);
        await AsyncStorage.setItem('user', JSON.stringify(response.user));
        // Auto-login - navigate directly to dashboard (no success modal needed)
        navigation.replace('MarketerTabNavigator' as any);
      }
      
    } catch (error: any) {
      let errorMessage = 'Google sign-up failed. Please try again.';
      
      if (error.response?.data?.code === 'USER_EXISTS') {
        errorMessage = 'An account with this email already exists. Please sign in instead.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      showDialog({
        title: 'Google Sign-Up',
        message: errorMessage,
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google Sign-In Button Press
  const handleGoogleSignIn = async (): Promise<void> => {
    try {
      await promptAsync();
    } catch (error: any) {
      let errorMessage = 'Google sign-up failed. Please try again.';
      
      if (error.message === 'SIGN_IN_CANCELLED') {
        errorMessage = 'Sign-up was cancelled';
      } else if (error.message) {
        errorMessage = error.message;
      }

      showDialog({
        title: 'Google Sign-Up',
        message: errorMessage,
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    }
  };

  const handleLoginPress = (): void => {
    setShowSuccessModal(false);
    // Navigate to appropriate dashboard based on account type
    if (accountType === 'marketer') {
      navigation.replace('MarketerTabNavigator' as any);
    } else if (accountType === 'business') {
      navigation.replace('BusinessTabNavigator' as any);
    } else {
      navigation.navigate('Login');
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
        <StepIndicator currentStep={1} totalSteps={4} />
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
            <Text style={[styles.title, { color: colors.text }]}>Create your Sabito account</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Let's setup your profile.</Text>
          </View>

          {/* Form Fields */}
          <View style={styles.formContainer}>
            {/* Full Name Input */}
            <TextInput
              label="What's your full name?"
              placeholder="Eg. Eric Amankyim"
              value={fullName}
              onChangeText={(text: string) => {
                setFullName(text);
                if (errors.fullName) {
                  setErrors({ ...errors, fullName: null });
                }
              }}
              autoCapitalize="words"
              helperText={errors.fullName || undefined}
            />

            {/* Email Input */}
            <TextInput
              label="What's your email address?"
              placeholder="eg. eamankyim@example.com"
              value={email}
              onChangeText={(text: string) => {
                setEmail(text);
                if (errors.email) {
                  setErrors({ ...errors, email: null });
                }
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              helperText={errors.email || "We'll send verification code to this email."}
            />
          </View>
        </View>

        {/* Bottom Section */}
        <View style={styles.bottomSection}>
          {/* Continue Button */}
          <Button
            mode="contained"
            onPress={handleContinue}
            loading={isLoading}
            disabled={!fullName || !email || isLoading}
            style={[styles.button, (!fullName || !email || isLoading) && styles.buttonDisabled]}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          >
            Continue with Email
          </Button>

          {/* OR Divider */}
          <View style={styles.dividerContainer}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textSecondary }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Google Sign-In Button */}
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            style={[
              styles.googleButton, 
              { backgroundColor: colors.cardBackground || colors.background },
              isLoading && styles.googleButtonDisabled
            ]}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginRight: 8 }} />
                <Text style={[styles.googleButtonLabel, { color: colors.text }]}>Authenticating...</Text>
              </>
            ) : (
              <>
                <Image
                  source={require('../../../assets/google-auth.png')}
                  style={styles.googleLogo}
                  resizeMode="contain"
                />
                <Text style={[styles.googleButtonLabel, { color: colors.text }]}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Modal */}
      <AccountCreatedModal
        visible={showSuccessModal}
        onClose={handleLoginPress}
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
  formContainer: {
    marginBottom: SPACING.lg,
  },
  bottomSection: {
    marginBottom: SPACING.xxl,
  },
  button: {
    borderRadius: 8,
    marginBottom: SPACING.md,
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
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SPACING.md,
  },
  dividerLine: {
    width: 50,
    height: 1,
  },
  dividerText: {
    marginHorizontal: SPACING.md,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  googleButtonDisabled: {
    opacity: 0.5,
  },
  googleLogo: {
    width: 24,
    height: 24,
  },
  googleButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default SignupProfileScreen;


