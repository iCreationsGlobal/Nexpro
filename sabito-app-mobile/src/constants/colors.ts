/**
 * Sabito App Color Palette
 * Official brand colors for the Sabito mobile application
 */

export const COLORS = {
  // Primary Brand Colors
  DEEP_GREEN: '#005005',      // Splash screen background, dark accents
  APP_GREEN: '#1CA700',        // ✅ Primary brand color (matches theme.primary)
  
  // Neutral Colors
  WHITE: '#FFFFFF',            // Backgrounds, text on dark
  BLACK: '#000000',            // Primary text
  GRAY: '#6B7280',             // Secondary text, subtitles, placeholders
  LIGHT_GRAY: '#F3F4F6',       // Light backgrounds, disabled states
  
  // UI Colors
  STROKE_COLOR: '#D2D9DD',     // Borders, dividers, card outlines
  
  // Functional Colors
  SUCCESS: '#10B981',          // Success messages, positive states
  WARNING: '#F59E0B',          // Warning messages, pending states
  ERROR: '#EF4444',            // Error messages, destructive actions
  INFO: '#3B82F6',             // Info messages, links
  
  // Transparent/Overlay
  OVERLAY: 'rgba(0, 0, 0, 0.5)',
  LIGHT_OVERLAY: 'rgba(0, 0, 0, 0.3)',
} as const;

export default COLORS;





