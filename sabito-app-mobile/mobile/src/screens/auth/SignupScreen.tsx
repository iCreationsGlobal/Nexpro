import React from 'react';
import { View, StyleSheet, Text, StatusBar } from 'react-native';
import { Button } from 'react-native-paper';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import type { AuthStackScreenProps } from '../../types/navigation';

type SignupScreenProps = AuthStackScreenProps<'Signup'>;

const SignupScreen: React.FC<SignupScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const accountType = route.params?.accountType || 'unknown';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <Text style={[styles.title, { color: colors.text }]}>Signup Screen</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Account Type: {accountType}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Coming Soon</Text>
      
      <Button
        mode="outlined"
        onPress={() => navigation.goBack()}
        style={styles.button}
      >
        Go Back
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    marginBottom: SPACING.sm,
  },
  button: {
    marginTop: SPACING.lg,
  },
});

export default SignupScreen;






