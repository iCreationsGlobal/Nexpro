/**
 * Permissions Service
 * Handles all app permissions with user-friendly flows
 */

import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';

/**
 * Request Camera Permission
 */
export const requestCameraPermission = async (): Promise<boolean> => {
  try {
    // First check current permission status
    const { status: currentStatus } = await ImagePicker.getCameraPermissionsAsync();
    
    // If already granted, return true
    if (currentStatus === 'granted') {
      return true;
    }
    
    // If denied, show alert to open settings
    if (currentStatus === 'denied') {
      showPermissionDeniedAlert('Camera', 'take photos for your profile and business');
      return false;
    }
    
    // If undetermined, request permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status === 'granted') {
      return true;
    } else if (status === 'denied') {
      showPermissionDeniedAlert('Camera', 'take photos for your profile and business');
      return false;
    }
    
    return false;
  } catch (error: any) {
    console.error('Error requesting camera permission:', error);
    Alert.alert(
      'Permission Error',
      'Unable to request camera permission. Please check your device settings.',
      [{ text: 'OK' }]
    );
    return false;
  }
};

/**
 * Request Media Library Permission
 */
export const requestMediaLibraryPermission = async (): Promise<boolean> => {
  try {
    // First check current permission status
    const { status: currentStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();
    
    // If already granted, return true
    if (currentStatus === 'granted') {
      return true;
    }
    
    // If denied, show alert to open settings
    if (currentStatus === 'denied') {
      showPermissionDeniedAlert('Photos', 'select images from your library');
      return false;
    }
    
    // If undetermined, request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status === 'granted') {
      return true;
    } else if (status === 'denied') {
      showPermissionDeniedAlert('Photos', 'select images from your library');
      return false;
    }
    
    return false;
  } catch (error: any) {
    console.error('Error requesting media library permission:', error);
    Alert.alert(
      'Permission Error',
      'Unable to request photo library permission. Please check your device settings.',
      [{ text: 'OK' }]
    );
    return false;
  }
};

/**
 * Request Notification Permission
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus === 'granted') {
      // Configure notification behavior
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1CA700',
      });
      
      return true;
    } else if (finalStatus === 'denied') {
      showPermissionDeniedAlert('Notifications', 'receive important updates about your account');
      return false;
    }
    
    return false;
  } catch (error: any) {
    return false;
  }
};

/**
 * Check if Camera Permission is Granted
 */
export const hasCameraPermission = async (): Promise<boolean> => {
  const { status } = await ImagePicker.getCameraPermissionsAsync();
  return status === 'granted';
};

/**
 * Check if Media Library Permission is Granted
 */
export const hasMediaLibraryPermission = async (): Promise<boolean> => {
  const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
  return status === 'granted';
};

/**
 * Check if Notification Permission is Granted
 */
export const hasNotificationPermission = async (): Promise<boolean> => {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
};

/**
 * Show permission denied alert with option to open settings
 */
const showPermissionDeniedAlert = (permissionName: string, purpose: string): void => {
  Alert.alert(
    `${permissionName} Access Required`,
    `Sabito needs access to your ${permissionName.toLowerCase()} to ${purpose}.\n\nPlease enable it in your device settings.`,
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Open Settings',
        onPress: () => {
          if (Platform.OS === 'ios') {
            Linking.openURL('app-settings:');
          } else {
            Linking.openSettings();
          }
        },
      },
    ]
  );
};

/**
 * Show image source selection (Camera or Gallery)
 */
export const showImageSourceOptions = (
  onCamera: () => void, 
  onGallery: () => void
): void => {
  Alert.alert(
    'Select Image Source',
    'Choose how you want to add your logo',
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Camera',
        onPress: () => {
          if (onCamera && typeof onCamera === 'function') {
            onCamera();
          }
        },
      },
      {
        text: 'Photo Library',
        onPress: () => {
          if (onGallery && typeof onGallery === 'function') {
            onGallery();
          }
        },
      },
    ],
    { cancelable: true }
  );
};

interface PermissionResults {
  camera: boolean;
  mediaLibrary: boolean;
  notifications: boolean;
}

/**
 * Request all critical permissions
 * (Can be called on app first launch or onboarding)
 */
export const requestAllPermissions = async (): Promise<PermissionResults> => {
  const results: PermissionResults = {
    camera: false,
    mediaLibrary: false,
    notifications: false,
  };
  
  // Request media library (most important for logo upload)
  results.mediaLibrary = await requestMediaLibraryPermission();
  
  // Request camera (optional, can skip if user declines)
  results.camera = await requestCameraPermission();
  
  // Request notifications (important for updates)
  results.notifications = await requestNotificationPermission();
  return results;
};






