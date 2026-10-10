import { useEffect, useSyncExternalStore } from 'react';
import { useObserve } from '@/utils/observe';

/**
 * EAS Observe time-to-interactive for entry screens. The root StartupOverlay covers
 * screens until session + first data are ready, so a screen's own mount is too early;
 * entry screens wait for the overlay to clear before marking interactive.
 */
let startupComplete = false;
const listeners = new Set<() => void>();

export function markStartupComplete() {
  if (startupComplete) return;
  startupComplete = true;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call in every screen the app can open on. Only the first call per session is recorded. */
export function useMarkInteractiveAfterStartup() {
  const { markInteractive } = useObserve();
  const ready = useSyncExternalStore(subscribe, () => startupComplete);
  useEffect(() => {
    if (ready) void markInteractive();
  }, [ready, markInteractive]);
}
