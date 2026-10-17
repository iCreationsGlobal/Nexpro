import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const RESTORE_TIMEOUT_MS = 1500;

/**
 * Scroll like an app (phones and tablets):
 * - Back/forward returns to where you were on that page.
 * - Switching to a tab page returns to where you left that tab.
 * - Opening any other page starts at the top.
 * Query-only changes (filters, ?openPOS=1) leave the scroll alone.
 * @param {object} options
 * @param {boolean} options.enabled
 * @param {(pathname: string) => boolean} options.isTabPath
 */
export function useShellScrollMemory({ enabled, isTabPath }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const byKey = useRef(new Map());
  const byTabPath = useRef(new Map());
  const current = useRef({ key: location.key, pathname: location.pathname, y: 0 });
  const isTabPathRef = useRef(isTabPath);
  isTabPathRef.current = isTabPath;

  // Track the live position so it can be saved even after the next page has rendered.
  useEffect(() => {
    if (!enabled) return undefined;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        current.current.y = window.scrollY;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const previous = current.current;
    if (previous.pathname === location.pathname) {
      current.current = { ...previous, key: location.key };
      return undefined;
    }

    byKey.current.set(previous.key, previous.y);
    if (isTabPathRef.current(previous.pathname)) byTabPath.current.set(previous.pathname, previous.y);
    current.current = { key: location.key, pathname: location.pathname, y: 0 };

    let target = 0;
    if (navigationType === 'POP') {
      target = byKey.current.get(location.key) ?? 0;
    } else if (isTabPathRef.current(location.pathname)) {
      target = byTabPath.current.get(location.pathname) ?? 0;
    }

    window.scrollTo(0, 0);
    if (target <= 0) return undefined;

    // Content usually arrives after the route renders: keep trying until the page is tall enough.
    let frame = 0;
    let cancelled = false;
    const startedAt = performance.now();
    const cancel = () => {
      cancelled = true;
    };
    const attempt = () => {
      if (cancelled) return;
      window.scrollTo(0, target);
      current.current.y = window.scrollY;
      const reached = Math.abs(window.scrollY - target) < 2;
      if (!reached && performance.now() - startedAt < RESTORE_TIMEOUT_MS) {
        frame = window.requestAnimationFrame(attempt);
      }
    };
    frame = window.requestAnimationFrame(attempt);
    window.addEventListener('touchstart', cancel, { passive: true, once: true });
    window.addEventListener('wheel', cancel, { passive: true, once: true });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('wheel', cancel);
    };
  }, [enabled, location.key, location.pathname, navigationType]);
}

export default useShellScrollMemory;
