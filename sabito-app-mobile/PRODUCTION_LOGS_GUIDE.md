# Production Logs Guide for Sabito Mobile App

## Current Logging Configuration

- **Production LOG_LEVEL**: `error` (only errors are logged)
- **Production DEBUG_MODE**: `false`
- **No external logging service** (Sentry, etc.) configured

## Methods to View Production Logs

### Method 1: View Logs from Connected iOS Device (Recommended)

#### Using Expo CLI (if app is running via Expo Go or development build):
```bash
cd mobile
npx expo start --ios
# Then press 'j' to open debugger, or view logs in terminal
```

#### Using Xcode Console (for production builds):
1. Connect your iOS device via USB
2. Open **Xcode** → **Window** → **Devices and Simulators**
3. Select your device
4. Click **Open Console** button
5. Filter by your app name: `Sabito` or `com.sabito.app`
6. View real-time logs

#### Using iOS Device Console (Terminal):
```bash
# Install ios-deploy if needed: npm install -g ios-deploy
# Then stream device logs:
idevicesyslog | grep -i sabito
```

### Method 2: View Logs from Connected Android Device

```bash
# Connect Android device via USB with USB debugging enabled
cd mobile
npx react-native log-android

# Or use adb directly:
adb logcat | grep -i sabito
```

### Method 3: Temporarily Enable Verbose Logging in Production

To see more detailed logs, temporarily change `LOG_LEVEL` in `eas.json`:

**File: `mobile/eas.json`**
```json
"production": {
  "env": {
    ...
    "LOG_LEVEL": "verbose",  // Change from "error" to "verbose"
    "DEBUG_MODE": "true"      // Change from "false" to "true"
  }
}
```

Then rebuild:
```bash
cd mobile
eas build --profile production --platform ios
```

⚠️ **Warning**: Remember to change back to `"error"` and `"false"` after debugging!

### Method 4: View EAS Build Logs

View logs from your EAS builds:

```bash
cd mobile
eas build:list
# Copy the build ID, then:
eas build:view [BUILD_ID]
```

Or view in browser:
- Go to: https://expo.dev/accounts/eamankyim/projects/sabito/builds
- Click on any build to see logs

### Method 5: Add Remote Logging Service (Recommended for Production)

#### Option A: Sentry (Recommended)

1. **Install Sentry**:
```bash
cd mobile
npx expo install @sentry/react-native
```

2. **Initialize Sentry** in `mobile/src/App.js`:
```javascript
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: __DEV__ ? "development" : "production",
  enableInExpoDevelopment: false,
  debug: false,
});
```

3. **Create Sentry account** at https://sentry.io
4. **Get DSN** from Sentry dashboard
5. **Add DSN as EAS secret**:
```bash
cd mobile
eas env:create --name SENTRY_DSN --value "YOUR_SENTRY_DSN" --type string --scope project
```

6. **Update `eas.json`** to use Sentry DSN:
```json
"production": {
  "env": {
    ...
    "SENTRY_DSN": "$SENTRY_DSN"
  }
}
```

#### Option B: Firebase Crashlytics

Similar setup but using Firebase instead of Sentry.

## Quick Commands Reference

### View iOS Logs (Device Connected):
```bash
# Using Xcode (GUI)
# Xcode → Window → Devices → Select Device → Open Console

# Using Terminal
idevicesyslog | grep -i sabito
```

### View Android Logs (Device Connected):
```bash
adb logcat | grep -i sabito
```

### View Expo Logs:
```bash
cd mobile
npx expo start
# Logs appear in terminal
```

### View EAS Build Logs:
```bash
cd mobile
eas build:list
eas build:view [BUILD_ID]
```

## Current Log Output Locations

Based on your code:
- **Console logs**: Visible in Xcode console or `expo start` terminal
- **API errors**: Logged via `console.log` in `mobile/src/config/env.js`
- **Error boundary**: Catches React errors (but doesn't log remotely)

## Recommendations

1. **For immediate debugging**: Use Method 1 (Xcode Console or `idevicesyslog`)
2. **For production monitoring**: Set up Sentry (Method 5) for remote error tracking
3. **For temporary verbose logs**: Use Method 3 (change LOG_LEVEL temporarily)

## Next Steps

To set up proper production logging:
1. Install Sentry: `npx expo install @sentry/react-native`
2. Create Sentry account and get DSN
3. Add Sentry initialization to App.js
4. Add SENTRY_DSN to EAS secrets
5. Rebuild production app


