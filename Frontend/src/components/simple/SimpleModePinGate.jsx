import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { devicePinService } from '../../services/devicePin';
import PinLockScreen from './PinLockScreen';
import SetPinScreen from './SetPinScreen';

/** How long the app may sit idle before asking for the PIN again. */
const IDLE_LOCK_MS = 15 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 30 * 1000;
const UNLOCKED_UNTIL_KEY = 'simple_mode_unlocked_until';
export const SIMPLE_MODE_LOCK_EVENT = 'abs:simple-mode-lock';

/** Lock the app now (header Lock button, Settings). */
export function lockSimpleMode() {
  window.dispatchEvent(new CustomEvent(SIMPLE_MODE_LOCK_EVENT));
}

const readUnlockedUntil = () => {
  try {
    return Number(window.sessionStorage.getItem(UNLOCKED_UNTIL_KEY) || 0);
  } catch {
    return 0;
  }
};

const writeUnlockedUntil = (value) => {
  try {
    if (value) window.sessionStorage.setItem(UNLOCKED_UNTIL_KEY, String(value));
    else window.sessionStorage.removeItem(UNLOCKED_UNTIL_KEY);
  } catch {
    // Storage unavailable: the unlock just won't survive a reload.
  }
};

/**
 * Simple Mode's daily unlock. The member signs in with email + password once per device and
 * sets a 4-digit PIN; after that, opening ABS (new tab or app launch) or 15 minutes idle asks
 * for the PIN instead of a password. The unlock lives in sessionStorage, so it ends with the tab.
 */
export default function SimpleModePinGate({ children }) {
  const { user, logout } = useAuth();
  const userId = user?.id;
  const [hasPin, setHasPin] = useState(() => devicePinService.hasPin(userId));
  const [unlocked, setUnlocked] = useState(() => readUnlockedUntil() > Date.now());

  useEffect(() => {
    setHasPin(devicePinService.hasPin(userId));
  }, [userId]);

  const unlock = useCallback(() => {
    writeUnlockedUntil(Date.now() + IDLE_LOCK_MS);
    setHasPin(true);
    setUnlocked(true);
  }, []);

  const lock = useCallback(() => {
    writeUnlockedUntil(0);
    setUnlocked(false);
    // "Change PIN" clears the PIN before locking, which lands on first-time setup.
    setHasPin(devicePinService.hasPin(userId));
  }, [userId]);

  const handleForgot = useCallback(() => {
    writeUnlockedUntil(0);
    logout?.();
  }, [logout]);

  // Keep the session alive while the member is using it; relock after IDLE_LOCK_MS of quiet.
  useEffect(() => {
    if (!unlocked) return undefined;
    let lastBump = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastBump < ACTIVITY_THROTTLE_MS) return;
      lastBump = now;
      writeUnlockedUntil(now + IDLE_LOCK_MS);
    };
    const checkIdle = () => {
      if (readUnlockedUntil() <= Date.now()) lock();
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', checkIdle);
    const intervalId = window.setInterval(checkIdle, 30 * 1000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, onActivity));
      document.removeEventListener('visibilitychange', checkIdle);
      window.clearInterval(intervalId);
    };
  }, [unlocked, lock]);

  useEffect(() => {
    window.addEventListener(SIMPLE_MODE_LOCK_EVENT, lock);
    return () => window.removeEventListener(SIMPLE_MODE_LOCK_EVENT, lock);
  }, [lock]);

  if (!userId) return children;
  if (!hasPin) return <SetPinScreen userId={userId} onDone={unlock} />;
  if (!unlocked) return <PinLockScreen userId={userId} onUnlock={unlock} onForgot={handleForgot} />;
  return children;
}
