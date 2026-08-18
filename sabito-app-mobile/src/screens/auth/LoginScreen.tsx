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
import { loginUser } from '../../api/auth';
import type { AuthStackScreenProps } from '../../types/navigation';

type LoginScreenProps = AuthStackScreenProps<'Login'> & {
  onLoginSuccess?: () => void;
};

interface FormErrors {
  email?: string | null;
  password?: string | null;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation, onLoginSuccess }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [authError, setAuthError] = useState<string>('');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (): Promise<void> => {
    if (!validateForm()) return;

    setAuthError('');
    setIsLoading(true);

    try {
      const response = await loginUser(email, password);
      await AsyncStorage.setItem('user', JSON.stringify(response.user));

      if (typeof onLoginSuccess === 'function') {
        onLoginSuccess();
      } else {
        navigation.replace('MarketerTabs' as any);
      }
    } catch (error: any) {
      setAuthError(error?.message || 'Unable to sign in. Please try again.');
    } finally {
      setIsLoading(false);
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
        <View style={styles.logoHeader}>
          <Image
            source={require('../../../assets/Sabito  green icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.appName}>Sabito</Text>
        </View>

        <View style={styles.centeredContent}>
          <View style={styles.welcomeSection}>
            <Text style={[styles.title, { color: colors.text }]}>Welcome Back!</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Sign in to continue growing your network
            </Text>
          </View>

          <View style={styles.formSection}>
            <TextInput
              label="Email Address"
              placeholder="Enter your email"
              value={email}
              onChangeText={(text: string) => {
                setEmail(text);
                if (errors.email) setErrors({ ...errors, email: null });
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              helperText={errors.email || undefined}
            />

            <PasswordInput
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={(text: string) => {
                setPassword(text);
                if (errors.password) setErrors({ ...errors, password: null });
                if (authError) setAuthError('');
              }}
              helperText={errors.password || undefined}
            />

            {authError ? (
              <Text style={[styles.authErrorText, { color: COLORS.ERROR }]}>{authError}</Text>
            ) : null}

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

            <View style={styles.signupSection}>
              <Text style={[styles.signupText, { color: colors.textSecondary }]}>
                Don't have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignupProfile' as any)}>
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
  loginButton: {
    borderRadius: 8,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  loginButtonContent: {
    paddingVertical: SPACING.sm,
  },
  loginButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  signupSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  signupText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
  signupLink: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.APP_GREEN,
  },
  authErrorText: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.sm,
  },
});

export default LoginScreen;
