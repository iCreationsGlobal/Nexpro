import React, { useEffect, useRef } from 'react';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RootNavigator from './src/navigation/RootNavigator';
import { ThemeProvider } from './src/context/ThemeContext';
import ErrorBoundary from './src/components/common/ErrorBoundary';
import COLORS from './src/constants/colors';
import { logConfig, validateConfig, API_CONFIG } from './src/config/env';
import { initSentry } from './src/config/sentry';
import { 
  registerForPushNotifications, 
  addNotificationReceivedListener,
  addNotificationResponseListener 
} from './src/services/pushNotificationService';
import { ensurePushTokenRegistered } from './src/services/notificationRetryService';
import socketService from './src/services/socketService';
import { initializeTokenCache } from './src/services/apiClient';

// React Native Paper theme configuration
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
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    // Initialize Sentry first (before other initialization)
    initSentry();

    // Initialize token cache early to avoid AsyncStorage I/O on first request
    initializeTokenCache();

    // Initialize and validate configuration on app start
    try {
      logConfig(); // Log configuration in development
      validateConfig(); // Validate required config
      console.log('✅ [App] Configuration loaded successfully');
      console.log(`🌐 [App] API base URL: ${API_CONFIG.baseURL}`);
    } catch (error) {
      console.error('❌ [App] Configuration error:', error.message);
      // Continue app launch even if validation fails (with warnings)
    }

    // Initialize push notifications
    initializePushNotifications();
    
    // Initialize socket connection (for real-time chat)
    initializeSocketConnection();
    
    // Listen for system notifications from socket
    setupSocketNotifications();

    // Cleanup listeners on unmount
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      // Disconnect socket on unmount
      socketService.disconnect();
    };
  }, []);

  const initializePushNotifications = async () => {
    try {
      // Ensure push token is registered (handles retries and existing tokens)
      await ensurePushTokenRegistered();

      // Handle notifications received while app is open
      notificationListener.current = addNotificationReceivedListener(notification => {
        console.log('🔔 [App] Push notification received:', notification);
        // In-app notifications are handled by socket events in chat screens
        // This is for push notifications when app is in foreground
      });

      // Handle notification tapped by user
      responseListener.current = addNotificationResponseListener(response => {
        console.log('🔔 Notification tapped:', response);
        // Handle navigation based on notification data
        const data = response.notification.request.content.data;
        if (data.screen) {
          // Navigate to specific screen based on notification data
          // This can be extended based on your app's navigation needs
          console.log('Navigate to:', data.screen);
        }
      });
    } catch (error) {
      console.error('❌ [App] Push notification initialization error:', error);
    }
  };

  const initializeSocketConnection = async () => {
    try {
      // Check if user is logged in before connecting
      const user = await AsyncStorage.getItem('user');
      if (user) {
        await socketService.connect();
        console.log('✅ Socket connection initialized');
      }
    } catch (error) {
      console.error('❌ Failed to initialize socket connection:', error);
      // Don't block app startup if socket fails
    }
  };

  const setupSocketNotifications = async () => {
    try {
      // Wait a bit for socket to connect
      setTimeout(async () => {
        const user = await AsyncStorage.getItem('user');
        if (user) {
          // Listen for system notifications from socket
          socketService.onSystemNotification((notification) => {
            console.log('🔔 [App] System notification from socket:', notification);
            // Handle system notifications (e.g., project updates, referral status changes)
            // These can be displayed as in-app notifications or push notifications
          });
        }
      }, 2000);
    } catch (error) {
      console.error('❌ Failed to setup socket notifications:', error);
    }
  };

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <ThemeProvider>
            <PaperProvider theme={paperTheme}>
              <RootNavigator />
            </PaperProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
