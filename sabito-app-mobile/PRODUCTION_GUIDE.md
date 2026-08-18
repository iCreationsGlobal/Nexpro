# 🚀 Sabito Mobile App - Production Setup Guide

Complete step-by-step guide to deploy your mobile app to production.

---

## 📋 **Prerequisites**

Before starting, make sure you have:

- ✅ Node.js installed (v18+)
- ✅ npm installed (v9+)
- ✅ Expo account (create at [expo.dev](https://expo.dev))
- ✅ Your production API credentials ready
- ✅ Paystack live keys
- ✅ Google OAuth credentials

**Optional (for app store submission):**
- Apple Developer Account ($99/year) - for iOS
- Google Play Console Account ($25 one-time) - for Android

---

## 🎯 **Phase 1: Initial Setup** (15 minutes)

### Step 1: Install EAS CLI

```bash
npm install -g eas-cli
```

Verify installation:
```bash
eas --version
```

### Step 2: Login to Expo

```bash
eas login
```

Enter your Expo credentials (or create account if you don't have one).

### Step 3: Initialize EAS Project

```bash
cd mobile
eas init
```

This will:
- Link your app to Expo
- Generate a project ID
- Update your `app.json`

### Step 4: Configure Build

```bash
eas build:configure
```

This will:
- Detect platforms (iOS/Android)
- Set up credentials
- Create necessary files

---

## 🔐 **Phase 2: Add Production Secrets** (10 minutes)

### Option A: Use the Setup Script (Recommended)

1. Open `SETUP_COMMANDS.sh`
2. Replace all placeholder values with your real values:
   - `REPLACE_WITH_YOUR_REAL_PAYSTACK_LIVE_KEY`
   - `REPLACE_WITH_YOUR_IOS_CLIENT_ID`
   - `REPLACE_WITH_YOUR_ANDROID_CLIENT_ID`
   - `REPLACE_WITH_YOUR_WEB_CLIENT_ID`
3. Run the script:

```bash
bash SETUP_COMMANDS.sh
```

### Option B: Add Secrets Manually

```bash
# API Configuration
eas secret:create --scope project --name PROD_API_URL \
  --value "https://api.sabito.com"

eas secret:create --scope project --name PROD_SUPPORT_URL \
  --value "https://sabito.com/api/support/support-content.json"

# Paystack (IMPORTANT: Use LIVE key)
eas secret:create --scope project --name PROD_PAYSTACK_KEY \
  --value "pk_live_YOUR_REAL_KEY"

# Google OAuth
eas secret:create --scope project --name PROD_GOOGLE_IOS \
  --value "your-ios-client-id.apps.googleusercontent.com"

eas secret:create --scope project --name PROD_GOOGLE_ANDROID \
  --value "your-android-client-id.apps.googleusercontent.com"

eas secret:create --scope project --name PROD_GOOGLE_WEB \
  --value "your-web-client-id.apps.googleusercontent.com"
```

### Verify Secrets

```bash
eas secret:list
```

You should see all 6 secrets listed.

---

## 🏗️ **Phase 3: Build Your App** (30-60 minutes)

EAS will build your app in the cloud. You just need to run the commands!

### Step 1: Test with Development Build First

```bash
# Build for Android (faster, good for testing)
eas build --profile development --platform android
```

This will:
- Upload your code to EAS
- Build the app
- Give you a download link

**Download and test on a real device!**

### Step 2: Build Preview Version (Optional)

For beta testers:

```bash
eas build --profile preview --platform all
```

### Step 3: Build Production Version

When you're ready for app stores:

```bash
eas build --profile production --platform all
```

This builds both iOS and Android production versions.

**Build Status:**
Check build progress at: https://expo.dev/accounts/YOUR_USERNAME/projects/sabito/builds

---

## 📱 **Phase 4: Test Your Builds** (30 minutes)

### Android Testing

1. Download the `.apk` file from EAS
2. Install on your Android device
3. Test all features:
   - ✅ Login/Signup
   - ✅ Real-time chat (Socket.IO)
   - ✅ Push notifications
   - ✅ Payments
   - ✅ Google OAuth
   - ✅ All screens work

### iOS Testing

1. Download the `.ipa` file or use TestFlight
2. Install on your iOS device
3. Test all features (same as above)

---

## 🍎 **Phase 5: Submit to Apple App Store** (iOS)

### Prerequisites

1. **Apple Developer Account** ($99/year)
   - Sign up at [developer.apple.com](https://developer.apple.com)

2. **Create App in App Store Connect**
   - Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
   - Create new app
   - Fill in app information

3. **Prepare App Store Assets**
   - App screenshots (all device sizes)
   - App icon (1024x1024)
   - App description
   - Privacy policy URL
   - Support URL

### Submit with EAS

Update `eas.json` with your Apple details:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCDE12345"
      }
    }
  }
}
```

Then submit:

```bash
eas submit --platform ios
```

EAS will:
- Upload your app to App Store Connect
- Fill in required metadata
- Submit for review

**Review Time:** Usually 1-3 days

---

## 🤖 **Phase 6: Submit to Google Play Store** (Android)

### Prerequisites

1. **Google Play Console Account** ($25 one-time)
   - Sign up at [play.google.com/console](https://play.google.com/console)

2. **Create App in Play Console**
   - Create new app
   - Fill in app information

3. **Create Service Account**
   - Go to Google Cloud Console
   - Create service account
   - Download JSON key
   - Save as `google-play-service-account.json`

4. **Prepare Play Store Assets**
   - App screenshots
   - Feature graphic (1024x500)
   - App icon
   - App description
   - Privacy policy URL

### Submit with EAS

Update `eas.json`:

```json
{
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "production"
      }
    }
  }
}
```

Then submit:

```bash
eas submit --platform android
```

**Review Time:** Usually a few hours to 1 day

---

## 🔧 **Common Commands Reference**

### Build Commands

```bash
# Development build (for testing)
eas build --profile development --platform android

# Preview build (for beta testers)
eas build --profile preview --platform all

# Production build (for app stores)
eas build --profile production --platform all

# Build for specific platform only
eas build --profile production --platform ios
eas build --profile production --platform android
```

### Secret Management

```bash
# List all secrets
eas secret:list

# Create a secret
eas secret:create --scope project --name SECRET_NAME --value "secret_value"

# Delete a secret
eas secret:delete --name SECRET_NAME

# Update a secret (delete and recreate)
eas secret:delete --name SECRET_NAME
eas secret:create --scope project --name SECRET_NAME --value "new_value"
```

### Submit Commands

```bash
# Submit to both stores
eas submit --platform all

# Submit to specific store
eas submit --platform ios
eas submit --platform android
```

### Credentials Management

```bash
# View credentials
eas credentials

# Configure iOS credentials
eas credentials --platform ios

# Configure Android credentials
eas credentials --platform android
```

---

## 🐛 **Troubleshooting**

### Build Fails

**Check:**
1. All dependencies installed correctly
2. No syntax errors in code
3. Environment variables are set correctly
4. Run `npm install` in mobile directory

**Debug:**
```bash
# View build logs
eas build:list
# Click on failed build to see logs
```

### Secret Not Found

```bash
# Verify secret exists
eas secret:list

# Recreate if missing
eas secret:create --scope project --name SECRET_NAME --value "value"
```

### iOS Build Issues

**Common fixes:**
- Update bundle identifier in `eas.json`
- Check Apple Developer account is active
- Verify provisioning profile is valid

### Android Build Issues

**Common fixes:**
- Check package name in `eas.json`
- Verify keystore is configured
- Check Google Play Console access

---

## 📊 **Build Profiles Explained**

### Development
```json
{
  "development": {
    "developmentClient": true,
    "distribution": "internal"
  }
}
```
- For local testing
- Includes debugging tools
- Connects to Expo Go or dev client

### Preview
```json
{
  "preview": {
    "distribution": "internal",
    "android": { "buildType": "apk" }
  }
}
```
- For beta testers
- Standalone app
- No debugging tools

### Production
```json
{
  "production": {
    "env": { "API_URL": "$PROD_API_URL" },
    "ios": { "bundleIdentifier": "com.sabito.app" }
  }
}
```
- For app stores
- Optimized & minified
- Uses production secrets

---

## 🎯 **Quick Start Checklist**

Use this checklist to track your progress:

### Setup
- [ ] Install EAS CLI (`npm install -g eas-cli`)
- [ ] Login to Expo (`eas login`)
- [ ] Initialize project (`eas init`)
- [ ] Configure build (`eas build:configure`)

### Secrets
- [ ] Add PROD_API_URL
- [ ] Add PROD_SUPPORT_URL
- [ ] Add PROD_PAYSTACK_KEY
- [ ] Add PROD_GOOGLE_IOS
- [ ] Add PROD_GOOGLE_ANDROID
- [ ] Add PROD_GOOGLE_WEB
- [ ] Verify secrets (`eas secret:list`)

### Build
- [ ] Build development version
- [ ] Test on Android device
- [ ] Test on iOS device
- [ ] Build preview version (optional)
- [ ] Build production version

### App Stores
- [ ] Create Apple Developer account
- [ ] Create Google Play Console account
- [ ] Prepare app store assets
- [ ] Submit iOS app
- [ ] Submit Android app

---

## 📞 **Need Help?**

### Resources
- **EAS Documentation:** https://docs.expo.dev/eas/
- **Expo Forums:** https://forums.expo.dev/
- **Stack Overflow:** Tag `expo` and `eas`

### Common Links
- **Expo Dashboard:** https://expo.dev/
- **Apple App Store Connect:** https://appstoreconnect.apple.com/
- **Google Play Console:** https://play.google.com/console/
- **Paystack Dashboard:** https://dashboard.paystack.com/

---

## 🎉 **You're Ready!**

Follow the phases in order:
1. ✅ Initial Setup (15 min)
2. ✅ Add Secrets (10 min)
3. ✅ Build App (30-60 min)
4. ✅ Test Builds (30 min)
5. ✅ Submit to Stores (varies)

**Total Time to First Build: ~1 hour**

**Total Time to App Store: ~1-2 weeks** (including review time)

Good luck! 🚀

