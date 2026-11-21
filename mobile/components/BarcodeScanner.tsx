import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, AppState } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import Colors from '@/constants/Colors';
import { createScanSessionGate } from '@/utils/scanSessionGate';
import { useColorScheme } from '@/components/useColorScheme';
import { cameraBlockedMessage, getCameraAccess, openAppSettings } from '@/utils/cameraPermission';

import { AppIcon } from '@/components/AppIcon';
interface BarcodeScannerProps {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  /**
   * Keep the camera open after each scan (selling). The same code counts again only once it
   * has been out of view for 1.5 s; a different code counts at once. Default: one scan, then close.
   */
  continuous?: boolean;
  /** Keep-scanning mode: the camera stays on but codes are not counted (e.g. a size is being chosen). */
  paused?: boolean;
  /** Keep-scanning mode: shown at the bottom of the camera screen (strip and buttons). */
  footer?: React.ReactNode;
  /** Rendered inside the camera's own modal, so a sheet opened here shows above the camera. */
  children?: React.ReactNode;
}

const SCAN_BEEP_SOURCE = require('@/assets/sounds/scan-beep.wav');

export function BarcodeScanner({
  visible,
  onClose,
  onScan,
  continuous = false,
  paused = false,
  footer,
  children,
}: BarcodeScannerProps) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const access = getCameraAccess(permission);
  const [scanned, setScanned] = useState(false);
  const scanGate = useMemo(() => createScanSessionGate({ continuous }), [continuous]);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const beepPlayer = useAudioPlayer(SCAN_BEEP_SOURCE, { keepAudioSessionActive: true });

  useEffect(() => {
    if (visible) {
      scanGate.open();
      setScanned(false);
      // The answer may have changed in Settings since this screen mounted.
      void getPermission();
    } else {
      scanGate.close();
    }
    return () => scanGate.close();
  }, [visible, scanGate, getPermission]);

  const closeScanner = () => {
    scanGate.close();
    onClose();
  };

  // Back from Settings: check again, so the scanner opens if the camera was turned on.
  useEffect(() => {
    if (!visible || access !== 'blocked') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void getPermission();
    });
    return () => subscription.remove();
  }, [visible, access, getPermission]);

  /** The only way this screen asks: straight into the system prompt. A "no" closes the scanner. */
  const handleContinue = async () => {
    const result = await requestPermission();
    if (!result.granted) closeScanner();
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (!visible) return;
    if (continuous && paused) {
      scanGate.observe(data);
      return;
    }
    if (!scanGate.accept(data)) return;
    if (!continuous) setScanned(true);
    // Haptic feedback on successful scan
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    beepPlayer
      .seekTo(0)
      .then(() => beepPlayer.play())
      .catch(() => {
        beepPlayer.play();
      });
    if (continuous) {
      onScan(data);
      return;
    }
    try { onScan(data); } finally { closeScanner(); }
  };

  if (!visible) return null;

  if (access === 'checking') {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeScanner}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        </View>
      </Modal>
    );
  }

  // Before the system prompt: one explanation and one button (App Review 5.1.1(iv): no Cancel here).
  if (access === 'ask') {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeScanner}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.centerContent}>
            <AppIcon name="camera" size={64} color={colors.tint} style={styles.icon} />
            <Text style={[styles.title, { color: colors.text }]}>Allow ABS to use your camera</Text>
            <Text style={[styles.text, { color: colors.text }]}>
              ABS uses your camera to scan product barcodes, so you can find and sell products quickly.
            </Text>
            <Pressable
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: colors.tint }]}
              onPress={() => { void handleContinue(); }}
            >
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // After "Don't Allow": never ask again, say how to turn it on in Settings.
  if (access === 'blocked') {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeScanner}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.centerContent}>
            <AppIcon name="camera" size={64} color={colors.tint} style={styles.icon} />
            <Text style={[styles.title, { color: colors.text }]}>Camera access is off</Text>
            <Text style={[styles.text, { color: colors.text }]}>{cameraBlockedMessage('scan barcodes')}</Text>
            <Pressable
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: colors.tint }]}
              onPress={openAppSettings}
            >
              <Text style={styles.buttonText}>Open Settings</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.button, styles.secondaryButton, { borderColor: colors.tint }]}
              onPress={closeScanner}
            >
              <Text style={[styles.buttonText, { color: colors.tint }]}>Close</Text>
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
        <Pressable
          onPress={closeScanner}
          style={styles.closeButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close camera"
        >
          <AppIcon name="times" size={26} color="#fff" />
        </Pressable>
        {continuous && footer ? (
          <View style={styles.continuousFooter} pointerEvents="box-none">
            <Text style={[styles.instructionText, styles.instructionAboveFooter]} pointerEvents="none">
              Point camera at barcode
            </Text>
            {footer}
          </View>
        ) : (
          <View style={styles.footer} pointerEvents="none">
            <Text style={styles.instructionText}>Point camera at barcode</Text>
          </View>
        )}
        {children}
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
  continuousFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 34,
    alignItems: 'stretch',
    gap: 12,
  },
  instructionAboveFooter: {
    alignSelf: 'center',
    overflow: 'hidden',
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
