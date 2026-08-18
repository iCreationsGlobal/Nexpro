# Building Development Client for Sabito

## What is a Development Build?

A development build is a custom version of your app that:
- ✅ Includes all native modules (Sentry, Push Notifications, etc.)
- ✅ Still connects to your dev server (hot reload works!)
- ✅ Works just like Expo Go but with full native features
- ✅ Lets you test production features during development

## Prerequisites

1. **EAS CLI installed**:
   ```bash
   npm install -g eas-cli
   ```

2. **Expo account** (you already have this):
   - Username: eamankyim
   - Email: eamankyim@gmail.com

3. **Logged in to EAS**:
   ```bash
   eas login
   ```

## Build Instructions

### For Android (Recommended - Easier)

```bash
cd mobile
eas build --platform android --profile development
```

**What happens:**
1. EAS builds your app in the cloud (takes ~10-15 minutes)
2. You get a download link for the APK
3. Install the APK on your Android device
4. Run `npm start` in the mobile directory
5. Open the development build app on your device
6. It connects to your dev server automatically!

### For iOS (Requires Mac or Paid EAS Account)

```bash
cd mobile
eas build --platform ios --profile development
```

**Note:** iOS builds require:
- A Mac with Xcode, OR
- Paid EAS build account ($29/month)

For Windows users, I recommend **building for Android first**.

## After Building

### 1. Install the Development Build

**Android:**
- Download the APK from the EAS build page
- Install it on your Android device
- Allow installation from unknown sources if prompted

**iOS:**
- Download from TestFlight (if configured)
- Or install the .ipa file via Xcode

### 2. Start Your Dev Server

In the `mobile` directory:

```bash
npm start
```

You'll see:
```
› Metro waiting on exp://192.168.0.167:8081
```

### 3. Open the Development Build

1. Open the "Sabito" app on your device (the one you just installed)
2. It will automatically connect to your dev server
3. You'll see the app load with all native features working!

### 4. Test Sentry

The app will now show:

```
✅ [Sentry] Initialized successfully
[Sentry] 📊 Configuration: {
  dsn: 'https://d88ee4684dbd...',
  environment: 'development',
  debug: true
}
✅ [Sentry] Test message sent to Sentry
```

Check your Sentry dashboard to see the test message!

## Hot Reload Still Works!

When you make changes to your code:
1. Save the file
2. The app reloads automatically
3. Just like Expo Go, but with all native features!

## Troubleshooting

### Build Failed?

1. **Check your Expo account is set up:**
   ```bash
   eas whoami
   ```

2. **Make sure you're logged in:**
   ```bash
   eas login
   ```

3. **Check EAS project is configured:**
   ```bash
   eas build:configure
   ```

### Can't Install APK?

Enable "Install from Unknown Sources" in your Android settings:
- Settings → Security → Unknown Sources → Enable

### App Won't Connect to Dev Server?

Make sure:
1. Your device and computer are on the same WiFi network
2. Your dev server is running (`npm start`)
3. Your firewall allows connections on port 8081

## Build Status

Check your builds at: https://expo.dev/accounts/eamankyim/projects/sabito/builds

## Next Steps

Once your development build is ready:

1. ✅ Test Sentry error tracking
2. ✅ Test push notifications (also needs native modules)
3. ✅ Test all production features
4. ✅ Continue developing with hot reload

## Cost

- **Android builds:** FREE (unlimited)
- **iOS builds:** FREE for first 30 builds/month, then requires EAS subscription

## Timeline

- **Build time:** ~10-15 minutes
- **Download:** ~100-200 MB APK
- **Installation:** ~1 minute

## Ready?

Run this command in your terminal:

```bash
cd mobile
eas build --platform android --profile development
```

Then check https://expo.dev for build progress!

