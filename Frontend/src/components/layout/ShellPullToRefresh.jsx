import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { requestAppRefresh } from '@/utils/appRefresh';
import { cn } from '@/lib/utils';

const TRIGGER_DISTANCE = 64;
const MAX_DISTANCE = 110;
const RESISTANCE = 0.5;
const MIN_SPIN_MS = 600;

/** A sheet, dialog or menu is open — the pull belongs to it, not the page. */
const isOverlayOpen = () =>
  Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]'));

/** The touch started inside something that scrolls on its own and is not at its top. */
const isInsideScrolledArea = (target) => {
  let node = target instanceof Element ? target : null;
  if (node?.closest('[data-no-pull-refresh]')) return true;
  while (node && node !== document.body) {
    if (node.scrollTop > 0) {
      const { overflowY } = window.getComputedStyle(node);
      if (overflowY === 'auto' || overflowY === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
};

/**
 * Pull down at the top of any page to refetch what is on screen (phones and tablets).
 * Replaces the desktop header's hard-refresh button.
 * @param {object} props
 * @param {number} [props.topOffset] - Pixels below the safe area where the indicator rests (header height)
 */
export default function ShellPullToRefresh({ topOffset = 56 }) {
  const queryClient = useQueryClient();
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const gesture = useRef({ active: false, startX: 0, startY: 0, distance: 0 });
  const refreshingRef = useRef(false);

  useEffect(() => {
    const reset = () => {
      gesture.current = { active: false, startX: 0, startY: 0, distance: 0 };
      setDistance(0);
    };

    const onTouchStart = (event) => {
      if (refreshingRef.current || event.touches.length !== 1) return;
      if (window.scrollY > 0 || isOverlayOpen() || isInsideScrolledArea(event.target)) return;
      const touch = event.touches[0];
      gesture.current = { active: true, startX: touch.clientX, startY: touch.clientY, distance: 0 };
    };

    const onTouchMove = (event) => {
      const state = gesture.current;
      if (!state.active) return;
      const touch = event.touches[0];
      const dy = touch.clientY - state.startY;
      const dx = Math.abs(touch.clientX - state.startX);
      if (dy <= 0 || dx > dy || window.scrollY > 0) {
        reset();
        return;
      }
      state.distance = Math.min(dy * RESISTANCE, MAX_DISTANCE);
      setDistance(state.distance);
    };

    const onTouchEnd = () => {
      const state = gesture.current;
      if (!state.active) return;
      const shouldRefresh = state.distance >= TRIGGER_DISTANCE;
      reset();
      if (!shouldRefresh) return;

      refreshingRef.current = true;
      setRefreshing(true);
      const startedAt = Date.now();
      requestAppRefresh(queryClient).finally(() => {
        const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - startedAt));
        window.setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
        }, wait);
      });
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, [queryClient]);

  const visible = refreshing || distance > 4;
  const offset = refreshing ? TRIGGER_DISTANCE : distance;
  const progress = Math.min(distance / TRIGGER_DISTANCE, 1);

  return (
    <div
      aria-hidden={!refreshing}
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed left-1/2 z-30 -translate-x-1/2',
        !gesture.current.active && 'transition-transform duration-200'
      )}
      style={{
        top: `calc(env(safe-area-inset-top, 0px) + ${topOffset - 40}px)`,
        transform: `translate(-50%, ${visible ? offset : 0}px)`,
        opacity: visible ? 1 : 0,
      }}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-brand">
        {refreshing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="sr-only">Refreshing</span>
          </>
        ) : (
          <RefreshCw
            className="h-5 w-5"
            style={{ transform: `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
          />
        )}
      </div>
    </div>
  );
}
