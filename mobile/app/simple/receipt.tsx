import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CheckCircle2 } from 'lucide-react-native';
import { formatCurrency } from '@/utils/formatCurrency';
import { FontFamily } from '@/constants/typography';

/**
 * Nothing to read to know it worked: haptic + big checkmark + big total. Printing (Bluetooth,
 * paired-printer default) and WhatsApp/SMS share are deliberately out of v1 — see the Simple
 * Mode plan; wire up printing here once a device printer service exists.
 */
export default function SimpleReceipt() {
  const { total } = useLocalSearchParams<{ saleId?: string; total?: string }>();
  const amount = Number(total) || 0;

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  return (
    <View style={styles.screen}>
      <CheckCircle2 size={120} color="#166534" strokeWidth={1.5} />
      <Text style={styles.total}>{formatCurrency(amount)}</Text>
      <Pressable style={styles.newSaleBtn} onPress={() => router.replace('/simple')}>
        <Text style={styles.newSaleLabel}>New sale</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  total: {
    fontSize: 48,
    fontFamily: FontFamily.bold,
    color: '#000',
    marginTop: 24,
    marginBottom: 56,
  },
  newSaleBtn: {
    width: '80%',
    backgroundColor: '#166534',
    borderRadius: 24,
    paddingVertical: 22,
    alignItems: 'center',
  },
  newSaleLabel: { color: '#fff', fontSize: 22, fontFamily: FontFamily.bold },
});
