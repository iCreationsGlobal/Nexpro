// Theme color palettes for light and dark modes

export interface ThemeColors {
  // Backgrounds
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  
  // Cards & Surfaces
  cardBackground: string;
  modalBackground: string;
  headerBackground: string;
  
  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  
  // Borders & Dividers
  border: string;
  divider: string;
  stroke: string;
  
  // Inputs
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  
  // UI Element Backgrounds
  chipBackground: string;
  buttonBackground: string;
  badgeBackground: string;
  
  // Brand Colors
  primary: string;
  primaryLight: string;
  primaryDark: string;
  
  // Status Colors
  success: string;
  successBg: string;
  error: string;
  errorBg: string;
  warning: string;
  warningBg: string;
  info: string;
  infoBg: string;
  
  // UI Elements
  iconPrimary: string;
  iconSecondary: string;
  iconDisabled: string;
  
  // Special
  shadow: string;
  overlay: string;
}

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

export const lightTheme: ThemeColors = {
  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F3F4F6',   // Light gray for chips, info boxes
  backgroundTertiary: '#F9FAFB',
  
  // Cards & Surfaces
  cardBackground: '#FFFFFF',
  modalBackground: '#FFFFFF',
  headerBackground: '#FFFFFF',
  
  // Text
  text: '#000000',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textDisabled: '#D1D5DB',
  
  // Borders & Dividers
  border: '#E0E0E0',
  divider: '#E5E7EB',
  stroke: '#E0E0E0',
  
  // Inputs
  inputBackground: '#F9FAFB',
  inputBorder: '#E0E0E0',
  inputText: '#000000',
  inputPlaceholder: '#9CA3AF',
  
  // UI Element Backgrounds (colored in light mode)
  chipBackground: '#F3F4F6',       // Light gray chips
  buttonBackground: '#F4F4F4',     // Light gray buttons
  badgeBackground: '#F3F4F6',      // Light gray badges
  
  // Brand Colors (unchanged)
  primary: '#1CA700',
  primaryLight: '#E8F5E9',
  primaryDark: '#157A00',
  
  // Status Colors
  success: '#1CA700',
  successBg: '#E8F5E9',
  error: '#D32F2F',
  errorBg: '#FFEBEE',
  warning: '#F9A825',
  warningBg: '#FFF8E1',
  info: '#1E88E5',
  infoBg: '#E3F2FD',
  
  // UI Elements
  iconPrimary: '#000000',
  iconSecondary: '#6B7280',
  iconDisabled: '#D1D5DB',
  
  // Special
  shadow: 'rgba(0, 0, 0, 0.1)',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

export const darkTheme: ThemeColors = {
  // Backgrounds
  background: '#0F172A',        // Slate 900 - Main screen background
  backgroundSecondary: '#1E293B', // Slate 800 - Cards only
  backgroundTertiary: 'transparent', // Transparent for chips, buttons, etc.
  
  // Cards & Surfaces
  cardBackground: '#1E293B',     // Dark cards
  modalBackground: '#1E293B',
  headerBackground: 'transparent', // Transparent header
  
  // Text
  text: '#F1F5F9',             // Slate 100
  textSecondary: '#94A3B8',     // Slate 400
  textTertiary: '#64748B',      // Slate 500
  textDisabled: '#475569',      // Slate 600
  
  // Borders & Dividers
  border: '#334155',            // Slate 700
  divider: '#475569',           // Slate 600
  stroke: '#334155',
  
  // Inputs
  inputBackground: 'transparent', // Transparent input background
  inputBorder: '#334155',         // Gray border
  inputText: '#F1F5F9',
  inputPlaceholder: '#64748B',
  
  // UI Element Backgrounds (transparent strategy)
  chipBackground: 'transparent',     // Chips transparent
  buttonBackground: 'transparent',   // Icon buttons transparent
  badgeBackground: 'transparent',    // Inactive badges transparent
  
  // Brand Colors (adjusted for dark mode)
  primary: '#22C55E',          // Brighter green for dark
  primaryLight: '#1E293B',
  primaryDark: '#16A34A',
  
  // Status Colors (adjusted)
  success: '#22C55E',          // Green 500
  successBg: '#1E293B',
  error: '#EF4444',            // Red 500
  errorBg: '#1E293B',
  warning: '#F59E0B',          // Amber 500
  warningBg: '#1E293B',
  info: '#3B82F6',             // Blue 500
  infoBg: '#1E293B',
  
  // UI Elements
  iconPrimary: '#F1F5F9',
  iconSecondary: '#94A3B8',
  iconDisabled: '#475569',
  
  // Special
  shadow: 'rgba(0, 0, 0, 0.3)',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

export type ThemeName = 'light' | 'dark';

// Get theme based on theme name ('light' or 'dark')
export const getTheme = (themeName: ThemeName): Theme => {
  const isDark = themeName === 'dark';
  const colors = isDark ? darkTheme : lightTheme;
  return { colors, isDark };
};

// Helper to get color with fallback
export const getColor = (themeName: ThemeName, colorKey: keyof ThemeColors): string => {
  const { colors } = getTheme(themeName);
  return colors[colorKey] || lightTheme[colorKey];
};

export default { lightTheme, darkTheme, getTheme, getColor };





