import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Banknote, CreditCard, Smartphone } from 'lucide-react-native';
import { useCart } from '@/context/CartContext';
import { saleService } from '@/services/saleService';
import { getApiErrorMessage } from '@/utils/parseApiListResponse';
import { formatCurrency } from '@/utils/formatCurrency';
import { FontFamily } from '@/constants/typography';

const generateSaleClientId = () =>
  `mobile-sale-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

type PaymentMethod = 'cash' | 'mobile_money' | 'card';

const METHODS: { id: PaymentMethod; label: string; Icon: typeof Banknote }[] = [
  { id: 'cash', label: 'Cash', Icon: Banknote },
  { id: 'mobile_money', label: 'Mobile Money', Icon: Smartphone },
  { id: 'card', label: 'Card', Icon: CreditCard },
];

/**
 * Charge screen — payment as icon buttons, one giant CHARGE button. No change calculation or
 * momo-number entry in v1: amountPaid is assumed to equal the total (the common case for these
 * shops); typed exceptions stay in Full Mode's cart screen.
 */
export default function SimpleCharge() {
  const { items, getTotal, getSubtotal, clearCart } = useCart();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const total = getTotal();

  const createSaleMutation = useMutation({
    mutationFn: () => {
      const saleItems = items.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId || null,
        name: item.name,
        sku: item.sku,
        productCode: item.productCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.unitPrice * item.quantity - (item.discount || 0),
        discount: item.discount || 0,
      }));
      return saleService.createSale({
        clientId: generateSaleClientId(),
        items: saleItems,
        total,
        subtotal: getSubtotal(),
        discount: getSubtotal() - total,
        paymentMethod: method,
        amountPaid: total,
        status: 'completed',
      });
    },
    onSuccess: (sale: { id?: string; data?: { id?: string } }) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const saleId = sale?.id ?? sale?.data?.id ?? '';
      clearCart();
      router.replace({ pathname: '/simple/receipt', params: { saleId, total: String(total) } });
    },
    onError: (error) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Sale failed', getApiErrorMessage(error, 'Please try again'));
    },
  });

  const handleCharge = useCallback(() => {
    if (items.length === 0) return;
    createSaleMutation.mutate();
  }, [items.length, createSaleMutation]);

  return (
    <View style={styles.screen}>
      <Pressable style={styles.back} accessibilityLabel="Back" onPress={() => router.back()}>
        <Text style={styles.backText}>{'‹'}</Text>
      </Pressable>

      <Text style={styles.total}>{formatCurrency(total)}</Text>

      <View style={styles.methods}>
        {METHODS.map(({ id, label, Icon }) => (
          <Pressable
            key={id}
            onPress={() => setMethod(id)}
            style={[styles.methodBtn, method === id && styles.methodBtnActive]}
          >
            <Icon size={32} color={method === id ? '#fff' : '#166534'} />
            <Text style={[styles.methodLabel, method === id && styles.methodLabelActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.chargeBtn, createSaleMutation.isPending && styles.chargeBtnDisabled]}
        disabled={createSaleMutation.isPending}
        onPress={handleCharge}
      >
        <Text style={styles.chargeBtnLabel}>
          {createSaleMutation.isPending ? 'Charging…' : `CHARGE ${formatCurrency(total)}`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', alignItems: 'center', paddingTop: 24 },
  back: { position: 'absolute', top: 16, left: 16, padding: 12, zIndex: 1 },
  backText: { fontSize: 32, color: '#166534', fontFamily: FontFamily.bold },
  total: {
    fontSize: 56,
    fontFamily: FontFamily.bold,
    color: '#000',
    marginTop: 48,
    marginBottom: 40,
  },
  methods: { flexDirection: 'row', gap: 16, marginBottom: 48 },
  methodBtn: {
    width: 96,
    height: 96,
    borderRadius: 20,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  methodBtnActive: { backgroundColor: '#166534' },
  methodLabel: { fontSize: 12, fontFamily: FontFamily.medium, color: '#166534', textAlign: 'center' },
  methodLabelActive: { color: '#fff' },
  chargeBtn: {
    width: '88%',
    backgroundColor: '#166534',
    borderRadius: 24,
    paddingVertical: 24,
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 32,
  },
  chargeBtnDisabled: { opacity: 0.6 },
  chargeBtnLabel: { color: '#fff', fontSize: 24, fontFamily: FontFamily.bold },
});
