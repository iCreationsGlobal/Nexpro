import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import Colors from '@/constants/Colors';
import { createScanSessionGate } from '@/utils/scanSessionGate';
import { useColorScheme } from '@/components/useColorScheme';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
interface BarcodeScannerProps {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

const SCAN_BEEP_SOURCE = require('@/assets/sounds/scan-beep.wav');

export function BarcodeScanner({ visible, onClose, onScan }: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const scanGate = useRef(createScanSessionGate()).current;
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const beepPlayer = useAudioPlayer(SCAN_BEEP_SOURCE, { keepAudioSessionActive: true });

  useEffect(() => {
    if (visible) {
      scanGate.open();
      setScanned(false);
    } else {
      scanGate.close();
    }
    return () => scanGate.close();
  }, [visible, scanGate]);

  const closeScanner = () => {
    scanGate.close();
    onClose();
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (!visible || !scanGate.accept(data)) return;
    setScanned(true);
    // Haptic feedback on successful scan
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    beepPlayer
      .seekTo(0)
      .then(() => beepPlayer.play())
      .catch(() => {
        beepPlayer.play();
      });
    try { onScan(data); } finally { closeScanner(); }
  };

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeScanner}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={[styles.text, { color: colors.text }]}>Requesting camera permission...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeScanner}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.centerContent}>
            <AppIcon name="camera" size={64} color={colors.tint} style={styles.icon} />
            <Text style={[styles.title, { color: colors.text }]}>Camera Permission Required</Text>
            <Text style={[styles.text, { color: colors.text }]}>
              We need access to your camera to scan barcodes.
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: colors.tint }]}
              onPress={requestPermission}
            >
              <Text style={styles.buttonText}>Grant Permission</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.secondaryButton, { borderColor: colors.tint }]}
              onPress={closeScanner}
            >
              <Text style={[styles.buttonText, { color: colors.tint }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={closeScanner}
    >
      <View style={styles.container}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'code128',
              'code39',
              'code93',
              'codabar',
              'itf14',
              'qr',
            ],
          }}
        />
        <Pressable onPress={closeScanner} style={styles.closeButton} hitSlop={12}>
          <AppIcon name="times" size={26} color="#fff" />
        </Pressable>
        <View style={styles.footer} pointerEvents="none">
          <Text style={styles.instructionText}>Point camera at barcode</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 50,
    alignItems: 'center',
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  text: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  button: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
