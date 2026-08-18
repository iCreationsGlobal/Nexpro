/**
 * Location Service
 * Handles location permissions and address retrieval
 */

import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

interface AddressData {
  fullAddress: string;
  street: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

/**
 * Request Location Permission
 * Requests permission directly (shows system dialog)
 * Only shows "go to settings" if user previously denied
 */
export const requestLocationPermission = async (): Promise<boolean> => {
  try {
    // First check current permission status
    const { status: currentStatus } = await Location.getForegroundPermissionsAsync();
    
    if (currentStatus === 'granted') {
      return true;
    }
    
    // If not granted, request permission (shows system dialog)
    const { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status === 'granted') {
      return true;
    } else if (status === 'denied') {
      // Only show "go to settings" alert if user denied it
      Alert.alert(
        'Location Access Denied',
        'To use this feature, please enable location access in your device settings.',
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
      return false;
    }
    
    return false;
  } catch (error: any) {
    return false;
  }
};

/**
 * Get current location and convert to address
 */
export const getCurrentLocationAddress = async (): Promise<AddressData> => {
  try {
    // Get current position
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    
    // Reverse geocode to get address
    const addresses = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
    
    if (addresses && addresses.length > 0) {
      const address = addresses[0];
      // Format full address
      const fullAddress = [
        address.streetNumber,
        address.street,
        address.district,
        address.city,
        address.region,
      ].filter(Boolean).join(', ');
      
      return {
        fullAddress: fullAddress || address.formattedAddress || 'Address not found',
        street: address.street || '',
        city: address.city || '',
        region: address.region || '',
        country: address.country || '',
        postalCode: address.postalCode || '',
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    }
    
    throw new Error('No address found for this location');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get address from location with permission check
 */
export const getAddressFromLocation = async (): Promise<AddressData | null> => {
  try {
    // Check/request permission
    const hasPermission = await requestLocationPermission();
    
    if (!hasPermission) {
      return null;
    }
    
    // Get location and address
    const addressData = await getCurrentLocationAddress();
    
    return addressData;
  } catch (error: any) {
    if (error.message?.includes('Location services are disabled')) {
      // Handle disabled location services
    } else {
      // Handle other errors
    }
    
    return null;
  }
};

/**
 * Open Google Maps for address selection
 */
export const openGoogleMapsForAddress = async (currentAddress: string = ''): Promise<AddressData | null> => {
  // For now, we'll use current location
  // In future, can integrate with Google Places API for search
  return new Promise((resolve) => {
    Alert.alert(
      'Get Location',
      'Would you like to use your current location for your business address?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(null),
        },
        {
          text: 'Use Current Location',
          onPress: async () => {
            const address = await getAddressFromLocation();
            resolve(address);
          },
        },
      ]
    );
  });
};






