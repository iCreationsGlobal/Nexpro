# View Mobile App Logs

## Method 1: Sentry Dashboard (Production Errors) ⭐ RECOMMENDED

**Best for**: Production error tracking and monitoring

1. Go to: https://sentry.io/organizations/sabito/projects/sabito-mobile-ios/
2. View:
   - **Issues**: All errors and exceptions
   - **Performance**: Slow operations
   - **Releases**: App versions and error rates
   - **Users**: Affected users

**Real-time**: Errors appear within seconds of occurring

---

## Method 2: iOS Device Console (Xcode)

**Best for**: Real-time device logs while testing

### Option A: Xcode GUI
1. Connect iOS device via USB
2. Open **Xcode** → **Window** → **Devices and Simulators**
3. Select your device
4. Click **Open Console** button
5. Filter by: `Sabito` or `com.sabito.app`
6. View real-time logs

### Option B: Terminal (macOS/Linux)
```bash
# Stream device logs
idevicesyslog | grep -i sabito

# Or view all logs
idevicesyslog
```

**Note**: Requires `libimobiledevice` installed:
```bash
# macOS
brew install libimobiledevice

# Linux
sudo apt-get install libimobiledevice6
```

---

## Method 3: Android Device Logs

**Best for**: Android device testing

```bash
# Connect Android device via USB with USB debugging enabled
adb logcat | grep -i sabito

# Or view all logs
adb logcat
```

---

## Method 4: EAS Build Logs

**Best for**: Build-time errors and warnings

```bash
cd mobile

# List recent builds
eas build:list

# View specific build logs
eas build:view [BUILD_ID]
```

Or view in browser:
- https://expo.dev/accounts/eamankyim/projects/sabito/builds
- Click on any build to see logs

---

## Method 5: Expo Development Logs

**Best for**: Development builds (Expo Go or development client)

```bash
cd mobile
npx expo start

# Logs appear in terminal
# Press 'j' to open debugger
```

---

## Method 6: Temporarily Enable Verbose Logging

**Best for**: Debugging specific issues in production

Edit `mobile/eas.json`:

```json
"production": {
  "env": {
    ...
    "LOG_LEVEL": "verbose",  // Change from "error"
    "DEBUG_MODE": "true"      // Change from "false"
  }
}
```

Then rebuild:
```bash
cd mobile
eas build --profile production --platform ios
```

⚠️ **Remember**: Change back to `"error"` and `"false"` after debugging!

---

## Quick Reference

| Method | Use Case | Real-time | Setup Required |
|--------|----------|-----------|----------------|
| **Sentry Dashboard** | Production errors | ✅ Yes | ✅ Already done |
| **Xcode Console** | iOS device testing | ✅ Yes | Device + USB |
| **Android ADB** | Android device testing | ✅ Yes | Device + USB |
| **EAS Build Logs** | Build errors | ❌ No | None |
| **Expo Dev Logs** | Development | ✅ Yes | `expo start` |

---

## Current Log Configuration

- **Production LOG_LEVEL**: `error` (only errors logged)
- **Production DEBUG_MODE**: `false`
- **Sentry**: ✅ Configured and active
- **Error Tracking**: ✅ Automatic via Sentry

---

## Recommended Workflow

1. **For Production Monitoring**: Use Sentry Dashboard
2. **For Local Testing**: Use Xcode Console (iOS) or ADB (Android)
3. **For Build Issues**: Check EAS Build Logs
4. **For Debugging**: Temporarily enable verbose logging

---

## Sentry Dashboard Access

- **URL**: https://sentry.io/organizations/sabito/projects/sabito-mobile-ios/
- **Organization**: sabito
- **Project**: sabito-mobile-ios
- **DSN**: Already configured ✅

