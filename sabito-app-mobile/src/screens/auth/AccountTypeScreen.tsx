import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { Button } from 'react-native-paper';
import { Megaphone, Building2 } from 'lucide-react-native';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import type { AuthStackScreenProps } from '../../types/navigation';

type AccountTypeScreenProps = AuthStackScreenProps<'AccountType'>;

const AccountTypeScreen: React.FC<AccountTypeScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [selectedType, setSelectedType] = useState<'marketer' | 'business' | null>(null);

  const handleContinue = (): void => {
    if (selectedType) {
      // Navigate to signup profile screen with selected account type
      navigation.navigate('SignupProfile');
    }
  };

  const handleSignIn = (): void => {
    navigation.navigate('Login');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo Header - Fixed at top */}
        <View style={styles.logoHeader}>
          <Image
            source={require('../../../assets/Sabito  green icon.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.logoText}>Sabito</Text>
        </View>

        {/* Centered Content Section */}
        <View style={styles.topSection}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.subtitle, { color: colors.text }]}>How do you want to use Sabito?</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Choose the option that best describes you.
            </Text>
          </View>

          {/* Account Type Cards */}
          <View style={styles.cardsContainer}>
            {/* Marketer Card */}
          <TouchableOpacity
            style={[
              styles.card,
              { 
                backgroundColor: colors.cardBackground || colors.background,
                borderColor: colors.border,
              },
              selectedType === 'marketer' && {
                borderColor: COLORS.APP_GREEN,
                backgroundColor: isDark ? 'rgba(31, 185, 0, 0.15)' : '#F9FFF7',
              },
            ]}
            onPress={() => setSelectedType('marketer')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              {/* Icon */}
              <View style={[
                styles.iconContainer,
                { borderColor: colors.border },
                selectedType === 'marketer' && {
                  backgroundColor: COLORS.APP_GREEN,
                  borderColor: COLORS.APP_GREEN,
                }
              ]}>
                <Megaphone 
                  size={ICON_SIZES.lg} 
                  color={selectedType === 'marketer' ? COLORS.WHITE : COLORS.APP_GREEN}
                  strokeWidth={1.5}
                />
              </View>

              {/* Card Text */}
              <View style={styles.cardTextContainer}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>I am a marketer</Text>
                <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                  I connect clients to businesses.
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Business Card */}
          <TouchableOpacity
            style={[
              styles.card,
              { 
                backgroundColor: colors.cardBackground || colors.background,
                borderColor: colors.border,
              },
              selectedType === 'business' && {
                borderColor: COLORS.APP_GREEN,
                backgroundColor: isDark ? 'rgba(31, 185, 0, 0.15)' : '#F9FFF7',
              },
            ]}
            onPress={() => setSelectedType('business')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              {/* Icon */}
              <View style={[
                styles.iconContainer,
                { borderColor: colors.border },
                selectedType === 'business' && {
                  backgroundColor: COLORS.APP_GREEN,
                  borderColor: COLORS.APP_GREEN,
                }
              ]}>
                <Building2 
                  size={ICON_SIZES.lg} 
                  color={selectedType === 'business' ? COLORS.WHITE : COLORS.APP_GREEN}
                  strokeWidth={1.5}
                />
              </View>

              {/* Card Text */}
              <View style={styles.cardTextContainer}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>I am a business</Text>
                <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                  I get more clients through marketers.
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Section - Button and Sign In Link */}
        <View style={styles.bottomSection}>
          {/* Continue Button */}
          <Button
            mode="contained"
            onPress={handleContinue}
            disabled={!selectedType}
            style={[styles.button, !selectedType && styles.buttonDisabled]}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          >
            Continue
          </Button>

          {/* Sign In Link */}
          <View style={styles.signInContainer}>
            <Text style={[styles.signInText, { color: colors.textSecondary }]}>Already have an account? </Text>
            <TouchableOpacity onPress={handleSignIn}>
              <Text style={styles.signInLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: LAYOUT_PADDING,  // 32px iOS / 20px Android
    justifyContent: 'space-between',  // Push bottom section down
  },
  topSection: {
    flex: 1,
    justifyContent: 'center',  // Center the content vertically
  },
  bottomSection: {
    marginBottom: SPACING.xxl,  // xxl margin from bottom as requested
  },
  logoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Platform.select({
      ios: SPACING.xxl,   // 48px on iPhone
      android: SPACING.sm,  // 8px on Android
      default: SPACING.md,
    }),
    marginBottom: SPACING.lg,  // Space below logo
  },
  headerLogo: {
    width: 32,
    height: 32,
    marginRight: SPACING.sm,
  },
  logoText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
  },
  header: {
    marginBottom: SPACING.lg,  // Space below header text
    alignItems: 'flex-start',  // Align to left
  },
  subtitle: {
    fontSize: Platform.select({
      ios: 28,      // 28px on iPhone
      android: 24,  // 24px on Android
      default: 24,
    }),
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.md,
    textAlign: 'left',  // Left align
  },
  description: {
    fontSize: Platform.select({
      ios: 18,      // 18px on iPhone
      android: 15,  // 16px on Android
      default: 16,
    }),
    textAlign: 'left',  // Left align
  },
  cardsContainer: {
    // Centered by parent flex layout
  },
  card: {
    borderWidth: 1,  // 1px stroke as requested
    borderRadius: 12,
    padding: 16,  // 16px padding as requested
    marginBottom: '3%',  // Responsive spacing between cards
    minHeight: 100,  // Equal height for all cards
    justifyContent: 'center',  // Center content vertically
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,  // Space between icon and text
  },
  iconContainer: {
    padding: 8,  // 8px padding around icon
    borderWidth: 0.5,  // 0.5px stroke
    borderRadius: 8,  // 8px border radius
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  cardSubtitle: {
    fontSize: FONT_SIZES.md,
    lineHeight: 22,
  },
  button: {
    marginBottom: SPACING.md,
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
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  signInText: {
    fontSize: FONT_SIZES.md,
  },
  signInLink: {
    fontSize: FONT_SIZES.md,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default AccountTypeScreen;


