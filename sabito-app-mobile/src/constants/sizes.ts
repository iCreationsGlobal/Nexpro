import { Dimensions, Platform, PlatformOSType } from 'react-native';

/**
 * Get window dimensions (deferred to avoid accessing Dimensions at module load)
 */
const getDimensions = (): { width: number; height: number } => {
  const { width, height } = Dimensions.get('window');
  return { width, height };
};

/**
 * Spacing, sizing, and typography constants
 */

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  xxxxl: 80,
} as const;

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  heading: 28,
} as const;

export const FONT_WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const DIMENSIONS = {
  get width(): number {
    return getDimensions().width;
  },
  get height(): number {
    return getDimensions().height;
  },
  get isSmallDevice(): boolean {
    return getDimensions().width < 375;
  },
  get isMediumDevice(): boolean {
    const w = getDimensions().width;
    return w >= 375 && w < 768;
  },
  get isLargeDevice(): boolean {
    return getDimensions().width >= 768;
  },
};

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  round: 999,
} as const;

// Platform-specific layout padding (function to defer Platform access)
export const getLayoutPadding = (): number => Platform.select({
  ios: 32,      // xl spacing on iOS
  android: 20,  // 20px on Android
  default: 32,
}) as number;

// For backward compatibility, default to 32 (can be used as constant)
export const LAYOUT_PADDING = 32;

export default {
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  DIMENSIONS,
  BORDER_RADIUS,
  LAYOUT_PADDING,
};





