import React, { useCallback, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PinPad } from '@/components/simple/PinPad';
import { devicePinService, MAX_PIN_ATTEMPTS } from '@/services/devicePin';
import { FontFamily } from '@/constants/typography';

type PinLockScreenProps = {
  userId: string;
  onUnlock: () => void;
  /** Wrong PIN too many times, or "Forgot PIN?" — sign in with the password again. */
  onForgot?: (info: { reason: 'forgot' | 'too_many_attempts' }) => void;
  /** Shown above the pad — defaults to the daily unlock prompt. */
  title?: string;
};

/** Full-screen PIN gate. No typing beyond the 4-digit pad — this is the daily unlock, not a login. */
export function PinLockScreen({ userId, onUnlock, onForgot, title = 'Enter your PIN' }: PinLockScreenProps) {
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_PIN_ATTEMPTS);
  const shake = React.useRef(new Animated.Value(0)).current;

  const handleComplete = useCallback(
    async (pin: string) => {
      const ok = await devicePinService.verifyPin(userId, pin);
      if (ok) {
        await devicePinService.resetFailedAttempts(userId);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onUnlock();
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      const failed = await devicePinService.recordFailedAttempt(userId);
      if (failed >= MAX_PIN_ATTEMPTS && onForgot) {
        await devicePinService.clearPin(userId);
        onForgot({ reason: 'too_many_attempts' });
        return;
      }
      setAttemptsLeft(MAX_PIN_ATTEMPTS - failed);
      setError(true);
      Animated.sequence([
        Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      setResetSignal((n) => n + 1);
    },
    [userId, onUnlock, onForgot, shake]
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
        {error && (
          <Text style={styles.error}>
            Wrong PIN. {attemptsLeft} {attemptsLeft === 1 ? 'try' : 'tries'} left.
          </Text>
        )}
        <PinPad onComplete={handleComplete} resetSignal={resetSignal} />
      </Animated.View>
      {onForgot ? (
        <Pressable
          onPress={() => onForgot({ reason: 'forgot' })}
          style={styles.forgot}
          accessibilityRole="button"
          hitSlop={12}
        >
          <Text style={styles.forgotText}>Forgot PIN? Sign in with your password</Text>
        </Pressable>
      ) : null}
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
  forgot: { marginTop: 28, paddingVertical: 8 },
  forgotText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontFamily: FontFamily.medium,
    textDecorationLine: 'underline',
  },
  error: {
    color: '#f87171',
    fontSize: 15,
    fontFamily: FontFamily.medium,
    marginBottom: 12,
  },
});
