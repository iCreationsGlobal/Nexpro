import { matchesAppShell } from '@/hooks/useDeviceMode';

/**
 * Short vibrations for moments that matter on phones/tablets (Android; iOS browsers ignore it),
 * like the native app's haptics. Skipped on desktop and when the device asks for reduced motion.
 */
const PATTERNS = {
  /** A threshold reached (pull to refresh). */
  tick: 10,
  /** Something finished (sale completed). */
  success: [15, 60, 15],
  /** Done, but with a caveat (sale saved offline). */
  notice: [35, 80, 35],
};

/** @param {keyof typeof PATTERNS} [kind] */
export function haptic(kind = 'tick') {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (!matchesAppShell()) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tick);
  } catch {
    // Vibration is a nicety; never let it break the action.
  }
}

export default haptic;
