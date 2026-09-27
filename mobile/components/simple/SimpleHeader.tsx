import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { FontFamily } from '@/constants/typography';

type SimpleHeaderProps = {
  /** Right-side content, e.g. the Sell/Stock switcher. */
  children?: React.ReactNode;
};

/**
 * Header for the picture Sell flow. Simple Mode now lives inside the normal app, so this is a
 * plain way back to Home (the app-wide PIN gate protects the session).
 */
export function SimpleHeader({ children }: SimpleHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        accessibilityRole="button"
        accessibilityLabel="Back to Home"
        hitSlop={10}
      >
        <ChevronLeft size={26} color="#0f172a" />
        <Text style={styles.backText}>Home</Text>
      </Pressable>
      <View style={styles.right}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 12,
    borderRadius: 12,
  },
  backPressed: { opacity: 0.6 },
  backText: { fontSize: 17, fontFamily: FontFamily.semiBold, color: '#0f172a' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
