import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { useColorScheme, Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: ThemeMode;              // User preference: 'light', 'dark', or 'system'
  effectiveTheme: EffectiveTheme; // Resolved theme: 'light' or 'dark' (for getTheme)
  isDark: boolean;                // boolean - current effective theme
  toggleTheme: (newTheme: ThemeMode) => Promise<void>; // function to change theme
  isLoading: boolean;
}

export interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const hookTheme = useColorScheme(); // 'light' or 'dark' from hook
  const appearanceTheme = Appearance.getColorScheme(); // 'light' or 'dark' from Appearance API
  
  // Use Appearance API as primary, fallback to hook
  const systemTheme: ColorSchemeName = appearanceTheme || hookTheme || 'light';
  
  const [theme, setTheme] = useState<ThemeMode>('system'); // 'light', 'dark', 'system'
  const [isDark, setIsDark] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Debug log on every render
  useEffect(() => {
    loadThemePreference();
    
    // Listen to Appearance changes for better detection
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (theme === 'system') {
        const shouldBeDark = colorScheme === 'dark';
        setIsDark(shouldBeDark);
      }
    });

    return () => subscription.remove();
  }, []);

  // Update isDark when system theme changes (for 'system' mode)
  useEffect(() => {
    if (theme === 'system') {
      const shouldBeDark = systemTheme === 'dark';
      setIsDark(shouldBeDark);
    }
  }, [systemTheme, theme]);

  const loadThemePreference = async (): Promise<void> => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme');
      
      // Handle case where theme might be stored as boolean (legacy/error)
      if (savedTheme === 'true' || savedTheme === 'false') {
        // Clean up invalid boolean value
        await AsyncStorage.removeItem('theme');
        setTheme('system');
        const shouldBeDark = systemTheme === 'dark';
        setIsDark(shouldBeDark);
        return;
      }
      
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system')) {
        const themeMode = savedTheme as ThemeMode;
        setTheme(themeMode);
        updateIsDark(themeMode);
      } else {
        // Default to system
        setTheme('system');
        const shouldBeDark = systemTheme === 'dark';
        setIsDark(shouldBeDark);
      }
    } catch (error) {
      // If there's an error reading, try to clean up and default
      try {
        await AsyncStorage.removeItem('theme');
      } catch {
        // Ignore cleanup errors
      }
      setTheme('system');
      const shouldBeDark = systemTheme === 'dark';
      setIsDark(shouldBeDark);
    } finally {
      setIsLoading(false);
    }
  };

  const updateIsDark = (themeMode: ThemeMode): void => {
    if (themeMode === 'system') {
      const shouldBeDark = systemTheme === 'dark';
      setIsDark(shouldBeDark);
    } else {
      const shouldBeDark = themeMode === 'dark';
      setIsDark(shouldBeDark);
    }
  };

  const toggleTheme = async (newTheme: ThemeMode): Promise<void> => {
    try {
      setTheme(newTheme);
      updateIsDark(newTheme);
      await AsyncStorage.setItem('theme', newTheme);
    } catch (error) {
      // Error handling
    }
  };

  // Compute effective theme for getTheme() - must be 'light' or 'dark', not 'system'
  const effectiveTheme: EffectiveTheme = theme === 'system' ? (systemTheme === 'dark' ? 'dark' : 'light') : theme;
  const value: ThemeContextValue = {
    theme,              // User preference: 'light', 'dark', or 'system'
    effectiveTheme,     // Resolved theme: 'light' or 'dark' (for getTheme)
    isDark,             // boolean - current effective theme
    toggleTheme,        // function to change theme
    isLoading,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};




