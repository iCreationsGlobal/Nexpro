/**
 * Theme Helper Utilities
 * Provides functions to easily apply theme colors to components
 */

import { getTheme } from '../constants/themes';
import type { EffectiveTheme } from '../context/ThemeContext';

export interface ThemedStyle {
  [key: string]: any;
}

export interface CommonThemedStyles {
  safeArea: { backgroundColor: string };
  header: { borderBottomColor: string };
  scrollView: { backgroundColor: string };
  card: { backgroundColor: string; borderColor: string };
  text: { color: string };
  textSecondary: { color: string };
  input: { backgroundColor: string; borderColor: string; color: string };
  inputPlaceholder: string;
  statusBar: 'light-content' | 'dark-content';
}

/**
 * Get themed style object
 * @param theme - Theme name ('light' or 'dark')
 * @param baseStyle - Base StyleSheet styles
 * @param themedProps - Properties to apply theme colors to
 * @returns Styled object with theme colors applied
 */
export const getThemedStyle = (
  theme: EffectiveTheme, 
  baseStyle: ThemedStyle, 
  themedProps: Record<string, string> = {}
): ThemedStyle[] => {
  const { colors } = getTheme(theme);
  const themedStyle: ThemedStyle = {};
  
  Object.keys(themedProps).forEach(key => {
    themedStyle[key] = (colors as any)[themedProps[key]];
  });
  
  return [baseStyle, themedStyle];
};

/**
 * Get common themed styles for screens
 * @param theme - Theme name ('light' or 'dark')
 * @returns Common themed styles
 */
export const getCommonThemedStyles = (theme: EffectiveTheme): CommonThemedStyles => {
  const { colors, isDark } = getTheme(theme);
  
  return {
    safeArea: {
      backgroundColor: colors.background,
    },
    header: {
      borderBottomColor: colors.border,
    },
    scrollView: {
      backgroundColor: colors.background,
    },
    card: {
      backgroundColor: colors.cardBackground,
      borderColor: colors.border,
    },
    text: {
      color: colors.text,
    },
    textSecondary: {
      color: colors.textSecondary,
    },
    input: {
      backgroundColor: colors.inputBackground,
      borderColor: colors.inputBorder,
      color: colors.inputText,
    },
    inputPlaceholder: colors.inputPlaceholder,
    statusBar: isDark ? 'light-content' : 'dark-content',
  };
};

/**
 * Apply theme colors to array of style objects
 */
export const themed = (
  theme: EffectiveTheme, 
  styles: ThemedStyle, 
  overrides: ThemedStyle = {}
): ThemedStyle[] => {
  return [styles, overrides];
};





