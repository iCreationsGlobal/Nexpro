import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { PinLockScreen } from '@/components/simple/PinLockScreen';
import { SetPinScreen } from '@/components/simple/SetPinScreen';
import { devicePinService } from '@/services/devicePin';
import { logger } from '@/utils/logger';

/** Idle time before asking for the PIN again. */
const IDLE_LOCK_MS = 15 * 60 * 1000;
/** Time in the background (another app, screen off) before asking again. */
const BACKGROUND_LOCK_MS = 2 * 60 * 1000;
export const SIMPLE_MODE_LOCK_EVENT = 'abs:simple-mode-lock';

/** Lock the app now (Settings → Lock now). */
export function lockSimpleMode() {
  DeviceEventEmitter.emit(SIMPLE_MODE_LOCK_EVENT);
}

/**
 * Simple Mode's daily unlock for the whole app (mirrors Frontend SimpleModePinGate): one email +
 * password sign-in per device, then a 4-digit PIN when the app opens, after 15 minutes idle or
 * after a couple of minutes in the background.
 */
export function SimpleModePinGate({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const userId = user?.id ? String(user.id) : '';
  const [pinChecked, setPinChecked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const lastActiveRef = useRef(Date.now());
  const backgroundedAtRef = useRef<number | null>(null);

  const refreshHasPin = useCallback(async () => {
    if (!userId) return;
    logger.debug('SimpleModePinGate', 'Checking saved PIN');
    const savedPin = await devicePinService.hasPin(userId);
    logger.debug('SimpleModePinGate', savedPin ? 'Showing PIN unlock' : 'Showing PIN setup');
    setHasPin(savedPin);
    setPinChecked(true);
  }, [userId]);

  useEffect(() => {
    setPinChecked(false);
    setUnlocked(false);
    void refreshHasPin();
  }, [refreshHasPin]);

  const lock = useCallback(() => {
    setUnlocked(false);
    // "Change PIN" clears the PIN before locking, which lands on first-time setup.
    void refreshHasPin();
  }, [refreshHasPin]);

  const unlock = useCallback(() => {
    lastActiveRef.current = Date.now();
    setHasPin(true);
    setUnlocked(true);
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SIMPLE_MODE_LOCK_EVENT, lock);
    return () => sub.remove();
  }, [lock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const away = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0;
        backgroundedAtRef.current = null;
        if (away >= BACKGROUND_LOCK_MS || Date.now() - lastActiveRef.current >= IDLE_LOCK_MS) lock();
      } else if (backgroundedAtRef.current === null) {
        backgroundedAtRef.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [lock]);

  useEffect(() => {
    if (!unlocked) return undefined;
    const id = setInterval(() => {
      if (Date.now() - lastActiveRef.current >= IDLE_LOCK_MS) lock();
    }, 30 * 1000);
    return () => clearInterval(id);
  }, [unlocked, lock]);

  if (!userId) return <>{children}</>;
  if (!pinChecked) return <AppLoadingScreen />;
  if (!hasPin) return <SetPinScreen userId={userId} onDone={unlock} />;
  if (!unlocked) {
    return <PinLockScreen userId={userId} onUnlock={unlock} onForgot={() => { void logout(); }} />;
  }

  return (
    <View
      style={{ flex: 1 }}
      // Any touch counts as activity for the idle lock.
      onStartShouldSetResponderCapture={() => {
        lastActiveRef.current = Date.now();
        return false;
      }}
    >
      {children}
    </View>
  );
}
