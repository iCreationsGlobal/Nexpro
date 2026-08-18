/**
 * Environment Configuration
 * Centralizes all environment variables for easy access
 * 
 * To use environment variables in React Native:
 * 1. Install: npm install react-native-dotenv
 * 2. Configure in babel.config.js
 * 3. Import from this file
 */

// Using type assertions to handle @env imports which may not have types
declare module '@env' {
  export const API_URL: string | undefined;
  export const SUPPORT_CONTENT_URL: string | undefined;
  export const PAYSTACK_PUBLIC_KEY: string | undefined;
  export const GOOGLE_WEB_CLIENT_ID: string | undefined;
  export const GOOGLE_IOS_CLIENT_ID: string | undefined;
  export const GOOGLE_ANDROID_CLIENT_ID: string | undefined;
  export const ENABLE_DARK_MODE: string | undefined;
  export const ENABLE_BIOMETRIC_AUTH: string | undefined;
  export const ENABLE_PUSH_NOTIFICATIONS: string | undefined;
  export const SUPPORT_CONTENT_CACHE_HOURS: string | undefined;
  export const SESSION_TIMEOUT_MINUTES: string | undefined;
  export const DEBUG_MODE: string | undefined;
  export const LOG_LEVEL: string | undefined;
  export const SENTRY_DSN: string | undefined;
}

// Try to import from @env (will be undefined if not configured)
let DOTENV_API_URL: string | undefined;
let DOTENV_SUPPORT_URL: string | undefined;
let DOTENV_PAYSTACK_KEY: string | undefined;
let DOTENV_GOOGLE_WEB: string | undefined;
let DOTENV_GOOGLE_IOS: string | undefined;
let DOTENV_GOOGLE_ANDROID: string | undefined;
let DOTENV_ENABLE_DARK_MODE: string | undefined;
let DOTENV_ENABLE_BIOMETRIC_AUTH: string | undefined;
let DOTENV_ENABLE_PUSH_NOTIFICATIONS: string | undefined;
let DOTENV_SUPPORT_CACHE_HOURS: string | undefined;
let DOTENV_SESSION_TIMEOUT: string | undefined;
let DOTENV_DEBUG_MODE: string | undefined;
let DOTENV_LOG_LEVEL: string | undefined;
let DOTENV_SENTRY_DSN: string | undefined;

try {
  const envModule = require('@env');
  DOTENV_API_URL = envModule.API_URL;
  DOTENV_SUPPORT_URL = envModule.SUPPORT_CONTENT_URL;
  DOTENV_PAYSTACK_KEY = envModule.PAYSTACK_PUBLIC_KEY;
  DOTENV_GOOGLE_WEB = envModule.GOOGLE_WEB_CLIENT_ID;
  DOTENV_GOOGLE_IOS = envModule.GOOGLE_IOS_CLIENT_ID || envModule.GOOGLE_CLIENT_ID_IOS;
  DOTENV_GOOGLE_ANDROID = envModule.GOOGLE_ANDROID_CLIENT_ID || envModule.GOOGLE_CLIENT_ID_ANDROID;
  DOTENV_ENABLE_DARK_MODE = envModule.ENABLE_DARK_MODE;
  DOTENV_ENABLE_BIOMETRIC_AUTH = envModule.ENABLE_BIOMETRIC_AUTH;
  DOTENV_ENABLE_PUSH_NOTIFICATIONS = envModule.ENABLE_PUSH_NOTIFICATIONS;
  DOTENV_SUPPORT_CACHE_HOURS = envModule.SUPPORT_CONTENT_CACHE_HOURS;
  DOTENV_SESSION_TIMEOUT = envModule.SESSION_TIMEOUT_MINUTES;
  DOTENV_DEBUG_MODE = envModule.DEBUG_MODE;
  DOTENV_LOG_LEVEL = envModule.LOG_LEVEL;
  DOTENV_SENTRY_DSN = envModule.SENTRY_DSN;
} catch (error) {
  // @env module not available, use undefined values
}

// Determine if we're in development mode
const isDev: boolean = __DEV__;

// Lazy load Constants to avoid accessing Platform at module initialization
let Constants: any;
const getConstants = (): any => {
  if (!Constants) {
    Constants = require('expo-constants').default;
  }
  return Constants;
};

const DOT_ENV_MAP: Record<string, string | undefined> = {
  API_URL: DOTENV_API_URL,
  SUPPORT_CONTENT_URL: DOTENV_SUPPORT_URL,
  PAYSTACK_PUBLIC_KEY: DOTENV_PAYSTACK_KEY,
  GOOGLE_CLIENT_ID_WEB: DOTENV_GOOGLE_WEB,
  GOOGLE_CLIENT_ID_IOS: DOTENV_GOOGLE_IOS,
  GOOGLE_CLIENT_ID_ANDROID: DOTENV_GOOGLE_ANDROID,
  ENABLE_DARK_MODE: DOTENV_ENABLE_DARK_MODE,
  ENABLE_BIOMETRIC_AUTH: DOTENV_ENABLE_BIOMETRIC_AUTH,
  ENABLE_PUSH_NOTIFICATIONS: DOTENV_ENABLE_PUSH_NOTIFICATIONS,
  SUPPORT_CONTENT_CACHE_HOURS: DOTENV_SUPPORT_CACHE_HOURS,
  SESSION_TIMEOUT_MINUTES: DOTENV_SESSION_TIMEOUT,
  DEBUG_MODE: DOTENV_DEBUG_MODE,
  LOG_LEVEL: DOTENV_LOG_LEVEL,
  SENTRY_DSN: DOTENV_SENTRY_DSN,
};

// Get environment variables from Expo config or process.env
// Using function declaration for better hoisting
export function getEnvVar(key: string, defaultValue: string = ''): string {
  // Try Expo Constants first (works with app.json extra field)
  const expoValue = getConstants().expoConfig?.extra?.[key];
  if (expoValue) return expoValue;

  // Try .env via react-native-dotenv
  const dotEnvValue = DOT_ENV_MAP[key];
  if (dotEnvValue !== undefined && dotEnvValue !== null && dotEnvValue !== '') {
    return dotEnvValue;
  }

  // Fallback to process.env (rare in RN, but kept for completeness)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }

  // Return default value
  return defaultValue;
}

// ============================================
// API Configuration
// ============================================
export const API_CONFIG = {
  get baseURL(): string {
    const url = getEnvVar('API_URL', 'https://api.sabito.app');
    // Only log in development to avoid console spam in production
    if (isDev) {
      console.log('[API_CONFIG] Getting baseURL:', url);
      console.log('[API_CONFIG] isDev:', isDev);
      console.log('[API_CONFIG] DOTENV_API_URL:', DOTENV_API_URL);
    }
    // Ensure we always return a valid URL
    if (!url || url.trim() === '') {
      console.error('[API_CONFIG] ⚠️ API_URL is empty, using fallback');
      return 'https://api.sabito.app';
    }
    return url;
  },
  timeout: 30000, // 30 seconds
};

// ============================================
// Support Content Configuration
// ============================================
export const SUPPORT_CONFIG = {
  get contentURL(): string {
    return getEnvVar(
      'SUPPORT_CONTENT_URL',
      isDev 
        ? 'http://localhost:5174/api/support/support-content.json'
        : 'https://sabito.com/api/support/support-content.json'
    );
  },
  cacheKey: 'sabito_support_content',
  get cacheDuration(): number {
    return parseInt(getEnvVar('SUPPORT_CONTENT_CACHE_HOURS', '24')) * 60 * 60 * 1000; // Convert hours to ms
  },
};

// ============================================
// Google OAuth Configuration
// ============================================
export const GOOGLE_CONFIG = {
  get iosClientId(): string {
    return getEnvVar('GOOGLE_CLIENT_ID_IOS', '');
  },
  get androidClientId(): string {
    return getEnvVar('GOOGLE_CLIENT_ID_ANDROID', '');
  },
  get webClientId(): string {
    return getEnvVar('GOOGLE_CLIENT_ID_WEB', '');
  },
};

// ============================================
// Payment Configuration (Paystack)
// ============================================
export const PAYSTACK_CONFIG = {
  get publicKey(): string {
    return getEnvVar('PAYSTACK_PUBLIC_KEY', '');
  },
};

// ============================================
// Feature Flags
// ============================================
export const FEATURES = {
  get darkMode(): boolean {
    return getEnvVar('ENABLE_DARK_MODE', 'true') === 'true';
  },
  get biometricAuth(): boolean {
    return getEnvVar('ENABLE_BIOMETRIC_AUTH', 'true') === 'true';
  },
  get pushNotifications(): boolean {
    return getEnvVar('ENABLE_PUSH_NOTIFICATIONS', 'true') === 'true';
  },
};

// ============================================
// Session Configuration
// ============================================
export const SESSION_CONFIG = {
  get timeoutMinutes(): number {
    return parseInt(getEnvVar('SESSION_TIMEOUT_MINUTES', '30'));
  },
};

// ============================================
// Debug Configuration
// ============================================
export const DEBUG_CONFIG = {
  get enabled(): boolean {
    return getEnvVar('DEBUG_MODE', isDev ? 'true' : 'false') === 'true';
  },
  get logLevel(): string {
    return getEnvVar('LOG_LEVEL', isDev ? 'verbose' : 'error'); // verbose, info, warn, error
  },
};

// ============================================
// Environment Info (using getter to avoid initialization issues)
// ============================================
export const getEnvInfo = (): {
  isDevelopment: boolean;
  isProduction: boolean;
  platform: any;
  appVersion: string;
} => ({
  isDevelopment: isDev,
  isProduction: !isDev,
  platform: getConstants().platform,
  appVersion: getConstants().expoConfig?.version || '1.0.0',
});

// Export as constant for backward compatibility (but use getter when possible)
export const ENV_INFO = {
  get isDevelopment(): boolean { return isDev; },
  get isProduction(): boolean { return !isDev; },
  get platform(): any { return getConstants().platform; },
  get appVersion(): string { return getConstants().expoConfig?.version || '1.0.0'; },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Log configuration on app start (only in development)
 */
export const logConfig = (): void => {
  // Always log in production builds to verify secrets are being used
  console.log('========================================');
  console.log('🔧 SABITO APP CONFIGURATION');
  console.log('========================================');
  console.log('API URL:', API_CONFIG.baseURL);
  console.log('Support URL:', SUPPORT_CONFIG.contentURL);
  console.log('Paystack Key:', PAYSTACK_CONFIG.publicKey ? `${PAYSTACK_CONFIG.publicKey.substring(0, 20)}...` : 'NOT SET');
  console.log('Google iOS Client ID:', GOOGLE_CONFIG.iosClientId ? `${GOOGLE_CONFIG.iosClientId.substring(0, 30)}...` : 'NOT SET');
  console.log('Environment:', isDev ? 'Development' : 'Production');
  console.log('App Version:', getConstants().expoConfig?.version || '1.0.0');
  console.log('Build Number:', getConstants().expoConfig?.ios?.buildNumber || 'N/A');
  console.log('========================================');
};

/**
 * Validate required configuration
 */
export const validateConfig = (): void => {
  const errors: string[] = [];

  if (!API_CONFIG.baseURL) {
    errors.push('API_URL is not configured');
  }

  if (!SUPPORT_CONFIG.contentURL) {
    errors.push('SUPPORT_CONTENT_URL is not configured');
  }

  if (!PAYSTACK_CONFIG.publicKey) {
    // Optional warning
  }

  if (!GOOGLE_CONFIG.iosClientId && !GOOGLE_CONFIG.androidClientId) {
    // Optional warning
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors: ${errors.join(', ')}`);
  }
};

// Export default config object
export default {
  api: API_CONFIG,
  support: SUPPORT_CONFIG,
  google: GOOGLE_CONFIG,
  paystack: PAYSTACK_CONFIG,
  features: FEATURES,
  session: SESSION_CONFIG,
  debug: DEBUG_CONFIG,
  env: ENV_INFO,
  logConfig,
  validateConfig,
  getEnvVar, // Also include in default export
};




