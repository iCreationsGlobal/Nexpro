jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Linking: { openSettings: jest.fn(() => Promise.resolve()) },
  Platform: { OS: 'ios' },
}));
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

import fs from 'node:fs';
import path from 'node:path';
import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { cameraBlockedMessage, ensureCameraPermission, getCameraAccess } from '@/utils/cameraPermission';

const getPermission = ImagePicker.getCameraPermissionsAsync as jest.Mock;
const requestPermission = ImagePicker.requestCameraPermissionsAsync as jest.Mock;
const alert = Alert.alert as jest.Mock;

describe('getCameraAccess', () => {
  it('waits while the permission is loading', () => {
    expect(getCameraAccess(null)).toBe('checking');
  });

  it('opens the camera once allowed', () => {
    expect(getCameraAccess({ granted: true, canAskAgain: true })).toBe('granted');
  });

  it('can still ask before the first answer (and on Android after one no)', () => {
    expect(getCameraAccess({ granted: false, canAskAgain: true })).toBe('ask');
  });

  it('after "Don\'t Allow" only Settings can turn it on', () => {
    expect(getCameraAccess({ granted: false, canAskAgain: false })).toBe('blocked');
  });
});

describe('ensureCameraPermission', () => {
  beforeEach(() => jest.clearAllMocks());

  it('goes straight on when the camera is allowed', async () => {
    getPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    await expect(ensureCameraPermission('take a product photo')).resolves.toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('shows the system prompt the first time, with nothing of ours before it', async () => {
    getPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    requestPermission.mockResolvedValue({ granted: true });
    await expect(ensureCameraPermission('take a product photo')).resolves.toBe(true);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it('respects a "Don\'t Allow" without a follow-up message', async () => {
    getPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    requestPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(ensureCameraPermission('take a product photo')).resolves.toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });

  it('next time, explains how to turn it on in Settings and never asks again', async () => {
    getPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(ensureCameraPermission('take a product photo')).resolves.toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Camera access is off',
      'To take a product photo, open Settings › ABS › Camera and turn it on.',
      expect.any(Array)
    );
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(['Not now', 'Open Settings']);
    buttons[1].onPress?.();
    expect(Linking.openSettings).toHaveBeenCalled();
  });

  it('builds the Settings message', () => {
    expect(cameraBlockedMessage('scan barcodes')).toBe('To scan barcodes, open Settings › ABS › Camera and turn it on.');
  });
});

// App Review rejected build 22 for a "Grant Permission" button and a "Cancel" before the system prompt.
describe('camera screens', () => {
  const read = (file: string) =>
    fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

  it('the barcode scanner has no "Grant Permission" and asks only from its Continue button', () => {
    const source = read('components/BarcodeScanner.tsx');
    expect(source).not.toMatch(/Grant Permission/i);
    expect(source).toMatch(/>Continue</);
    expect(source.match(/requestPermission\(/g) ?? []).toHaveLength(1);
  });

  it('photo screens go through ensureCameraPermission', () => {
    const files = [
      'app/(tabs)/products.tsx',
      'app/profile.tsx',
      'app/store-setup/logo.tsx',
      'app/store-setup/products.tsx',
      'app/rental/[id].tsx',
      'components/simple/SimpleProductSheet.tsx',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/requestCameraPermissionsAsync/);
      expect(source).toMatch(/ensureCameraPermission\(/);
    }
  });
});
