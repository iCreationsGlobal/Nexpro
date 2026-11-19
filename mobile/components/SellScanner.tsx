import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { ProductVariantPickerSheet } from '@/components/ProductVariantPickerSheet';
import type { SellScanSession } from '@/hooks/useSellScanSession';
import { useScreenColors } from '@/hooks/useScreenColors';
import { formatCartSummary } from '@/utils/sellScan';

/** The strip over the camera: a short problem message, the last item added, the cart so far, Continue. */
export function SellScanStrip({
  lastAdded,
  notice,
  summary,
  finishing,
  onContinue,
  tintColor,
  onTintColor = '#fff',
}: {
  lastAdded: string | null;
  notice: string | null;
  summary: { count: number; total: number };
  finishing: boolean;
  onContinue: () => void;
  tintColor: string;
  onTintColor?: string;
}) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {notice ? (
        <View style={styles.notice} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <AppIcon name="exclamation-triangle" size={18} color="#78350f" />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.added} numberOfLines={2}>
          {lastAdded || 'Scan an item to add it to the cart'}
        </Text>
        <Text style={styles.summary}>{formatCartSummary(summary)}</Text>
      </View>
      <Pressable
        onPress={onContinue}
        disabled={finishing}
        style={({ pressed }) => [styles.continue, { backgroundColor: tintColor }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Continue to the cart"
        accessibilityState={{ disabled: finishing, busy: finishing }}
      >
        {finishing ? <ActivityIndicator color={onTintColor} /> : null}
        <Text style={[styles.continueText, { color: onTintColor }]}>
          {finishing ? 'Adding…' : 'Continue'}
        </Text>
        {!finishing ? <AppIcon name="chevron-right" size={22} color={onTintColor} /> : null}
      </Pressable>
    </View>
  );
}

/**
 * Keep-scanning camera for selling. The size picker is rendered inside the camera's modal while
 * the camera is open (a sibling Modal would open behind it on iOS), and on the screen otherwise.
 */
export function SellScanner({
  session,
  onContinue,
  tintColor,
  onTintColor,
}: {
  session: SellScanSession;
  /** Where Continue goes once every scan so far is in the cart. */
  onContinue: (result: { cartHasItems: boolean }) => void;
  tintColor?: string;
  onTintColor?: string;
}) {
  const { colors, cardBg, borderColor, textColor, mutedColor, inputBg, onTint } = useScreenColors();
  const tint = tintColor ?? colors.tint;

  const picker = (
    <ProductVariantPickerSheet
      visible={!!session.pickerProduct}
      product={session.pickerProduct}
      onClose={session.cancelPicker}
      onSelect={session.chooseVariant}
      cardBg={cardBg}
      borderColor={borderColor}
      textColor={textColor}
      mutedColor={mutedColor}
      inputBg={inputBg}
      tintColor={tint}
    />
  );

  return (
    <>
      <BarcodeScanner
        visible={session.visible}
        continuous
        paused={session.paused}
        onClose={session.close}
        onScan={session.onScan}
        footer={
          <SellScanStrip
            lastAdded={session.lastAdded}
            notice={session.notice}
            summary={session.summary}
            finishing={session.finishing}
            onContinue={() => { void session.finish(onContinue); }}
            tintColor={tint}
            onTintColor={onTintColor ?? onTint}
          />
        }
      >
        {session.visible ? picker : null}
      </BarcodeScanner>
      {!session.visible ? picker : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeText: { flex: 1, color: '#78350f', fontSize: 16, fontWeight: '600' },
  card: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  added: { color: '#fff', fontSize: 17, fontWeight: '700' },
  summary: { color: '#e5e7eb', fontSize: 15, fontWeight: '600' },
  continue: {
    minHeight: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  continueText: { fontSize: 18, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
