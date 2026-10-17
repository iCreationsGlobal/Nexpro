import { useSyncExternalStore } from 'react';

/**
 * Phones: narrower than Tailwind's md breakpoint. Bottom-sheet forms and drawers use this.
 * Keep in sync with PHONE_MEDIA in tailwind.config.js.
 */
export const PHONE_MEDIA_QUERY = '(max-width: 767.98px)';

/**
 * App-style layout (bottom tabs, More sheet, app headers): every screen under 1024px, plus
 * touch-first tablets up to 1366px wide (iPad Pro in landscape). Desktops and laptops, whose
 * main pointer is a mouse or trackpad, keep the sidebar.
 * Keep in sync with APP_SHELL_MEDIA in tailwind.config.js (the `shell:` / `desk:` variants).
 */
export const APP_SHELL_MEDIA_QUERY = '(max-width: 1023.98px), (pointer: coarse) and (max-width: 1366px)';

const NOOP_UNSUBSCRIBE = () => {};
const stores = new Map();

/**
 * One MediaQueryList per query, shared by every component that asks for it.
 * @param {string} query
 */
function getMediaStore(query) {
  let store = stores.get(query);
  if (store) return store;

  const mql =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query)
      : null;

  store = {
    subscribe(onChange) {
      if (!mql) return NOOP_UNSUBSCRIBE;
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
      }
      // Safari < 14
      mql.addListener?.(onChange);
      return () => mql.removeListener?.(onChange);
    },
    getSnapshot: () => Boolean(mql?.matches),
  };
  stores.set(query, store);
  return store;
}

const getServerSnapshot = () => false;

/**
 * @param {string} query - CSS media query
 * @returns {boolean} Whether the query currently matches
 */
export function useMediaQuery(query) {
  const store = getMediaStore(query);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}

/** Non-hook read for event handlers and utilities. */
export function matchesAppShell() {
  return getMediaStore(APP_SHELL_MEDIA_QUERY).getSnapshot();
}

/**
 * Which layout the workspace uses on this screen.
 * - phone: app shell, bottom-sheet forms
 * - tablet: app shell, centred dialogs and side drawers
 * - desktop: sidebar layout
 * @returns {{ mode: 'phone'|'tablet'|'desktop', isPhone: boolean, isTablet: boolean, isAppShell: boolean }}
 */
export function useDeviceMode() {
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const isAppShell = useMediaQuery(APP_SHELL_MEDIA_QUERY) || isPhone;
  const mode = isPhone ? 'phone' : isAppShell ? 'tablet' : 'desktop';
  return { mode, isPhone, isTablet: mode === 'tablet', isAppShell };
}

export default useDeviceMode;
