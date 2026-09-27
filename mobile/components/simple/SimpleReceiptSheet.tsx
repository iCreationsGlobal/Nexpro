import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AppBottomSheet, APP_SHEET_HEIGHT_TALL } from '@/components/AppBottomSheet';
import { SimpleBigButton } from '@/components/simple/SimpleUI';
import { useAuth } from '@/context/AuthContext';
import { useShopOptional } from '@/context/ShopContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { saleService } from '@/services/saleService';
import { printReceipt, shareReceiptPdf } from '@/services/pdfDocumentService';
import { formatCurrency } from '@/utils/formatCurrency';
import { FontFamily } from '@/constants/typography';

type AnySale = Record<string, any>;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  mobile_money: 'Mobile Money',
  momo: 'Mobile Money',
  bank_transfer: 'Bank transfer',
  credit: 'Credit',
  other: 'Other',
};

/**
 * Simple Mode: tapping a sale opens just its receipt with a big Print button (native print
 * dialog, so a receipt printer set up on the phone works) and Share.
 */
export function SimpleReceiptSheet({ sale, onClose }: { sale: AnySale | null; onClose: () => void }) {
  const { activeTenant } = useAuth();
  const shop = useShopOptional();
  const { textColor, mutedColor, borderColor, cardBg } = useScreenColors();
  const [busy, setBusy] = useState<'print' | 'share' | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['simple', 'receipt', sale?.id],
    queryFn: () => saleService.getReceipt(String(sale?.id)),
    enabled: !!sale?.id,
  });
  const full: AnySale = (data as AnySale)?.data ?? data ?? sale ?? {};
  const printable = {
    ...full,
    shop: full.shop ?? shop?.activeShop ?? undefined,
    tenantName: activeTenant?.name,
  };
  const items: AnySale[] = Array.isArray(full.items) ? full.items : [];

  const run = async (kind: 'print' | 'share') => {
    setBusy(kind);
    try {
      if (kind === 'print') await printReceipt(printable);
      else await shareReceiptPdf(printable);
    } catch (err) {
      Alert.alert('Receipt', err instanceof Error ? err.message : 'Could not prepare this receipt.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppBottomSheet
      visible={!!sale}
      title={`Receipt${full.saleNumber ? ` ${full.saleNumber}` : ''}`}
      onClose={onClose}
      height={APP_SHEET_HEIGHT_TALL}
    >
      {isLoading ? <ActivityIndicator style={{ marginVertical: 32 }} /> : (
        <View style={[styles.paper, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.business, { color: textColor }]}>
            {full.shop?.name || shop?.activeShop?.name || activeTenant?.name || 'Receipt'}
          </Text>
          <Text style={[styles.meta, { color: mutedColor }]}>
            {full.createdAt ? new Date(full.createdAt).toLocaleString() : ''}
          </Text>
          <View style={[styles.divider, { borderColor }]} />
          {items.map((item, index) => (
            <View key={item.id || index} style={styles.item}>
              <Text style={[styles.itemName, { color: textColor }]}>{item.name || item.product?.name || 'Item'}</Text>
              <View style={styles.itemLine}>
                <Text style={[styles.meta, { color: mutedColor }]}>
                  {Number(item.quantity || 0)} × {formatCurrency(item.unitPrice)}
                </Text>
                <Text style={[styles.itemTotal, { color: textColor }]}>{formatCurrency(item.total ?? item.subtotal)}</Text>
              </View>
            </View>
          ))}
          <View style={[styles.divider, { borderColor }]} />
          <View style={styles.itemLine}>
            <Text style={[styles.totalLabel, { color: textColor }]}>Total</Text>
            <Text style={[styles.totalValue, { color: textColor }]}>{formatCurrency(full.total)}</Text>
          </View>
          {full.paymentMethod ? (
            <Text style={[styles.meta, { color: mutedColor, marginTop: 6 }]}>
              Paid by {PAYMENT_METHOD_LABELS[full.paymentMethod] || full.paymentMethod}
            </Text>
          ) : null}
        </View>
      )}
      <View style={{ gap: 12, marginTop: 16 }}>
        <SimpleBigButton label="Print" icon="printer" onPress={() => run('print')} loading={busy === 'print'} disabled={isLoading || !!busy} />
        <SimpleBigButton label="Share receipt (PDF)" icon="share" variant="outline" onPress={() => run('share')} loading={busy === 'share'} disabled={isLoading || !!busy} />
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  paper: { borderWidth: 1, borderRadius: 16, padding: 18 },
  business: { fontSize: 20, fontFamily: FontFamily.bold, textAlign: 'center' },
  meta: { fontSize: 14, fontFamily: FontFamily.regular, textAlign: 'center' },
  divider: { borderTopWidth: 1, borderStyle: 'dashed', marginVertical: 12 },
  item: { marginBottom: 10 },
  itemName: { fontSize: 16, fontFamily: FontFamily.semiBold },
  itemLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  itemTotal: { fontSize: 16, fontFamily: FontFamily.semiBold },
  totalLabel: { fontSize: 20, fontFamily: FontFamily.bold },
  totalValue: { fontSize: 22, fontFamily: FontFamily.bold },
});
