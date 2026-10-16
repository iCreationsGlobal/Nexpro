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
      image: './assets/images/abs-boot-logo.png',
      resizeMode: 'contain',
      backgroundColor: '#00291f',
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
      // Launchers mask the adaptive icon and show only its centre, so the "A" sits inside the
      // safe zone on the icon's own gradient (monochrome for Android 13+ themed icons).
      adaptiveIcon: {
        foregroundImage: './assets/images/android-adaptive-foreground.png',
        backgroundImage: './assets/images/android-adaptive-background.png',
        monochromeImage: './assets/images/android-adaptive-monochrome.png',
        backgroundColor: '#0b3d26',
      },
      edgeToEdgeEnabled: true,
      permissions: ['READ_CONTACTS'],
      // The app only reads contacts and plays a scan beep; libraries add these by default and
      // Play asks for a justification (or a foreground-service declaration) for each.
      blockedPermissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.WRITE_CONTACTS',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      ],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-asset',
      'expo-font',
      'expo-image',
      'expo-sharing',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#00291f',
          image: './assets/images/abs-boot-logo.png',
          imageWidth: 200,
          resizeMode: 'contain',
          // Android 12+ shows the splash logo inside a circle, which would clip the wide wordmark
          android: { image: './assets/images/android-splash-mark.png', imageWidth: 180 },
        },
      ],
      'expo-status-bar',
      'expo-web-browser',
      // Scan beep only: no recording, no background playback
      ['expo-audio', { recordAudioAndroid: false, enableBackgroundPlayback: false }],
      // Photos and barcode scanning only: no video, so no microphone
      ['expo-camera', { recordAudioAndroid: false }],
      [
        'expo-notifications',
        {
          // Android draws the small notification icon as a white silhouette
          icon: './assets/images/android-notification-icon.png',
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
