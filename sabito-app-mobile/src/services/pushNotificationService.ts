/**
 * Push Notification Service
 * Handles push notification registration, token management, and notification handling
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';
import type { AxiosResponse } from 'axios';

// Lazy load Constants to avoid accessing Platform at module initialization
let Constants: any;
const getConstants = () => {
  if (!Constants) {
    Constants = require('expo-constants').default;
  }
  return Constants;
};

// Flag to track if notification handler is configured
let isHandlerConfigured = false;

/**
 * Configure notification handler (deferred until first use)
 */
const configureNotificationHandler = (): void => {
  if (!isHandlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    isHandlerConfigured = true;
  }
};

interface NotificationContent {
  title?: string;
  body?: string;
  data?: Record<string, any>;
}

/**
 * Send push token to backend
 */
export const sendTokenToBackend = async (token: string): Promise<AxiosResponse | void> => {
  try {
    const accessToken = await AsyncStorage.getItem('accessToken');
    if (!accessToken) {
      console.log('No access token, skipping token registration');
      // Save token to retry later when user logs in
      await AsyncStorage.setItem('pendingPushToken', token);
      return;
    }

    const response = await apiClient.post(
      '/api/notifications/register-token',
      { 
        pushToken: token,
        platform: Platform.OS,
      },
      {
        timeout: 10000, // 10 second timeout for production
      }
    );

    console.log('✅ Push token sent to backend');
    
    // Clear any pending token since we successfully sent this one
    await AsyncStorage.removeItem('pendingPushToken');
    
    return response;
  } catch (error: any) {
    console.error('❌ Failed to send push token to backend:', error.message);
    
    // In production, save token to retry later
    if (!__DEV__) {
      await AsyncStorage.setItem('pendingPushToken', token);
    }
    
    // Don't throw error - token is saved locally and can be sent later
  }
};

/**
 * Register device for push notifications and save token to backend
 */
export const registerForPushNotifications = async (): Promise<string | null> => {
  try {
    // Configure notification handler on first use
    configureNotificationHandler();
    
    // Check if running on a physical device (simulators don't support push notifications)
    if (Platform.OS === 'web') {
      console.log('Push notifications not supported on web');
      return null;
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permission for push notifications denied');
      return null;
    }

    // Get push token
    const projectId = getConstants().expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });
    const token = tokenData.data;

    // Configure notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1CA700',
        sound: 'default',
      });
    }

    // Save token to AsyncStorage
    await AsyncStorage.setItem('pushToken', token);

    // Send token to backend
    await sendTokenToBackend(token);

    console.log('✅ Push notification token registered:', token);
    return token;
  } catch (error: any) {
    console.error('❌ Failed to register for push notifications:', error);
    return null;
  }
};

/**
 * Remove push token from backend (on logout)
 */
export const unregisterPushToken = async (): Promise<void> => {
  try {
    const token = await AsyncStorage.getItem('pushToken');
    const accessToken = await AsyncStorage.getItem('accessToken');

    if (!token || !accessToken) {
      return;
    }

    await apiClient.delete('/api/notifications/unregister-token', {
      data: { pushToken: token },
    });

    // Remove token from local storage
    await AsyncStorage.removeItem('pushToken');

    console.log('✅ Push token unregistered');
  } catch (error: any) {
    console.error('❌ Failed to unregister push token:', error.message);
  }
};

/**
 * Add notification received listener
 */
export const addNotificationReceivedListener = (
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription => {
  return Notifications.addNotificationReceivedListener(callback);
};

/**
 * Add notification response listener (when user taps on notification)
 */
export const addNotificationResponseListener = (
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription => {
  return Notifications.addNotificationResponseReceivedListener(callback);
};

/**
 * Schedule a local notification (for testing)
 */
export const scheduleLocalNotification = async (content: NotificationContent): Promise<void> => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: content.title || 'Sabito',
        body: content.body || 'You have a new notification',
        data: content.data || {},
        sound: 'default',
      },
      trigger: null, // Send immediately
    });
  } catch (error: any) {
    console.error('Failed to schedule local notification:', error);
  }
};

/**
 * Clear all delivered notifications
 */
export const clearAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (error: any) {
    console.error('Failed to clear notifications:', error);
  }
};

/**
 * Get badge count
 */
export const getBadgeCount = async (): Promise<number> => {
  try {
    return await Notifications.getBadgeCountAsync();
  } catch (error: any) {
    console.error('Failed to get badge count:', error);
    return 0;
  }
};

/**
 * Set badge count
 */
export const setBadgeCount = async (count: number): Promise<void> => {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error: any) {
    console.error('Failed to set badge count:', error);
  }
};






