/**
 * Image Upload Service for Mobile
 * Converts images to base64 data URLs with compression
 * Limits file size to prevent timeout issues
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

// Configuration
const MAX_FILE_SIZE_MB = 2; // Maximum file size in MB
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const IMAGE_QUALITY = 0.7; // Compression quality (0-1)
const MAX_DIMENSION = 1024; // Maximum width or height in pixels

/**
 * Compress and resize image
 */
const compressImage = async (imageUri: string): Promise<string> => {
  try {
    // Get image info to check size
    const info = await FileSystem.getInfoAsync(imageUri);
    const sizeInMB = (info as any).size / (1024 * 1024);
    
    // Manipulate image - resize and compress
    const manipResult = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        { resize: { width: MAX_DIMENSION } } // Resize to max dimension while maintaining aspect ratio
      ],
      {
        compress: IMAGE_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG, // Convert to JPEG for better compression
      }
    );
    
    // Check compressed size
    const compressedInfo = await FileSystem.getInfoAsync(manipResult.uri);
    const compressedSizeInMB = (compressedInfo as any).size / (1024 * 1024);
    
    // Check if still too large
    if ((compressedInfo as any).size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`Image is still too large (${compressedSizeInMB.toFixed(1)}MB). Please use a smaller image.`);
    }
    
    return manipResult.uri;
  } catch (error: any) {
    throw error;
  }
};

/**
 * Convert image URI to base64 data URL
 */
const imageToBase64 = async (imageUri: string): Promise<string> => {
  try {
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    // Determine mime type from URI
    const ext = imageUri.split('.').pop()?.toLowerCase() || 'jpeg';
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'gif') mimeType = 'image/gif';
    else if (ext === 'webp') mimeType = 'image/webp';
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error: any) {
    throw new Error('Failed to process image');
  }
};

/**
 * Upload business logo with compression
 */
export const uploadBusinessLogo = async (
  imageUri: string, 
  userId?: string, 
  accessToken?: string
): Promise<string> => {
  try {
    if (!imageUri) {
      throw new Error('Image URI is required');
    }
    
    // Step 1: Compress and resize image
    const compressedUri = await compressImage(imageUri);
    
    // Step 2: Convert to base64 data URL
    const base64DataUrl = await imageToBase64(compressedUri);
    
    if (!base64DataUrl || !base64DataUrl.startsWith('data:image/')) {
      throw new Error('Failed to convert image to base64 format');
    }
    
    return base64DataUrl;
  } catch (error: any) {
    console.error('Error in uploadBusinessLogo:', error);
    throw error;
  }
};

/**
 * Upload profile image with compression
 */
export const uploadProfileImage = async (
  imageUri: string, 
  userId?: string, 
  accessToken?: string
): Promise<string> => {
  try {
    // Step 1: Compress and resize image
    const compressedUri = await compressImage(imageUri);
    
    // Step 2: Convert to base64 data URL
    const base64DataUrl = await imageToBase64(compressedUri);
    return base64DataUrl;
  } catch (error: any) {
    console.error('Error in uploadProfileImage:', error);
    throw error;
  }
};






