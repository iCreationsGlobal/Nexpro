/**
 * Notification Retry Service
 * Handles retrying failed push token registrations
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications } from './pushNotificationService';

// Import the function from pushNotificationService (we'll need to export it)
// Note: This assumes sendTokenToBackend will be exported from pushNotificationService.ts
import { sendTokenToBackend } from './pushNotificationService';

/**
 * Retry sending pending push token to backend
 * Call this after user logs in or when app comes to foreground
 */
export const retryPendingPushToken = async (): Promise<void> => {
  try {
    const pendingToken = await AsyncStorage.getItem('pendingPushToken');
    if (!pendingToken) {
      return;
    }

    const accessToken = await AsyncStorage.getItem('accessToken');
    if (!accessToken) {
      // Still no access token, keep token pending
      return;
    }

    // Try to send the pending token
    await sendTokenToBackend(pendingToken);
    
    // If successful, token will be cleared in sendTokenToBackend
    console.log('✅ Retried sending pending push token');
  } catch (error: any) {
    console.error('❌ Failed to retry pending push token:', error);
  }
};

/**
 * Ensure push token is registered
 * Call this on app start or after login
 */
export const ensurePushTokenRegistered = async (): Promise<void> => {
  try {
    // Check if we already have a token
    const existingToken = await AsyncStorage.getItem('pushToken');
    
    if (existingToken) {
      // Verify token is registered with backend
      const accessToken = await AsyncStorage.getItem('accessToken');
      if (accessToken) {
        // Try to send it again (backend will handle duplicates)
        await sendTokenToBackend(existingToken);
      }
    } else {
      // No token yet, try to register
      await registerForPushNotifications();
    }
    
    // Also retry any pending tokens
    await retryPendingPushToken();
  } catch (error: any) {
    console.error('❌ Failed to ensure push token registration:', error);
  }
};






