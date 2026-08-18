import React from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { useTheme, ThemeMode } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';

type Props = { navigation: any };

const OPTIONS: { value: ThemeMode; label: string; subtitle: string }[] = [
  { value: 'light', label: 'Light', subtitle: 'Always use light appearance' },
  { value: 'dark', label: 'Dark', subtitle: 'Always use dark appearance' },
  { value: 'system', label: 'System', subtitle: 'Match device settings' },
];

const ThemeSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, effectiveTheme, toggleTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Theme</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {OPTIONS.map((opt) => {
          const selected = theme === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.row,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: selected ? COLORS.APP_GREEN : colors.border,
                },
              ]}
              onPress={() => toggleTheme(opt.value)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>{opt.label}</Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>{opt.subtitle}</Text>
              </View>
              {selected ? <Check size={20} color={COLORS.APP_GREEN} strokeWidth={2.5} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.semibold },
  content: { padding: 16, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  label: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.semibold },
  sub: { fontSize: FONT_SIZES.sm, marginTop: 4 },
});

export default ThemeSettingsScreen;
