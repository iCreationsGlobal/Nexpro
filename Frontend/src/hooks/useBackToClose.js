import { useCallback, useEffect, useRef, useState } from 'react';
import { matchesAppShell } from './useDeviceMode';

/**
 * Phones and tablets: the back button / back gesture closes the open sheet or dialog instead of
 * leaving the page, like the native app.
 *
 * Each open overlay adds one history entry (same URL, tagged with its id). Back pops that entry and
 * the overlay closes. Closing it any other way (X, save, tap outside) pops the entry again, unless
 * the app has already navigated somewhere else — then the entry is left behind and stepped over the
 * next time back lands on it.
 */

const MARKER = '__absOverlay';
let nextId = 0;
/** Overlay entries still in the browser history, oldest first. */
const liveMarkers = [];
/** Overlays that closed while an overlay above them was still open; popped together later. */
const closedMarkers = new Set();
/** Entries we asked the browser to pop whose popstate has not arrived yet. */
const poppingMarkers = new Set();
const overlays = new Map();
let pendingPops = 0;
let ignorePops = 0;
let listening = false;

const currentMarker = () => window.history.state?.[MARKER] ?? null;

function flushPops() {
  if (pendingPops === 0) return;
  const count = pendingPops;
  pendingPops = 0;
  ignorePops += 1;
  window.history.go(-count);
}

function pushMarker(id) {
  window.history.pushState({ ...(window.history.state || {}), [MARKER]: id }, '');
  liveMarkers.push(id);
}

/** Step back over an entry that no longer belongs to an open overlay. */
function stepOver() {
  ignorePops += 1;
  window.history.back();
}

function handlePopState(event) {
  if (ignorePops > 0) {
    ignorePops -= 1;
    poppingMarkers.clear();
    return;
  }
  const landed = event.state?.[MARKER] ?? null;
  const landedIndex = landed ? liveMarkers.indexOf(landed) : -1;

  if (landed && landedIndex === -1) {
    // Left behind by an overlay that closed during navigation.
    stepOver();
    return;
  }

  // Close every overlay whose entry is now above where we landed (newest first).
  const above = liveMarkers.splice(landedIndex + 1);
  above.reverse().forEach((id) => {
    closedMarkers.delete(id);
    overlays.get(id)?.closeFromBack();
  });

  if (landed && closedMarkers.has(landed)) {
    // Landed on an overlay that was already closed underneath: keep going back.
    liveMarkers.splice(landedIndex, 1);
    closedMarkers.delete(landed);
    stepOver();
  }
}

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', handlePopState);
}

function releaseMarker(id) {
  if (!liveMarkers.includes(id)) return; // Back already removed it.

  const marker = currentMarker();
  const onOurEntries = marker !== null && (liveMarkers.includes(marker) || poppingMarkers.has(marker));
  if (!onOurEntries) {
    // The app navigated (or replaced the entry) while this was open: leave the entry behind.
    liveMarkers.splice(liveMarkers.indexOf(id), 1);
    closedMarkers.delete(id);
    return;
  }

  closedMarkers.add(id);
  let count = 0;
  while (liveMarkers.length > 0 && closedMarkers.has(liveMarkers[liveMarkers.length - 1])) {
    const top = liveMarkers.pop();
    closedMarkers.delete(top);
    poppingMarkers.add(top);
    count += 1;
  }
  if (count > 0) {
    pendingPops += count;
    queueMicrotask(flushPops);
  }
}

/**
 * @param {boolean} open
 * @param {(open: boolean) => void} setOpen - Called with false when back is pressed
 * @param {object} [options]
 * @param {boolean} [options.disabled] - The overlay manages history itself (URL-driven dialogs)
 */
export function useBackToClose(open, setOpen, { disabled = false } = {}) {
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!open || disabled || typeof window === 'undefined' || !matchesAppShell()) return undefined;

    const id = `overlay-${(nextId += 1)}`;
    overlays.set(id, {
      closeFromBack() {
        setOpenRef.current?.(false);
        // Still open (e.g. an unsaved-changes prompt kept it): give it its back entry again.
        window.setTimeout(() => {
          if (openRef.current && overlays.has(id) && !liveMarkers.includes(id)) pushMarker(id);
        }, 0);
      },
    });
    ensureListener();
    pushMarker(id);

    return () => {
      overlays.delete(id);
      releaseMarker(id);
    };
  }, [open, disabled]);
}

export default useBackToClose;

/**
 * Open state for a Radix Dialog/Sheet/AlertDialog root that works controlled or uncontrolled and
 * closes on back in the app shell.
 * @param {object} props
 * @param {boolean} [props.open]
 * @param {boolean} [props.defaultOpen]
 * @param {(open: boolean) => void} [props.onOpenChange]
 * @param {boolean} [props.disableBackClose]
 * @returns {[boolean, (open: boolean) => void]}
 */
export function useBackClosableOpen({ open, defaultOpen = false, onOpenChange, disableBackClose = false }) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? Boolean(open) : uncontrolledOpen;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const setOpen = useCallback(
    (next) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChangeRef.current?.(next);
    },
    [isControlled]
  );

  useBackToClose(isOpen, setOpen, { disabled: disableBackClose });
  return [isOpen, setOpen];
}
