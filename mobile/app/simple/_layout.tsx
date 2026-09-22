import React, { useEffect, useState } from 'react';
import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { PinLockScreen } from '@/components/simple/PinLockScreen';
import { SetPinScreen } from '@/components/simple/SetPinScreen';
import { devicePinService } from '@/services/devicePin';

/**
 * Gate for the whole /simple route group. Renders the lock (or first-run PIN setup) in place
 * of the child routes rather than as a separate route, so there's nothing to navigate past.
 */
export default function SimpleLayout() {
  const { user, interfaceMode, loading } = useAuth();
  const [pinChecked, setPinChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (interfaceMode !== 'simple') {
      router.replace('/(tabs)');
    }
  }, [loading, interfaceMode]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const hasPin = await devicePinService.hasPin(user.id);
      if (cancelled) return;
      setNeedsSetup(!hasPin);
      setPinChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading || interfaceMode !== 'simple' || !user?.id || !pinChecked) {
    return <AppLoadingScreen />;
  }

  if (needsSetup) {
    return <SetPinScreen userId={user.id} onDone={() => { setNeedsSetup(false); setUnlocked(true); }} />;
  }

  if (!unlocked) {
    return <PinLockScreen userId={user.id} onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="stock" />
        <Stack.Screen name="charge" />
        <Stack.Screen name="receipt" />
      </Stack>
    </View>
  );
}
