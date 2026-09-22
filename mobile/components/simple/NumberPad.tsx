import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Delete, X } from 'lucide-react-native';
import { FontFamily } from '@/constants/typography';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

type NumberPadModalProps = {
  visible: boolean;
  title: string;
  onConfirm: (value: number) => void;
  onCancel: () => void;
};

/** Free-length numeric entry (restock quantities, quick-sale amounts) — modal with a confirm button. */
export function NumberPadModal({ visible, title, onConfirm, onCancel }: NumberPadModalProps) {
  const [digits, setDigits] = useState('');

  const press = useCallback((key: string) => {
    if (key === '') return;
    void Haptics.selectionAsync().catch(() => {});
    if (key === 'del') {
      setDigits((prev) => prev.slice(0, -1));
      return;
    }
    setDigits((prev) => (prev.length >= 6 ? prev : prev + key));
  }, []);

  const handleConfirm = useCallback(() => {
    const value = Number(digits);
    if (!digits || !Number.isFinite(value) || value <= 0) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onConfirm(value);
    setDigits('');
  }, [digits, onConfirm]);

  const handleCancel = useCallback(() => {
    setDigits('');
    onCancel();
  }, [onCancel]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable style={styles.closeBtn} accessibilityLabel="Cancel" onPress={handleCancel}>
            <X size={24} color="#6b7280" />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.display}>{digits || '0'}</Text>
          <View style={styles.grid}>
            {KEYS.map((key, i) => (
              <Pressable
                key={i}
                disabled={key === ''}
                onPress={() => press(key)}
                style={({ pressed }) => [styles.key, pressed && key !== '' && styles.keyPressed]}
              >
                {key === 'del' ? (
                  <Delete size={26} color="#166534" />
                ) : (
                  <Text style={styles.keyText}>{key}</Text>
                )}
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[styles.confirmBtn, !digits && styles.confirmBtnDisabled]}
            disabled={!digits}
            onPress={handleConfirm}
          >
            <Text style={styles.confirmLabel}>Add</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 32,
    alignItems: 'center',
  },
  closeBtn: { position: 'absolute', top: 16, right: 16, padding: 8 },
  title: { fontSize: 17, fontFamily: FontFamily.semiBold, color: '#000', marginBottom: 8 },
  display: { fontSize: 44, fontFamily: FontFamily.bold, color: '#166534', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 280, justifyContent: 'center' },
  key: {
    width: 80,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: '#f3f4f6', borderRadius: 12 },
  keyText: { fontSize: 28, fontFamily: FontFamily.semiBold, color: '#000' },
  confirmBtn: {
    marginTop: 16,
    width: '80%',
    backgroundColor: '#166534',
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmLabel: { color: '#fff', fontSize: 20, fontFamily: FontFamily.bold },
});
