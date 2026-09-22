import React, { useCallback, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { PinPad } from '@/components/simple/PinPad';
import { useAuth } from '@/context/AuthContext';
import { devicePinService } from '@/services/devicePin';
import { FontFamily } from '@/constants/typography';

type SimpleHeaderProps = {
  /** Right-side content, e.g. the Sell/Stock switcher. */
  children?: React.ReactNode;
};

/**
 * Long-press the logo to leave Simple Mode. Deliberately not a visible button — a cashier
 * brushing the screen shouldn't land in Settings/Reports. Requires the same PIN as the lock
 * screen, so it never leaks who is literate enough to want out.
 */
export function SimpleHeader({ children }: SimpleHeaderProps) {
  const { user } = useAuth();
  const [showEscape, setShowEscape] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState(false);

  const openEscape = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setError(false);
    setShowEscape(true);
  }, []);

  const handlePin = useCallback(
    async (pin: string) => {
      if (!user?.id) return;
      const ok = await devicePinService.verifyPin(user.id, pin);
      if (ok) {
        setShowEscape(false);
        router.replace('/(tabs)');
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(true);
      setResetSignal((n) => n + 1);
    },
    [user?.id]
  );

  return (
    <View style={styles.header}>
      <Pressable
        onLongPress={openEscape}
        delayLongPress={900}
        accessibilityRole="button"
        accessibilityLabel="ABS logo"
      >
        <Image
          source={require('@/assets/images/abs-boot-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Pressable>
      <View style={styles.right}>{children}</View>

      <Modal visible={showEscape} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Pressable
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => setShowEscape(false)}
            >
              <X size={24} color="#fff" />
            </Pressable>
            <Text style={styles.modalTitle}>Enter PIN for Full Mode</Text>
            {error && <Text style={styles.modalError}>Wrong PIN, try again</Text>}
            <PinPad onComplete={handlePin} resetSignal={resetSignal} />
          </View>
        </View>
      </Modal>
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
  logo: { width: 40, height: 40 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    alignItems: 'center',
    paddingTop: 24,
    width: '100%',
  },
  closeBtn: { position: 'absolute', top: -60, right: 24, padding: 12 },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontFamily: FontFamily.semiBold,
    marginBottom: 12,
  },
  modalError: {
    color: '#f87171',
    fontSize: 15,
    fontFamily: FontFamily.medium,
    marginBottom: 12,
  },
});
