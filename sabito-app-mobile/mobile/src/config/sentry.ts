/**
 * Sentry Configuration
 * Error tracking and monitoring for production builds
 */

import * as Sentry from '@sentry/react-native';
import { getEnvVar } from './env';
import type { User } from '../types/api';

// Initialize Sentry
export const initSentry = (): void => {
  console.log('[Sentry] 🔍 Checking Sentry configuration...');
  
  // Prefer local .env / EAS env — never hardcode DSNs in source
  let dsn: string | null = getEnvVar('SENTRY_DSN', '') || null;
  
  // Also try from Constants directly (for EAS builds)
  if (!dsn) {
    try {
      const Constants = require('expo-constants').default;
      dsn = Constants.expoConfig?.extra?.SENTRY_DSN || 
            Constants.manifest?.extra?.SENTRY_DSN ||
            Constants.manifest2?.extra?.expoClient?.extra?.SENTRY_DSN ||
            null;
    } catch (e: any) {
      console.warn('[Sentry] Could not access Constants:', e.message);
    }
  }
  
  // Try process.env as last resort (for EAS builds)
  if (!dsn && typeof process !== 'undefined' && process.env) {
    dsn = (process.env.SENTRY_DSN || process.env.EXPO_PUBLIC_SENTRY_DSN) || null;
  }

  if (!dsn || dsn === 'YOUR_SENTRY_DSN') {
    console.log('[Sentry] ⏭️ Skipping init — SENTRY_DSN not set in .env / EAS');
    return;
  }
  
  const environment = getEnvVar('APP_ENV', __DEV__ ? 'development' : 'production');
  
  console.log('[Sentry] 📋 Configuration check:', {
    hasDsn: Boolean(dsn),
    dsnPrefix: dsn ? dsn.substring(0, 20) + '...' : 'NOT FOUND',
    dsnSource: 'ENVIRONMENT',
    environment,
    isDev: __DEV__,
    nodeEnv: typeof process !== 'undefined' ? process.env.NODE_ENV : 'unknown',
  });

  try {
    // Check if we're in Expo Go (which doesn't support native Sentry modules)
    const Constants = require('expo-constants').default;
    const isExpoGo = Constants.appOwnership === 'expo';
    
    if (isExpoGo) {
      console.log('[Sentry] 📱 Running in Expo Go - Sentry disabled (native modules not available)');
      console.log('[Sentry] ℹ️  Sentry will work in production builds and development builds');
      isSentryInitialized = false;
      return;
    }
    
    Sentry.init({
      dsn: dsn,
      environment: environment,
      enableInExpoDevelopment: false, // Disable in Expo Go
      debug: __DEV__, // Enable debug mode in development
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 10% of transactions in production
      beforeSend(event, hint) {
        // Filter out sensitive data
        if (event.request) {
          // Remove sensitive headers
          if (event.request.headers) {
            delete event.request.headers['Authorization'];
            delete event.request.headers['authorization'];
          }
        }
        return event;
      },
      integrations: [
        new Sentry.ReactNativeTracing({
          // Enable performance monitoring
          enableNativeFramesTracking: true,
          enableStallTracking: true,
        }),
      ],
    });

    isSentryInitialized = true;
    console.log('✅ [Sentry] Initialized successfully');
    console.log('[Sentry] 📊 Configuration:', {
      dsn: dsn.substring(0, 20) + '...',
      environment,
      debug: __DEV__,
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    });
    
    // Test Sentry by sending a test message
    try {
      Sentry.captureMessage('Sentry initialized successfully', 'info');
      console.log('✅ [Sentry] Test message sent to Sentry');
    } catch (testError: any) {
      console.warn('⚠️ [Sentry] Could not send test message:', testError.message);
    }
  } catch (error: any) {
    isSentryInitialized = false;
    
    // Check if it's an Expo Go compatibility error
    if (error.message && (
      error.message.includes('prototype') || 
      error.message.includes('native module') ||
      error.message.includes('undefined')
    )) {
      console.warn('⚠️ [Sentry] Not available in Expo Go (requires native modules)');
      console.log('[Sentry] ℹ️  This is expected - Sentry will work in production builds');
    } else {
      console.error('❌ [Sentry] Initialization failed:', error);
      console.error('❌ [Sentry] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }
  }
};

// Track if Sentry is initialized
let isSentryInitialized: boolean = false;

// Set initialization flag
export const setSentryInitialized = (value: boolean): void => {
  isSentryInitialized = value;
};

// Set user context for better error tracking
export const setSentryUser = (user: User | null): void => {
  if (!user || !isSentryInitialized) return;
  
  try {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
      accountType: user.accountType,
    });
  } catch (error: any) {
    console.error('❌ [Sentry] Failed to set user:', error);
  }
};

// Clear user context (on logout)
export const clearSentryUser = (): void => {
  if (!isSentryInitialized) return;
  
  try {
    Sentry.setUser(null);
  } catch (error: any) {
    console.error('❌ [Sentry] Failed to clear user:', error);
  }
};

// Capture exception manually
export const captureException = (error: Error | string, context: Record<string, any> = {}): void => {
  if (!isSentryInitialized) {
    console.warn('⚠️ [Sentry] Not initialized. Not sending error to Sentry.', error, context);
    return;
  }
  
  try {
    console.log('[Sentry] 📤 Sending exception to Sentry:', {
      errorMessage: typeof error === 'string' ? error : (error?.message || String(error)),
      errorName: typeof error === 'object' ? error?.name : undefined,
      contextKeys: Object.keys(context),
    });
    
    Sentry.captureException(error, {
      extra: context,
    });
    
    console.log('✅ [Sentry] Exception sent successfully');
  } catch (err: any) {
    console.error('❌ [Sentry] Failed to capture exception:', err);
  }
};

// Capture message manually
export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info', context: Record<string, any> = {}): void => {
  if (!isSentryInitialized) {
    console.warn('⚠️ [Sentry] Not initialized. Not sending message to Sentry.', message, context);
    return;
  }
  
  try {
    console.log('[Sentry] 📤 Sending message to Sentry:', {
      message,
      level,
      contextKeys: Object.keys(context),
    });
    
    Sentry.captureMessage(message, {
      level: level,
      extra: context,
    });
    
    console.log('✅ [Sentry] Message sent successfully');
  } catch (error: any) {
    console.error('❌ [Sentry] Failed to capture message:', error);
  }
};

export default Sentry;





