import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Button } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import TextInput from '../../components/common/TextInput';
import PasswordInput from '../../components/common/PasswordInput';
import { loginUser, googleSignIn } from '../../api/auth';
import { setSentryUser } from '../../config/sentry';
import { useGoogleAuth } from '../../services/googleAuth';
import * as AuthSession from 'expo-auth-session';
import apiClient from '../../services/apiClient';
import { ensurePushTokenRegistered } from '../../services/notificationRetryService';
import socketService from '../../services/socketService';
import { updateTokenCache } from '../../services/apiClient';
import type { AuthStackScreenProps } from '../../types/navigation';

type LoginScreenProps = AuthStackScreenProps<'Login'>;

interface FormErrors {
  email?: string | null;
  password?: string | null;
}

interface GoogleAuthResponse {
  type: string;
  params?: {
    code?: string;
    error?: string;
    error_description?: string;
  };
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [authError, setAuthError] = useState<string>('');
  
  // Google Auth Setup (Expo)
  const { request, response, promptAsync, discovery } = useGoogleAuth();

  // Handle Google OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      handleGoogleAuthSuccess(response as GoogleAuthResponse);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Email validation
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
    }

    // Password validation
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle login
  const handleLogin = async (): Promise<void> => {
    // Validate form
    if (!validateForm()) {
      return;
    }

    setAuthError('');
    setIsLoading(true);
    
    try {
      // Call login API
      const response = await loginUser(email, password);
      
      // Store tokens
      await AsyncStorage.setItem('accessToken', response.accessToken);
      if (response.refreshToken) {
        await AsyncStorage.setItem('refreshToken', response.refreshToken);
        // Verify it was stored
        const storedRefreshToken = await AsyncStorage.getItem('refreshToken');
        if (!storedRefreshToken) {
          console.error('[Login] ⚠️ Failed to store refresh token!');
        } else {
          console.log('[Login] ✅ Refresh token verified in storage');
        }
      } else {
        console.error('[Login] ⚠️ No refresh token in login response!');
      }
      await AsyncStorage.setItem('user', JSON.stringify(response.user));
      
      // Log token info for debugging
      try {
        // Simple decode to check expiration (without verification)
        const tokenParts = response.accessToken.split('.');
        if (tokenParts.length === 3) {
          // Decode base64 in React Native (add padding if needed)
          let base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) {
            base64 += '=';
          }
          const payload = JSON.parse(atob(base64));
          if (payload.exp) {
            const expirationTime = new Date(payload.exp * 1000);
            const currentTime = new Date();
            const timeUntilExpiry = Math.round((payload.exp * 1000 - Date.now()) / 1000 / 60); // minutes
            console.log('[Login] ✅ Access token stored successfully:', {
              expiresAt: expirationTime.toISOString(),
              currentTime: currentTime.toISOString(),
              expiresInMinutes: timeUntilExpiry,
              userId: payload.userID,
            });
          }
        }
        
        // Also log refresh token info
        if (response.refreshToken) {
          const refreshTokenParts = response.refreshToken.split('.');
          if (refreshTokenParts.length === 3) {
            let base64 = refreshTokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) {
              base64 += '=';
            }
            const refreshPayload = JSON.parse(atob(base64));
            if (refreshPayload.exp) {
              const expirationTime = new Date(refreshPayload.exp * 1000);
              const timeUntilExpiry = Math.round((refreshPayload.exp * 1000 - Date.now()) / 1000 / 60 / 60 / 24); // days
              console.log('[Login] ✅ Refresh token stored successfully:', {
                expiresAt: expirationTime.toISOString(),
                expiresInDays: timeUntilExpiry,
                userId: refreshPayload.userID,
              });
            }
          }
        } else {
          console.warn('[Login] ⚠️ No refresh token in response!');
        }
      } catch (e) {
        console.warn('[Login] Could not decode token for logging:', e);
      }
      
      // Update token cache to avoid AsyncStorage I/O on subsequent requests
      updateTokenCache(response.accessToken);
      
      // Initialize real-time features after login
      try {
        // Register for push notifications (request permission if needed)
        await ensurePushTokenRegistered();
        
        // Connect to socket for real-time chat
        await socketService.connect();
      } catch (error) {
        // Don't block login if these fail
      }
      
      // Navigate based on account type
      const accountType = response.user.accountType?.toLowerCase();
      
      if (accountType === 'admin') {
        navigation.replace('AdminTabNavigator' as any);
      } else if (accountType === 'business') {
        // Check if business profile exists before navigating
        let hasBusinessProfile = false;
        
        try {
          // Use centralized API client instead of direct axios call
          const businessResponse = await apiClient.get(`/api/business/${response.user.id}`);
          
          if (businessResponse.data.business) {
            // Store business data for immediate access
            await AsyncStorage.setItem('business', JSON.stringify(businessResponse.data.business));
            hasBusinessProfile = true;
          }
        } catch (businessError: any) {
          // Check if it's 404 (no profile) or actual error
          if (businessError.response?.status === 404) {
            hasBusinessProfile = false;
          } else {
            // Assume no profile on error to be safe
            hasBusinessProfile = false;
          }
        }
        
        // Navigate to appropriate screen based on profile status
        if (hasBusinessProfile) {
          navigation.replace('BusinessTabNavigator' as any);
        } else {
          navigation.replace('BusinessSetup' as any);
        }
      } else if (accountType === 'marketer') {
        navigation.replace('MarketerTabNavigator' as any);
      } else {
        navigation.replace('Home' as any);
      }
      
    } catch (error: any) {
      const message = error?.message || 'Unable to sign in. Please try again.';
      setAuthError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google Auth Success
  const handleGoogleAuthSuccess = async (authResponse: GoogleAuthResponse): Promise<void> => {
    setIsLoading(true);
    
    try {
      // Get the authorization code from the response
      const code = authResponse.params?.code;
      
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
      console.log('[Google Sign-In] 📤 Sending authorization code to backend for PKCE exchange');
      
      // Send ID token (or code) to backend for authentication
      // Include redirectUri and code_verifier if we're sending a code (for backend exchange)
      const response = await googleSignIn(
        idToken, 
        null, 
        idToken.startsWith('4/') ? redirectUri : null, 
        codeVerifier // Pass the code_verifier from the request
      );
      // Store tokens
      await AsyncStorage.setItem('accessToken', response.accessToken);
      if (response.refreshToken) {
        await AsyncStorage.setItem('refreshToken', response.refreshToken);
        // Verify it was stored
        const storedRefreshToken = await AsyncStorage.getItem('refreshToken');
        if (!storedRefreshToken) {
          console.error('[Google Login] ⚠️ Failed to store refresh token!');
        } else {
          console.log('[Google Login] ✅ Refresh token verified in storage');
        }
      } else {
        console.error('[Google Login] ⚠️ No refresh token in login response!');
      }
      await AsyncStorage.setItem('user', JSON.stringify(response.user));
      
      // Update token cache to avoid AsyncStorage I/O on subsequent requests
      updateTokenCache(response.accessToken);
      
      // Set Sentry user context for error tracking
      setSentryUser(response.user);
      
      // Initialize real-time features after Google login
      try {
        // Register for push notifications (request permission if needed)
        await ensurePushTokenRegistered();
        
        // Connect to socket for real-time chat
        await socketService.connect();
      } catch (error) {
        // Don't block login if these fail
      }
      
      // Navigate based on account type
      const accountType = response.user.accountType?.toLowerCase();
      
      if (accountType === 'admin') {
        navigation.replace('AdminTabNavigator' as any);
      } else if (accountType === 'business') {
        // Fetch business profile separately (keeps user and business data separate)
        let hasBusinessProfile = false;
        
        try {
          // Use centralized API client instead of direct axios call
          const businessResponse = await apiClient.get(`/api/business/${response.user.id}`);
          
          if (businessResponse.data.business) {
            // Store business data SEPARATELY from user data
            await AsyncStorage.setItem('business', JSON.stringify(businessResponse.data.business));
            hasBusinessProfile = true;
          }
        } catch (businessError: any) {
          if (businessError.response?.status === 404) {
            hasBusinessProfile = false;
          } else {
            hasBusinessProfile = false;
          }
        }
        
        // Navigate based on profile status
        if (hasBusinessProfile) {
          navigation.replace('BusinessTabNavigator' as any);
        } else {
          navigation.replace('BusinessSetup' as any);
        }
      } else if (accountType === 'marketer') {
        navigation.replace('MarketerTabNavigator' as any);
      } else {
        navigation.replace('Home' as any);
      }
      
    } catch (error: any) {
      let errorMessage = 'Google sign-in failed. Please try again.';
      
      if (error.message) {
        errorMessage = error.message;
      }
      setAuthError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google Sign-In Button Press
  const handleGoogleSignIn = async (): Promise<void> => {
    try {
      if (!request) {
        return;
      }
      await promptAsync();
    } catch (error: any) {
      let errorMessage = 'Google sign-in failed. Please try again.';
      
      if (error.message === 'SIGN_IN_CANCELLED') {
        errorMessage = 'Sign-in was cancelled';
      } else if (error.message) {
        errorMessage = error.message;
      }
      setAuthError(errorMessage);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo and Header - Fixed at top */}
        <View style={styles.logoHeader}>
          <Image
            source={require('../../../assets/Sabito  green icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.appName}>Sabito</Text>
        </View>

        {/* Centered Content Section */}
        <View style={styles.centeredContent}>
          {/* Welcome Text */}
          <View style={styles.welcomeSection}>
            <Text style={[styles.title, { color: colors.text }]}>Welcome Back!</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Sign in to continue growing your network
            </Text>
          </View>

          {/* Login Form */}
          <View style={styles.formSection}>
          {/* Email Input */}
          <TextInput
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChangeText={(text: string) => {
              setEmail(text);
              if (errors.email) {
                setErrors({ ...errors, email: null });
              }
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            helperText={errors.email || undefined}
          />

          {/* Password Input */}
          <PasswordInput
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(text: string) => {
              setPassword(text);
              if (errors.password) {
                setErrors({ ...errors, password: null });
              }
              if (authError) {
                setAuthError('');
              }
            }}
            helperText={errors.password || undefined}
          />

          {/* Forgot Password Link */}
          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotPasswordButton}
          >
              <Text style={[styles.forgotPasswordText, { color: COLORS.APP_GREEN }]}>Forgot Password?</Text>
          </TouchableOpacity>

          {authError ? (
            <Text style={[styles.authErrorText, { color: COLORS.ERROR }]}>
              {authError}
            </Text>
          ) : null}

          {/* Login Button */}
          <Button
            mode="contained"
            onPress={handleLogin}
            loading={isLoading}
            disabled={isLoading}
            style={styles.loginButton}
            contentStyle={styles.loginButtonContent}
            labelStyle={styles.loginButtonLabel}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </Button>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textSecondary }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Google Sign-In Button */}
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            style={[styles.googleButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <Image
              source={require('../../../assets/google-auth.png')}
              style={styles.googleLogo}
              resizeMode="contain"
            />
            <Text style={[styles.googleButtonLabel, { color: colors.text }]}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Sign Up Link */}
          <View style={styles.signupSection}>
            <Text style={[styles.signupText, { color: colors.textSecondary }]}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('AccountType')}>
              <Text style={[styles.signupLink, { color: COLORS.APP_GREEN }]}>Sign Up</Text>
            </TouchableOpacity>
          </View>
          </View>
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
    justifyContent: 'space-between',
  },
  logoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.select({
      ios: SPACING.xxl,
      android: SPACING.sm,
      default: SPACING.md,
    }),
    marginBottom: SPACING.lg,
  },
  logo: {
    width: 32,
    height: 32,
    marginRight: SPACING.sm,
  },
  appName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
  },
  welcomeSection: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    lineHeight: 22,
  },
  formSection: {
    marginBottom: SPACING.xxl,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginBottom: SPACING.lg,
  },
  forgotPasswordText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  loginButton: {
    borderRadius: 8,
    marginBottom: SPACING.lg,
  },
  loginButtonContent: {
    paddingVertical: SPACING.sm,
  },
  loginButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SPACING.md,
  },
  dividerLine: {
    width: 50,
    height: 1,
    backgroundColor: COLORS.STROKE_COLOR,
  },
  dividerText: {
    marginHorizontal: SPACING.md,
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
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
    backgroundColor: COLORS.WHITE,
    marginBottom: SPACING.md,
  },
  googleLogo: {
    width: 24,
    height: 24,
  },
  googleButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
  },
  signupSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  authErrorText: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  signupText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
  signupLink: {
    fontSize: FONT_SIZES.md,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default LoginScreen;


