import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * AsyncStorage Helper Functions
 * Simplified API for storing and retrieving data
 */

export const STORAGE_KEYS = {
  HAS_SEEN_ONBOARDING: '@sabito:hasSeenOnboarding',
  ACCESS_TOKEN: '@sabito:accessToken',
  REFRESH_TOKEN: '@sabito:refreshToken',
  USER_DATA: '@sabito:userData',
  THEME_PREFERENCE: '@sabito:themePreference',
} as const;

/**
 * Store a value in AsyncStorage
 */
export const storeData = async (key: string, value: any): Promise<boolean> => {
  try {
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Retrieve a value from AsyncStorage
 */
export const getData = async <T = any>(key: string): Promise<T | null> => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (error) {
    return null;
  }
};

/**
 * Remove a value from AsyncStorage
 */
export const removeData = async (key: string): Promise<boolean> => {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Clear all AsyncStorage data
 */
export const clearAll = async (): Promise<boolean> => {
  try {
    await AsyncStorage.clear();
    return true;
  } catch (error) {
    return false;
  }
};

// Specific storage functions for onboarding
export const setOnboardingCompleted = async (): Promise<boolean> => {
  return await storeData(STORAGE_KEYS.HAS_SEEN_ONBOARDING, true);
};

export const hasSeenOnboarding = async (): Promise<boolean | null> => {
  return await getData<boolean>(STORAGE_KEYS.HAS_SEEN_ONBOARDING);
};

export const resetOnboarding = async (): Promise<boolean> => {
  return await removeData(STORAGE_KEYS.HAS_SEEN_ONBOARDING);
};

// Token storage functions
export const storeTokens = async (accessToken: string, refreshToken: string): Promise<void> => {
  await storeData(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  await storeData(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
};

export const getAccessToken = async (): Promise<string | null> => {
  return await getData<string>(STORAGE_KEYS.ACCESS_TOKEN);
};

export const getRefreshToken = async (): Promise<string | null> => {
  return await getData<string>(STORAGE_KEYS.REFRESH_TOKEN);
};

export const clearTokens = async (): Promise<void> => {
  await removeData(STORAGE_KEYS.ACCESS_TOKEN);
  await removeData(STORAGE_KEYS.REFRESH_TOKEN);
};

// User data storage
export const storeUserData = async (userData: any): Promise<boolean> => {
  return await storeData(STORAGE_KEYS.USER_DATA, userData);
};

export const getUserData = async <T = any>(): Promise<T | null> => {
  return await getData<T>(STORAGE_KEYS.USER_DATA);
};

export const clearUserData = async (): Promise<boolean> => {
  return await removeData(STORAGE_KEYS.USER_DATA);
};

// Clear all user auth data (for logout/testing)
export const clearAllUserData = async (): Promise<boolean> => {
  try {
    // Clear all auth-related storage
    await AsyncStorage.multiRemove([
      'accessToken',
      'refreshToken',
      'user',
      'business',
      'theme', // Clear theme preference so it defaults to system
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.USER_DATA,
    ]);
    return true;
  } catch (error) {
    return false;
  }
};

export default {
  storeData,
  getData,
  removeData,
  clearAll,
  setOnboardingCompleted,
  hasSeenOnboarding,
  resetOnboarding,
  storeTokens,
  getAccessToken,
  getRefreshToken,
  clearTokens,
  storeUserData,
  getUserData,
  clearUserData,
  clearAllUserData,
  STORAGE_KEYS,
};





