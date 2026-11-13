import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Camera permission, the way App Review wants it (guideline 5.1.1(iv)):
 * - Never show our own screen with a way to back out before the system prompt. Either go straight
 *   to the system prompt, or show one screen with a single "Continue" that opens it.
 * - After "Don't Allow", don't ask again. Next time the person goes for the camera, say how to
 *   turn it on in Settings.
 */

type PermissionLike = { granted?: boolean; canAskAgain?: boolean } | null | undefined;

/** `ask`: the system prompt can still be shown. `blocked`: only Settings can turn the camera on. */
export type CameraAccess = 'checking' | 'ask' | 'blocked' | 'granted';

export function getCameraAccess(permission: PermissionLike): CameraAccess {
  if (!permission) return 'checking';
  if (permission.granted) return 'granted';
  // iOS shows its prompt once; Android can ask again until "Don't ask again" / the second no.
  return permission.canAskAgain === false ? 'blocked' : 'ask';
}

export const CAMERA_SETTINGS_STEPS =
  Platform.OS === 'ios'
    ? 'open Settings › ABS › Camera and turn it on'
    : 'open Settings › Apps › ABS › Permissions › Camera and allow it';

/** "To scan barcodes, open Settings › ABS › Camera and turn it on." */
export function cameraBlockedMessage(purpose: string): string {
  return `To ${purpose}, ${CAMERA_SETTINGS_STEPS}.`;
}

export function openAppSettings(): void {
  void Linking.openSettings().catch(() => {});
}

/**
 * Before taking a photo. Asks with the system prompt the first time (no screen of ours first).
 * A "no" right then is respected silently; if the camera was already turned off, offers Settings.
 * @param purpose What the camera is for, e.g. "take a product photo".
 */
export async function ensureCameraPermission(purpose: string): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  const access = getCameraAccess(current);
  if (access === 'granted') return true;
  if (access === 'ask') {
    const next = await ImagePicker.requestCameraPermissionsAsync();
    return Boolean(next?.granted);
  }
  Alert.alert('Camera access is off', cameraBlockedMessage(purpose), [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: openAppSettings },
  ]);
  return false;
}
