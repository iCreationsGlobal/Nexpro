export default {
  expo: {
    name: 'Sabito Store',
    slug: 'sabito-buyer',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'sabito-buyer',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#166534',
    },
    ios: {
      bundleIdentifier: 'com.sabito.buyer',
      buildNumber: '1',
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription: 'Sabito Store uses the camera when you choose to upload a profile photo.',
        NSPhotoLibraryUsageDescription: 'Sabito Store uses your photo library when you choose to upload a profile photo.',
      },
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.sabito.buyer',
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#166534',
      },
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            { scheme: 'sabito-buyer' },
            { scheme: 'https', host: 'sabito.app', pathPrefix: '/' },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-splash-screen',
      [
        'expo-notifications',
        {
          icon: './assets/images/notification-icon.png',
          color: '#166534',
        },
      ],
    ],
    experiments: { typedRoutes: true },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001',
      googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
      googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
      googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
      eas: {
        projectId: process.env.EAS_PROJECT_ID || '00000000-0000-0000-0000-000000000000',
      },
    },
  },
};
