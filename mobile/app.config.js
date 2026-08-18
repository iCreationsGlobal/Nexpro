export default {
  expo: {
    name: 'ABS',
    slug: 'abs',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'abs',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#166534',
    },
    ios: {
      bundleIdentifier: 'com.absghana.app',
      buildNumber: '1',
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription: 'ABS (African Business Suite) uses the camera to scan products and attach business images when you choose to use those features.',
        NSPhotoLibraryUsageDescription: 'ABS (African Business Suite) uses your photo library to upload logos, profile photos, receipts, and other business images you choose.',
        NSContactsUsageDescription: 'ABS uses your contacts so you can import customers or leads into your business.',
      },
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.absghana.app',
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      permissions: ['READ_CONTACTS'],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-audio',
      'expo-camera',
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#166534',
          defaultChannel: 'default',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission:
            'Allow ABS to access your photos so you can set a profile picture and upload business images.',
          cameraPermission:
            'Allow ABS to use the camera so you can take a profile picture and attach business images.',
        },
      ],
      [
        'expo-contacts',
        {
          contactsPermission: 'Allow ABS to access your contacts so you can import customers or leads.',
        },
      ],
    ],
    experiments: { typedRoutes: true },
    extra: {
      // Prefer EXPO_PUBLIC_*; EAS profiles set production. Localhost only for local Expo.
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://api.africanbusinesssuite.com',
      onlineStoreUrl: process.env.EXPO_PUBLIC_ONLINE_STORE_URL || 'https://store.absghana.com',
      eas: {
        projectId: '8dff9445-6979-427f-b84e-aae48f077d82',
      },
    },
  },
};
