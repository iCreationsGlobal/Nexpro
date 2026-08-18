# 🍎 App Store Deployment Guide - Sabito iOS App

Complete step-by-step guide to deploy your Sabito app to the Apple App Store.

---

## 📋 **Prerequisites Checklist**

Before you begin, ensure you have:

- [ ] **Apple Developer Account** ($99/year)
  - Sign up at [developer.apple.com](https://developer.apple.com)
  - Enroll in Apple Developer Program
  - Wait for approval (usually 24-48 hours)

- [ ] **Expo Account** (free)
  - Create at [expo.dev](https://expo.dev)
  - Login: `eas login`

- [ ] **EAS CLI Installed**
  ```bash
  npm install -g eas-cli
  eas --version
  ```

- [ ] **Production API Credentials**
  - Production API URL
  - Paystack Live Public Key
  - Google OAuth iOS Client ID
  - Support content URL

- [ ] **App Store Assets Ready**
  - App screenshots (all required sizes)
  - App icon (1024x1024 PNG)
  - App description and keywords
  - Privacy policy URL
  - Support URL
  - Marketing URL (optional)

---

## 🎯 **Phase 1: Apple Developer Account Setup** (1-2 days)

### Step 1: Enroll in Apple Developer Program

1. Go to [developer.apple.com](https://developer.apple.com)
2. Click "Enroll" or "Account"
3. Sign in with your Apple ID
4. Complete enrollment process:
   - Choose entity type (Individual or Organization)
   - Provide required information
   - Pay $99/year fee
   - Wait for approval email

### Step 2: Access App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Sign in with your Apple Developer account
3. Accept terms and conditions if prompted

---

## 📱 **Phase 2: Create App in App Store Connect** (30 minutes)

### Step 1: Create New App

1. In App Store Connect, click **"My Apps"**
2. Click **"+"** button → **"New App"**
3. Fill in the form:
   - **Platform:** iOS
   - **Name:** Sabito
   - **Primary Language:** English (or your primary language)
   - **Bundle ID:** Select or create `com.sabito.app`
   - **SKU:** `sabito-ios-001` (unique identifier)
   - **User Access:** Full Access (or as needed)

4. Click **"Create"**

### Step 2: Get Your App Store Connect App ID

1. After creating the app, you'll see the app dashboard
2. Note your **App Store Connect App ID** (10-digit number)
   - Example: `1234567890`
   - You'll need this for `eas.json`

### Step 3: Get Your Apple Team ID

1. Go to [developer.apple.com/account](https://developer.apple.com/account)
2. Click on **"Membership"** in the sidebar
3. Find your **Team ID** (10-character alphanumeric)
   - Example: `ABCD123456`
   - You'll need this for `eas.json`

---

## ⚙️ **Phase 3: Configure Your App** (15 minutes)

### Step 1: Update `app.json`

Ensure your `app.json` has the correct configuration:

```json
{
  "expo": {
    "name": "Sabito",
    "slug": "sabito",
    "version": "1.0.0",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.sabito.app",
      "buildNumber": "1",
      "infoPlist": {
        "NSCameraUsageDescription": "Sabito needs access to your camera to upload profile pictures and business logos.",
        "NSPhotoLibraryUsageDescription": "Sabito needs access to your photo library to upload profile pictures and business logos.",
        "NSMicrophoneUsageDescription": "Sabito needs access to your microphone for voice features."
      }
    }
  }
}
```

**Important Notes:**
- `bundleIdentifier` must match what you created in App Store Connect
- `buildNumber` increments with each build (1, 2, 3, ...)
- `version` is the user-facing version (1.0.0, 1.0.1, etc.)

### Step 2: Update `eas.json` with App Store Connect Details

Update the `submit` section in `eas.json`:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCD123456"
      }
    }
  }
}
```

**Replace:**
- `your-apple-id@example.com` → Your Apple ID email
- `1234567890` → Your App Store Connect App ID
- `ABCD123456` → Your Apple Team ID

### Step 3: Initialize EAS Project (if not done)

```bash
cd mobile
eas login
eas init
```

This will:
- Link your app to Expo
- Generate a project ID
- Update your `app.json` with the project ID

### Step 4: Configure EAS Build

```bash
eas build:configure
```

Select:
- Platform: iOS
- Build profile: production

---

## 🔐 **Phase 4: Add Production Secrets** (10 minutes)

Add your production environment variables as EAS secrets:

```bash
# API Configuration
eas secret:create --scope project --name PROD_API_URL \
  --value "https://api.sabito.com"

eas secret:create --scope project --name PROD_SUPPORT_URL \
  --value "https://sabito.com/api/support/support-content.json"

# Paystack (IMPORTANT: Use LIVE key, not test key)
eas secret:create --scope project --name PROD_PAYSTACK_KEY \
  --value "pk_live_YOUR_ACTUAL_LIVE_KEY"

# Google OAuth iOS Client ID
eas secret:create --scope project --name PROD_GOOGLE_IOS \
  --value "YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"

# Optional: Android and Web (if you plan to deploy Android later)
eas secret:create --scope project --name PROD_GOOGLE_ANDROID \
  --value "YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com"

eas secret:create --scope project --name PROD_GOOGLE_WEB \
  --value "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
```

### Verify Secrets

```bash
eas secret:list
```

You should see all your secrets listed.

---

## 🏗️ **Phase 5: Build Your iOS App** (30-60 minutes)

### Step 1: Build Production Version

```bash
cd mobile
eas build --profile production --platform ios
```

**What happens:**
1. EAS uploads your code to Expo's servers
2. Builds your app in the cloud
3. Signs it with your Apple Developer certificate
4. Provides download link when complete

**Build Status:**
- Check progress at: https://expo.dev/accounts/YOUR_USERNAME/projects/sabito/builds
- Builds typically take 15-30 minutes

### Step 2: Download and Test

1. Once build completes, download the `.ipa` file
2. Install on a physical iOS device using:
   - **TestFlight** (recommended for testing)
   - **Xcode** (if you have it installed)
   - **Apple Configurator 2**

3. **Test thoroughly:**
   - ✅ App launches correctly
   - ✅ Login/Signup works
   - ✅ All screens load properly
   - ✅ Camera/Photo library access works
   - ✅ Payments work (with live Paystack key)
   - ✅ Google OAuth works
   - ✅ Push notifications work
   - ✅ No crashes or errors

---

## 📤 **Phase 6: Submit to App Store** (15 minutes)

### Option A: Submit via EAS (Recommended)

```bash
cd mobile
eas submit --platform ios --profile production
```

**EAS will:**
1. Upload your `.ipa` to App Store Connect
2. Process the upload
3. Make it available in App Store Connect

### Option B: Manual Upload via App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Select your app
3. Go to **"TestFlight"** tab
4. Click **"+"** next to iOS builds
5. Upload your `.ipa` file
6. Wait for processing (10-30 minutes)

---

## 📝 **Phase 7: Complete App Store Listing** (1-2 hours)

### Step 1: App Information

1. Go to your app in App Store Connect
2. Click **"App Information"**
3. Fill in:
   - **Category:** Select appropriate categories
   - **Subtitle:** Short tagline (30 characters)
   - **Privacy Policy URL:** Required
   - **Support URL:** Required
   - **Marketing URL:** Optional

### Step 2: Pricing and Availability

1. Click **"Pricing and Availability"**
2. Set:
   - **Price:** Free or Paid
   - **Availability:** All countries or specific regions

### Step 3: App Privacy

1. Click **"App Privacy"**
2. Answer questions about data collection:
   - Camera usage
   - Photo library access
   - Location (if used)
   - User data collection
   - Third-party data sharing

### Step 4: Prepare Version Information

1. Click **"1.0 Prepare for Submission"**
2. Fill in required fields:

**App Store Screenshots:**
- iPhone 6.7" Display (iPhone 14 Pro Max): 1290 x 2796 pixels
- iPhone 6.5" Display (iPhone 11 Pro Max): 1242 x 2688 pixels
- iPhone 5.5" Display (iPhone 8 Plus): 1242 x 2208 pixels
- iPad Pro (12.9"): 2048 x 2732 pixels
- iPad Pro (11"): 1668 x 2388 pixels

**Description:**
- Up to 4000 characters
- First 3 lines are most important (shown in search results)
- Include keywords naturally
- Highlight key features

**Keywords:**
- Up to 100 characters
- Comma-separated
- No spaces after commas
- Example: `business,marketing,networking,professional`

**Support URL:**
- Must be accessible
- Example: `https://sabito.com/support`

**Privacy Policy URL:**
- Required by Apple
- Must be accessible
- Example: `https://sabito.com/privacy`

**App Icon:**
- 1024 x 1024 pixels
- PNG format
- No transparency
- No rounded corners (Apple adds them)

**App Preview (Optional):**
- 15-30 second video
- Shows app in action
- Can increase downloads

### Step 5: Build Selection

1. In version information, scroll to **"Build"**
2. Click **"+"** to add build
3. Select your uploaded build
4. If no builds appear, wait a few minutes for processing

### Step 6: Export Compliance

Answer questions about encryption:
- **Does your app use encryption?** Usually "Yes"
- **Does your app use standard encryption?** Usually "Yes"
- This is for US export compliance

### Step 7: Advertising Identifier (IDFA)

- **Does your app use the Advertising Identifier (IDFA)?**
- Answer based on whether you use ads or analytics

### Step 8: Content Rights

- Confirm you have rights to all content
- Confirm you have rights to use any third-party content

---

## ✅ **Phase 8: Submit for Review** (5 minutes)

1. Review all information one more time
2. Click **"Add for Review"** button
3. Answer any final questions
4. Click **"Submit for Review"**

**Status:**
- Your app status will change to **"Waiting for Review"**
- Review typically takes **1-3 days**
- You'll receive email notifications about status changes

---

## 📊 **Phase 9: Review Process** (1-3 days)

### Possible Statuses:

1. **Waiting for Review** - In queue
2. **In Review** - Apple is testing your app
3. **Pending Developer Release** - Approved, waiting for you to release
4. **Ready for Sale** - Live on App Store
5. **Rejected** - Needs fixes (see rejection reasons)

### If Rejected:

1. Read rejection reasons carefully
2. Fix issues in your app
3. Update version/build number
4. Rebuild and resubmit
5. Add notes explaining fixes in App Store Connect

---

## 🎉 **Phase 10: Release Your App**

### Option A: Automatic Release

- Set to automatically release when approved
- App goes live immediately after approval

### Option B: Manual Release

1. When status changes to **"Pending Developer Release"**
2. Go to App Store Connect
3. Click **"Release This Version"**
4. App goes live within a few hours

---

## 🔄 **Updating Your App**

When you need to release an update:

1. **Update version numbers:**
   ```json
   // app.json
   {
     "expo": {
       "version": "1.0.1",  // Increment version
       "ios": {
         "buildNumber": "2"  // Increment build number
       }
     }
   }
   ```

2. **Build new version:**
   ```bash
   eas build --profile production --platform ios
   ```

3. **Submit update:**
   ```bash
   eas submit --platform ios --profile production
   ```

4. **Update App Store listing** (if needed)
5. **Submit for review**

---

## 🐛 **Troubleshooting**

### Build Fails

**Check:**
- All dependencies installed: `cd mobile && npm install`
- No syntax errors in code
- Environment variables are set: `eas secret:list`
- Bundle identifier matches App Store Connect

**Debug:**
```bash
eas build:list
# Click on failed build to see detailed logs
```

### Submission Fails

**Common issues:**
- Missing App Store Connect App ID
- Incorrect Apple Team ID
- Build not processed yet (wait 10-30 minutes)
- Missing required metadata in App Store Connect

**Fix:**
```bash
# Verify eas.json configuration
cat eas.json

# Check build status
eas build:list

# Try manual upload via App Store Connect
```

### App Rejected

**Common rejection reasons:**
- Missing privacy policy URL
- App crashes during testing
- Missing required permissions descriptions
- Incomplete app functionality
- Guideline violations

**Solution:**
1. Read rejection email carefully
2. Fix all mentioned issues
3. Update app and rebuild
4. Add explanation in App Store Connect notes
5. Resubmit

---

## 📋 **Quick Reference Commands**

```bash
# Login to Expo
eas login

# Initialize project
eas init

# Configure build
eas build:configure

# List secrets
eas secret:list

# Create secret
eas secret:create --scope project --name SECRET_NAME --value "value"

# Build iOS production
eas build --profile production --platform ios

# Submit to App Store
eas submit --platform ios --profile production

# View builds
eas build:list

# View credentials
eas credentials

# Configure iOS credentials
eas credentials --platform ios
```

---

## 📞 **Resources**

- **EAS Documentation:** https://docs.expo.dev/eas/
- **App Store Connect:** https://appstoreconnect.apple.com/
- **Apple Developer:** https://developer.apple.com/
- **App Store Review Guidelines:** https://developer.apple.com/app-store/review/guidelines/
- **Expo Forums:** https://forums.expo.dev/

---

## ✅ **Pre-Submission Checklist**

Before submitting, verify:

- [ ] Apple Developer account is active
- [ ] App created in App Store Connect
- [ ] `eas.json` has correct App Store Connect details
- [ ] All production secrets are set
- [ ] App builds successfully
- [ ] App tested on physical device
- [ ] All screenshots prepared (all required sizes)
- [ ] App description written
- [ ] Keywords selected
- [ ] Privacy policy URL is live
- [ ] Support URL is live
- [ ] App icon is 1024x1024 PNG
- [ ] Version and build numbers are correct
- [ ] All permissions have descriptions
- [ ] App doesn't crash during testing

---

## 🎯 **Timeline Estimate**

- **Apple Developer Account:** 1-2 days (approval)
- **App Store Connect Setup:** 30 minutes
- **App Configuration:** 15 minutes
- **Building App:** 30-60 minutes
- **App Store Listing:** 1-2 hours
- **Review Process:** 1-3 days
- **Total:** ~1 week (including review)

---

## 🎉 **You're Ready!**

Follow the phases in order, and your app will be on the App Store soon!

**Good luck! 🚀**


