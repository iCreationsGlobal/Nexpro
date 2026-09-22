/**
 * Web-only fix-up: on mobile, the Simple Mode escape hatch (SimpleHeader long-press) replaces the
 * route but the root nav effect re-fires on that same pathname change and immediately bounces the
 * user back to /simple, since `interfaceMode` itself hasn't changed. On web we track the escape
 * explicitly so the global redirect guard can honor it for the rest of this browser tab — the
 * escape is meant to give an admin a window to open Settings and turn Simple Mode off for real.
 */

const KEY = 'simple_mode_escaped';

export const markSimpleModeEscaped = () => {
  try {
    window.sessionStorage.setItem(KEY, '1');
  } catch {
    // Storage unavailable (private mode) — escape just won't stick across renders.
  }
};

export const clearSimpleModeEscape = () => {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // no-op
  }
};

export const hasEscapedSimpleMode = () => {
  try {
    return window.sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
