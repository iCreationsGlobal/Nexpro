/**
 * Sabito marketer mobile → ABS API configuration.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { resolveApiUrl } from './resolveApiUrl';

const DEFAULT_ABS_API =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:5001/api'
    : 'http://localhost:5001/api';

function readAbsApiUrl(): string {
  // Expo inlines EXPO_PUBLIC_* from .env at bundle time
  const fromExpo =
    process.env.EXPO_PUBLIC_ABS_API_URL;

  // Also support react-native-dotenv (@env) if present
  let fromDotenv: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const env = require('@env') as { EXPO_PUBLIC_ABS_API_URL?: string };
    fromDotenv = env?.EXPO_PUBLIC_ABS_API_URL;
  } catch {
    // @env not generated / not available
  }

  return String(fromExpo || fromDotenv || DEFAULT_ABS_API);
}

const raw = readAbsApiUrl();

export const API_CONFIG = {
  get baseURL(): string {
    return resolveApiUrl(raw || DEFAULT_ABS_API, Constants.expoConfig?.hostUri, __DEV__);
  },
  timeout: 30000,
};

export const TOKEN_KEY = 'sabito_marketer_token';
export const SABITO_SITE_URL = (process.env.EXPO_PUBLIC_SABITO_SITE_URL || 'https://sabito.app').replace(/\/+$/, '');

export const FEATURES = {
  darkMode: true,
  pushNotifications: false,
};

/** Paystack not used on ABS marketer mobile; stub keeps orphan screens compiling. */
export const PAYSTACK_CONFIG = {
  publicKey: '',
};

export default {
  api: API_CONFIG,
  features: FEATURES,
  paystack: PAYSTACK_CONFIG,
};
