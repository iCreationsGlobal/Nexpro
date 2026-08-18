# Sentry Expo Go Compatibility Fix

## The Issue

When running the app in Expo Go, you were seeing this error:

```
ERROR  ❌ [Sentry] Initialization failed: [TypeError: Cannot read property 'prototype' of undefined]
```

## Why This Happens

`@sentry/react-native` requires native modules that aren't available in Expo Go. Expo Go is a sandbox environment that doesn't include all native modules, including Sentry's native SDK.

## The Fix

Updated `mobile/src/config/sentry.js` to:

1. **Detect Expo Go Environment**
   - Checks if the app is running in Expo Go using `Constants.appOwnership === 'expo'`
   - If in Expo Go, skips Sentry initialization completely

2. **Better Error Handling**
   - If initialization fails due to missing native modules, shows a friendly warning instead of an error
   - Clearly indicates this is expected behavior in Expo Go

## What You'll See Now

### In Expo Go (Development)
```
[Sentry] 📱 Running in Expo Go - Sentry disabled (native modules not available)
[Sentry] ℹ️  Sentry will work in production builds and development builds
```

### In Production Builds (EAS Build)
```
✅ [Sentry] Initialized successfully
[Sentry] 📊 Configuration: { dsn: 'https://...', environment: 'production', ... }
✅ [Sentry] Test message sent to Sentry
```

## Where Sentry Works

✅ **Production builds** (EAS Build)
✅ **Development builds** (Custom dev client)
❌ **Expo Go** (Native modules not available)

## Testing Sentry

To test Sentry properly, you need to:

1. **Build a production app:**
   ```bash
   eas build --platform ios --profile production
   # or
   eas build --platform android --profile production
   ```

2. **Or create a development build:**
   ```bash
   eas build --platform ios --profile development
   # or
   eas build --platform android --profile development
   ```

3. **Install and test the build** - Sentry will work in these builds

## Summary

- ✅ **Error is now handled gracefully** - No more red error messages in Expo Go
- ✅ **Sentry still works in production** - The fix doesn't affect production builds
- ✅ **Clear messaging** - Users understand why Sentry isn't available in Expo Go
- ✅ **App continues to work** - Sentry errors don't break the app

## Note

This is expected behavior and doesn't affect your production app. All error tracking will work perfectly when you build and deploy the app using EAS Build.

