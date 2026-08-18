import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sun, Moon, Smartphone, CheckCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import type { RootStackScreenProps } from '../../types/navigation';

type ThemeSettingsScreenProps = RootStackScreenProps<'ThemeSettings'>;

interface ThemeOption {
  id: 'light' | 'dark' | 'system';
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
  description: string;
}

const ThemeSettingsScreen: React.FC<ThemeSettingsScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme, toggleTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const systemTheme = useColorScheme();
  const themeOptions: ThemeOption[] = [
    {
      id: 'light',
      icon: Sun,
      title: 'Light Mode',
      description: 'Always use light theme',
    },
    {
      id: 'dark',
      icon: Moon,
      title: 'Dark Mode',
      description: 'Always use dark theme',
    },
    {
      id: 'system',
      icon: Smartphone,
      title: 'System',
      description: 'Match device settings (default)',
    },
  ];

  const handleThemeSelect = (themeId: 'light' | 'dark' | 'system'): void => {
    alert(`THEME CHANGE: Switching to "${themeId}"\nDevice Theme: ${systemTheme}\nWill be dark: ${themeId === 'system' ? (systemTheme === 'dark') : (themeId === 'dark')}`);
    toggleTheme(themeId);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar 
        barStyle={isDark ? 'light-content' : 'dark-content'} 
        backgroundColor={colors.background} 
      />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} isDark={isDark} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Theme</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={[styles.scrollView, { backgroundColor: colors.background }]} 
        showsVerticalScrollIndicator={false}
      >
        {/* Info Box */}
        <View style={[styles.infoBox, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Choose your preferred theme. System mode automatically matches your device settings.
          </Text>
          <Text style={[styles.debugText, { color: colors.textTertiary, marginTop: 8 }]}>
            Device Theme: {systemTheme || 'Unknown'} | App Theme: {theme} | Dark Mode: {isDark ? 'Yes' : 'No'}
          </Text>
        </View>

        {/* Theme Options */}
        <View style={styles.optionsContainer}>
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = theme === option.id;

            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => handleThemeSelect(option.id)}
                activeOpacity={0.7}
              >
                <View style={styles.optionContent}>
                  <View style={[
                    styles.iconContainer,
                    { 
                      backgroundColor: isSelected 
                        ? colors.primary 
                        : colors.backgroundSecondary 
                    }
                  ]}>
                    <Icon 
                      size={24} 
                      color={isSelected ? '#FFFFFF' : colors.iconSecondary} 
                      strokeWidth={2} 
                    />
                  </View>
                  <View style={styles.textContainer}>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>
                      {option.title}
                    </Text>
                    <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                      {option.description}
                    </Text>
                  </View>
                </View>
                {isSelected && (
                  <View style={styles.checkIconContainer}>
                    <CheckCircle size={24} color={colors.primary} strokeWidth={2} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Preview Section */}
        <View style={styles.previewSection}>
          <Text style={[styles.previewTitle, { color: colors.text }]}>Preview</Text>
          <View style={[
            styles.previewCard,
            { 
              backgroundColor: colors.cardBackground,
              borderColor: colors.border,
            }
          ]}>
            <Text style={[styles.previewCardTitle, { color: colors.text }]}>
              Sample Card
            </Text>
            <View style={[styles.previewDivider, { backgroundColor: colors.divider }]} />
            <Text style={[styles.previewCardText, { color: colors.textSecondary }]}>
              This is how cards will look in your selected theme.
            </Text>
            <View style={[styles.previewButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.previewButtonText}>Action Button</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scrollView: {
    flex: 1,
  },
  infoBox: {
    borderRadius: 8,
    padding: SPACING.md,
    margin: 16,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
  },
  debugText: {
    fontSize: FONT_SIZES.xs,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  optionsContainer: {
    paddingHorizontal: 16,
    gap: SPACING.md,
  },
  optionCard: {
    borderRadius: 12,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.md,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: FONT_SIZES.sm,
    lineHeight: 18,
  },
  checkIconContainer: {
    marginLeft: SPACING.sm,
  },
  previewSection: {
    paddingHorizontal: 16,
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  previewTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
  },
  previewCard: {
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
  },
  previewCardTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  previewDivider: {
    height: 1,
    marginVertical: SPACING.sm,
  },
  previewCardText: {
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  previewButton: {
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  previewButtonText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default ThemeSettingsScreen;






