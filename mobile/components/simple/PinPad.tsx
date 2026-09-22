import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Delete } from 'lucide-react-native';
import { FontFamily } from '@/constants/typography';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

type PinPadProps = {
  /** Called with the completed 4-digit PIN each time the user fills all digits. */
  onComplete: (pin: string) => void;
  /** External signal to clear the dots (e.g. after a wrong-PIN shake). */
  resetSignal?: number;
  dotColor?: string;
  keyColor?: string;
};

/** Big-target numeric keypad for PIN entry — no typing, just taps. */
export function PinPad({ onComplete, resetSignal, dotColor = '#fff', keyColor = '#fff' }: PinPadProps) {
  const [digits, setDigits] = useState('');

  React.useEffect(() => {
    setDigits('');
  }, [resetSignal]);

  const press = useCallback(
    (key: string) => {
      if (key === '' ) return;
      void Haptics.selectionAsync().catch(() => {});
      if (key === 'del') {
        setDigits((prev) => prev.slice(0, -1));
        return;
      }
      setDigits((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + key;
        if (next.length === PIN_LENGTH) {
          setTimeout(() => onComplete(next), 80);
        }
        return next;
      });
    },
    [onComplete]
  );

  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: dotColor },
              i < digits.length && { backgroundColor: dotColor },
            ]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key, i) => (
          <Pressable
            key={i}
            disabled={key === ''}
            accessibilityRole="button"
            accessibilityLabel={key === 'del' ? 'Delete' : key === '' ? undefined : `Digit ${key}`}
            onPress={() => press(key)}
            style={({ pressed }) => [
              styles.key,
              pressed && key !== '' && styles.keyPressed,
            ]}
          >
            {key === 'del' ? (
              <Delete size={28} color={keyColor} />
            ) : (
              <Text style={[styles.keyText, { color: keyColor }]}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', width: '100%' },
  dots: { flexDirection: 'row', gap: 20, marginBottom: 40 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 300,
    justifyContent: 'center',
  },
  key: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 6,
  },
  keyPressed: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  keyText: {
    fontSize: 32,
    fontFamily: FontFamily.semiBold,
  },
});
