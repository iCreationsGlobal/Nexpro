import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PinPad } from '@/components/simple/PinPad';
import { devicePinService } from '@/services/devicePin';
import { FontFamily } from '@/constants/typography';

type SetPinScreenProps = {
  userId: string;
  onDone: () => void;
};

/**
 * First-time PIN setup for Simple Mode — enter, then confirm. Runs once per device/user;
 * after this, PinLockScreen handles daily unlock.
 */
export function SetPinScreen({ userId, onDone }: SetPinScreenProps) {
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [mismatch, setMismatch] = useState(false);

  const handleComplete = useCallback(
    async (pin: string) => {
      if (!firstPin) {
        setFirstPin(pin);
        setMismatch(false);
        setResetSignal((n) => n + 1);
        return;
      }
      if (pin !== firstPin) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setMismatch(true);
        setFirstPin(null);
        setResetSignal((n) => n + 1);
        return;
      }
      await devicePinService.setPin(userId, pin);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDone();
    },
    [firstPin, userId, onDone]
  );

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{firstPin ? 'Confirm your PIN' : 'Create a 4-digit PIN'}</Text>
      <Text style={styles.subtitle}>
        {firstPin ? 'Enter the same 4 digits again' : "You'll use this to unlock Simple Mode each day"}
      </Text>
      {mismatch && <Text style={styles.error}>PINs did not match — try again</Text>}
      <PinPad onComplete={handleComplete} resetSignal={resetSignal} dotColor="#166534" keyColor="#166534" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  title: {
    fontSize: 22,
    fontFamily: FontFamily.semiBold,
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  error: {
    color: '#dc2626',
    fontSize: 15,
    fontFamily: FontFamily.medium,
    marginBottom: 12,
  },
});
