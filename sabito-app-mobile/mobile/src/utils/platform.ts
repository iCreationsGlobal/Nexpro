import { Platform, PlatformOSType } from 'react-native';

/**
 * Platform Detection Utilities
 * Using getter functions to avoid accessing Platform at module initialization
 */

export const isIOS = (): boolean => Platform.OS === 'ios';
export const isAndroid = (): boolean => Platform.OS === 'android';
export const isWeb = (): boolean => Platform.OS === 'web';

/**
 * Get platform-specific value
 */
export const platformValue = <T>(iosValue: T, androidValue: T, webValue: T = iosValue): T => {
  return Platform.select({
    ios: iosValue,
    android: androidValue,
    web: webValue,
  }) as T;
};

/**
 * Check iOS version
 */
export const isIOSVersion = (version: number): boolean => {
  return isIOS() && parseInt(Platform.Version.toString(), 10) >= version;
};

/**
 * Check Android version (API level)
 */
export const isAndroidVersion = (apiLevel: number): boolean => {
  return isAndroid() && (Platform.Version as number) >= apiLevel;
};

export interface ShadowStyle {
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;
}

export interface SafeAreaStyle {
  paddingTop: number;
}

/**
 * Platform-specific styles
 */
export const platformStyles = {
  // Shadow styles (iOS uses shadow, Android uses elevation)
  shadow: (opacity: number = 0.1, radius: number = 8, elevation: number = 5): ShadowStyle => ({
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: opacity,
        shadowRadius: radius,
      },
      android: {
        elevation: elevation,
      },
    }),
  }) as ShadowStyle,
  
  // Safe area top padding (accounts for notch)
  safeAreaTop: (): SafeAreaStyle => ({
    paddingTop: Platform.select({
      ios: 50,
      android: 20,
      default: 0,
    }) as number,
  }),
};

export default {
  isIOS,
  isAndroid,
  isWeb,
  platformValue,
  isIOSVersion,
  isAndroidVersion,
  platformStyles,
};





