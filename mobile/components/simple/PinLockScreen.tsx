import React, { useCallback, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PinPad } from '@/components/simple/PinPad';
import { devicePinService } from '@/services/devicePin';
import { FontFamily } from '@/constants/typography';

type PinLockScreenProps = {
  userId: string;
  onUnlock: () => void;
  /** Shown above the pad — defaults to the daily unlock prompt. */
  title?: string;
};

/** Full-screen PIN gate. No typing beyond the 4-digit pad — this is the daily unlock, not a login. */
export function PinLockScreen({ userId, onUnlock, title = 'Enter your PIN' }: PinLockScreenProps) {
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState(false);
  const shake = React.useRef(new Animated.Value(0)).current;

  const handleComplete = useCallback(
    async (pin: string) => {
      const ok = await devicePinService.verifyPin(userId, pin);
      if (ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onUnlock();
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(true);
      Animated.sequence([
        Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      setResetSignal((n) => n + 1);
    },
    [userId, onUnlock, shake]
  );

  return (
    <View style={styles.screen}>
      <Image
        source={require('@/assets/images/abs-boot-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Animated.View style={{ transform: [{ translateX: shake }], alignItems: 'center' }}>
        <Text style={styles.title}>{title}</Text>
        {error && <Text style={styles.error}>Wrong PIN, try again</Text>}
        <PinPad onComplete={handleComplete} resetSignal={resetSignal} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  logo: { width: 84, height: 84, marginBottom: 32 },
  title: {
    color: '#fff',
    fontSize: 22,
    fontFamily: FontFamily.semiBold,
    marginBottom: 12,
  },
  error: {
    color: '#f87171',
    fontSize: 15,
    fontFamily: FontFamily.medium,
    marginBottom: 12,
  },
});
