import React, { useState } from 'react';
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
} from 'react-native';
import { Button } from 'react-native-paper';
import { ArrowLeft } from 'lucide-react-native';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import TextInput from '../../components/common/TextInput';
import StepIndicator from '../../components/common/StepIndicator';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import type { AuthStackScreenProps } from '../../types/navigation';

type SignupProfileScreenProps = AuthStackScreenProps<'SignupProfile'>;

interface FormErrors {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
}

const SignupProfileScreen: React.FC<SignupProfileScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [errors, setErrors] = useState<FormErrors>({});

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

    if (phone && phone.trim().replace(/\D/g, '').length < 10) {
      newErrors.phone = 'Enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = (): void => {
    if (!validateForm()) return;

    navigation.navigate('SignupPassword' as any, {
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || undefined,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={ICON_SIZES.md} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create account</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoRow}>
          <Image
            source={require('../../../assets/Sabito  green icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <StepIndicator currentStep={1} totalSteps={2} />

        <Text style={[styles.title, { color: colors.text }]}>Your details</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          We’ll use these to set up your marketer account
        </Text>

        <TextInput
          label="Full name"
          placeholder="Enter your full name"
          value={fullName}
          onChangeText={(text: string) => {
            setFullName(text);
            if (errors.fullName) setErrors({ ...errors, fullName: null });
          }}
          helperText={errors.fullName || undefined}
        />

        <TextInput
          label="Email"
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

        <TextInput
          label="Phone (optional)"
          placeholder="e.g. 0555155972"
          value={phone}
          onChangeText={(text: string) => {
            setPhone(text);
            if (errors.phone) setErrors({ ...errors, phone: null });
          }}
          keyboardType="phone-pad"
          helperText={errors.phone || undefined}
        />

        <Button
          mode="contained"
          onPress={handleContinue}
          style={styles.continueButton}
          contentStyle={styles.continueButtonContent}
          labelStyle={styles.continueButtonLabel}
        >
          Continue
        </Button>

        <View style={styles.loginSection}>
          <Text style={[styles.loginText, { color: colors.textSecondary }]}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login' as any)}>
            <Text style={[styles.loginLink, { color: COLORS.APP_GREEN }]}>Sign In</Text>
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LAYOUT_PADDING,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  scrollContent: {
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: SPACING.xxl,
  },
  logoRow: {
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },
  logo: {
    width: 48,
    height: 48,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  continueButton: {
    borderRadius: 8,
    marginTop: SPACING.lg,
  },
  continueButtonContent: {
    paddingVertical: SPACING.sm,
  },
  continueButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  loginSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  loginText: {
    fontSize: FONT_SIZES.md,
  },
  loginLink: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default SignupProfileScreen;
