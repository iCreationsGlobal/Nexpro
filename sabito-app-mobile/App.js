import React from 'react';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import RootNavigator from './src/navigation/RootNavigator';
import { ThemeProvider } from './src/context/ThemeContext';
import ErrorBoundary from './src/components/common/ErrorBoundary';
import COLORS from './src/constants/colors';
import { API_CONFIG } from './src/config/env';

const paperTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.APP_GREEN,
    accent: COLORS.APP_GREEN,
    background: COLORS.WHITE,
    surface: COLORS.WHITE,
    text: COLORS.BLACK,
  },
};

export default function App() {
  if (__DEV__) {
    console.log('[Sabito] ABS API:', API_CONFIG.baseURL);
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ErrorBoundary>
          <ThemeProvider>
            <PaperProvider theme={paperTheme}>
              <RootNavigator />
            </PaperProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
