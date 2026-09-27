import React, { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';

/**
 * The picture-and-number Sell flow (Sell → Charge → Receipt, plus Stock). Opened from the Sell
 * button in Simple Mode; the app-wide SimpleModePinGate (app/_layout.tsx) handles the PIN.
 */
export default function SimpleLayout() {
  const { user, interfaceMode, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (interfaceMode !== 'simple') {
      router.replace('/(tabs)');
    }
  }, [loading, interfaceMode]);

  if (loading || interfaceMode !== 'simple' || !user?.id) {
    return <AppLoadingScreen />;
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
