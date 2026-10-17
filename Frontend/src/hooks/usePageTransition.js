import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * App-like page changes on phones/tablets: new pages slide in from the right, going back slides in
 * from the left, switching tabs fades. Animates the existing element (nothing remounts) and stays
 * still when the device asks for reduced motion.
 * @param {import('react').RefObject<HTMLElement>} ref - Content area to animate
 * @param {{ enabled: boolean, isTabPath: (pathname: string) => boolean }} options
 */
export function usePageTransition(ref, { enabled, isTabPath }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(location.pathname);
  const isTabPathRef = useRef(isTabPath);
  isTabPathRef.current = isTabPath;

  useLayoutEffect(() => {
    const from = previousPath.current;
    previousPath.current = location.pathname;
    if (!enabled || from === location.pathname) return;

    const element = ref.current;
    if (!element || typeof element.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const switchingTabs = isTabPathRef.current(from) && isTabPathRef.current(location.pathname);
    const offset = switchingTabs ? 0 : navigationType === 'POP' ? -28 : 28;
    element.animate(
      [
        { opacity: 0, transform: `translate3d(${offset}px, 0, 0)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ],
      { duration: switchingTabs ? 160 : 240, easing: EASING }
    );
  }, [enabled, location.pathname, navigationType, ref]);
}

export default usePageTransition;
