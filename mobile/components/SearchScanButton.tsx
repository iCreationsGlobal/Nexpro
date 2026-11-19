import React, { useState } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { useScanningEnabled } from '@/hooks/useScanningEnabled';
import { searchTextFromScan } from '@/utils/sellScan';

/**
 * Camera icon for inside a product search box: opens the camera for ONE scan, puts the code in
 * the box (for one of our QR labels, its barcode) and closes. Not shown when the business has
 * switched barcode & camera scanning off (as on the web).
 */
export function SearchScanButton({
  onCode,
  color,
  size = 20,
  style,
}: {
  onCode: (text: string) => void;
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const { scanningEnabled } = useScanningEnabled();
  if (!scanningEnabled) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Scan a barcode to search"
      >
        <AppIcon name="camera" size={size} color={color} />
      </Pressable>
      <BarcodeScanner
        visible={open}
        onClose={() => setOpen(false)}
        onScan={(code) => onCode(searchTextFromScan(code))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
