# 🚀 Deploy Sabito to App Store - Step-by-Step Guide

This guide will walk you through deploying your Sabito app to the Apple App Store.

## ✅ Current Status

- ✅ EAS CLI installed (v16.28.0)
- ✅ Logged into Expo as: `eamankyim`
- ✅ `app.json` configured with owner: `eamankyim`
- ✅ `eas.json` fixed (removed invalid fields)
- ⚠️ Project needs initialization
- ⚠️ App Store Connect credentials need to be added
- ⚠️ Production secrets need to be set

---

## 📋 Prerequisites Checklist

Before proceeding, ensure you have:

- [ ] **Apple Developer Account** ($99/year)
  - Sign up at: https://developer.apple.com
  - Wait for approval (usually 24-48 hours)
  
- [ ] **App created in App Store Connect**
  - Go to: https://appstoreconnect.apple.com
  - Create app with:
    - Name: **Sabito**
    - Bundle ID: **com.sabito.app**
    - SKU: **sabito-ios-001**
  - Note your **App Store Connect App ID** (10-digit number)
  - Note your **Apple Team ID** (from developer.apple.com/account)

- [ ] **Production API credentials ready:**
  - Production API URL
  - Paystack Live Public Key (pk_live_...)
  - Google OAuth iOS Client ID
  - Support content URL

---

## 🎯 Step-by-Step Deployment

### Step 1: Initialize EAS Project

```bash
cd mobile
eas init
```

This will:
- Link your app to Expo
- Generate a project ID
- Update your `app.json` with the project ID

**Expected output:** Project initialized successfully

---

### Step 2: Update eas.json with App Store Connect Details

Edit `mobile/eas.json` and update the `submit.production.ios` section:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "YOUR_APPLE_ID@example.com",
      "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
      "appleTeamId": "YOUR_APPLE_TEAM_ID"
    }
  }
}
```

**Replace:**
- `YOUR_APPLE_ID@example.com` → Your Apple ID email
- `YOUR_APP_STORE_CONNECT_APP_ID` → 10-digit App Store Connect App ID
- `YOUR_APPLE_TEAM_ID` → 10-character Apple Team ID

**Where to find these:**
- **Apple ID:** The email you use to sign into Apple Developer
- **App Store Connect App ID:** In App Store Connect → Your App → App Information
- **Apple Team ID:** developer.apple.com/account → Membership → Team ID

---

### Step 3: Set Production Environment Secrets

Add your production environment variables as EAS secrets:

```bash
cd mobile

# API Configuration
eas secret:create --scope project --name PROD_API_URL --value "https://api.sabito.com"

# Support Content URL
eas secret:create --scope project --name PROD_SUPPORT_URL --value "https://sabito.com/api/support/support-content.json"

# Paystack Live Public Key (IMPORTANT: Use LIVE key, not test key)
eas secret:create --scope project --name PROD_PAYSTACK_KEY --value "pk_live_YOUR_ACTUAL_LIVE_KEY"

# Google OAuth iOS Client ID
eas secret:create --scope project --name PROD_GOOGLE_IOS --value "YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"

# Optional: Android and Web (if deploying Android later)
eas secret:create --scope project --name PROD_GOOGLE_ANDROID --value "YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com"
eas secret:create --scope project --name PROD_GOOGLE_WEB --value "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
```

**Verify secrets are set:**
```bash
eas secret:list
```

You should see all your secrets listed.

---

### Step 4: Build Production iOS App

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
- Check progress at: https://expo.dev/accounts/eamankyim/projects/sabito/builds
- Builds typically take 15-30 minutes
- You'll receive an email when complete

**Important:** 
- First build may take longer (30-60 minutes)
- Make sure you have an active Apple Developer account
- EAS will handle certificate provisioning automatically

---

### Step 5: Test Your Build (Recommended)

Once the build completes:

1. Download the `.ipa` file from the build page
2. Install on a physical iOS device using:
   - **TestFlight** (recommended - see Step 6)
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

### Step 6: Submit to App Store Connect

#### Option A: Submit via EAS (Recommended)

```bash
cd mobile
eas submit --platform ios --profile production
```

**EAS will:**
1. Upload your `.ipa` to App Store Connect
2. Process the upload
3. Make it available in App Store Connect

#### Option B: Manual Upload via App Store Connect

1. Go to https://appstoreconnect.apple.com
2. Select your app
3. Go to **"TestFlight"** tab
4. Click **"+"** next to iOS builds
5. Upload your `.ipa` file
6. Wait for processing (10-30 minutes)

**Note:** You can use TestFlight for beta testing before submitting to the App Store.

---

### Step 7: Complete App Store Listing

Go to App Store Connect and fill in all required information:

#### 7.1 App Information

1. Click **"App Information"**
2. Fill in:
   - **Category:** Select appropriate categories (e.g., Business, Productivity)
   - **Subtitle:** Short tagline (30 characters max)
   - **Privacy Policy URL:** Required (must be live)
   - **Support URL:** Required (must be live)
   - **Marketing URL:** Optional

#### 7.2 Pricing and Availability

1. Click **"Pricing and Availability"**
2. Set:
   - **Price:** Free or Paid
   - **Availability:** All countries or specific regions

#### 7.3 App Privacy

1. Click **"App Privacy"**
2. Answer questions about data collection:
   - Camera usage ✅
   - Photo library access ✅
   - Location (if used) ✅
   - User data collection
   - Third-party data sharing

#### 7.4 Version Information

1. Click **"1.0 Prepare for Submission"**
2. Fill in required fields:

**App Store Screenshots (Required):**
- iPhone 6.7" Display: 1290 x 2796 pixels (at least 1, recommended 3-10)
- iPhone 6.5" Display: 1242 x 2688 pixels (at least 1, recommended 3-10)
- iPhone 5.5" Display: 1242 x 2208 pixels (at least 1, recommended 3-10)
- iPad Pro (12.9"): 2048 x 2732 pixels (if supporting iPad)
- iPad Pro (11"): 1668 x 2388 pixels (if supporting iPad)

**Description:**
- Up to 4000 characters
- First 3 lines are most important (shown in search results)
- Include keywords naturally
- Highlight key features

**Keywords:**
- Up to 100 characters
- Comma-separated, no spaces after commas
- Example: `business,marketing,networking,professional`

**App Icon:**
- 1024 x 1024 pixels
- PNG format
- No transparency
- Already configured: `mobile/assets/icon.png`

**Build Selection:**
- Scroll to **"Build"** section
- Click **"+"** to add build
- Select your uploaded build
- If no builds appear, wait a few minutes for processing

**Export Compliance:**
- **Does your app use encryption?** Usually "Yes"
- **Does your app use standard encryption?** Usually "Yes"

**Advertising Identifier (IDFA):**
- Answer based on whether you use ads or analytics

**Content Rights:**
- Confirm you have rights to all content

---

### Step 8: Submit for Review

1. Review all information one more time
2. Click **"Add for Review"** button
3. Answer any final questions
4. Click **"Submit for Review"**

**Status:**
- Your app status will change to **"Waiting for Review"**
- Review typically takes **1-3 days**
- You'll receive email notifications about status changes

---

### Step 9: Review Process (1-3 days)

**Possible Statuses:**

1. **Waiting for Review** - In queue
2. **In Review** - Apple is testing your app
3. **Pending Developer Release** - Approved, waiting for you to release
4. **Ready for Sale** - Live on App Store 🎉
5. **Rejected** - Needs fixes (see rejection reasons)

**If Rejected:**
1. Read rejection reasons carefully
2. Fix issues in your app
3. Update version/build number in `app.json`
4. Rebuild and resubmit
5. Add notes explaining fixes in App Store Connect

---

### Step 10: Release Your App

#### Option A: Automatic Release
- Set to automatically release when approved
- App goes live immediately after approval

#### Option B: Manual Release
1. When status changes to **"Pending Developer Release"**
2. Go to App Store Connect
3. Click **"Release This Version"**
4. App goes live within a few hours

---

## 🔄 Updating Your App

When you need to release an update:

1. **Update version numbers in `app.json`:**
   ```json
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

## 🐛 Troubleshooting

### Build Fails

**Check:**
- All dependencies installed: `npm install`
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

## 📋 Quick Reference Commands

```bash
# Login to Expo
eas login

# Initialize project
eas init

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

## 📞 Resources

- **EAS Documentation:** https://docs.expo.dev/eas/
- **App Store Connect:** https://appstoreconnect.apple.com/
- **Apple Developer:** https://developer.apple.com/
- **App Store Review Guidelines:** https://developer.apple.com/app-store/review/guidelines/
- **Expo Forums:** https://forums.expo.dev/

---

## ✅ Pre-Submission Checklist

Before submitting, verify:

- [ ] Apple Developer account is active
- [ ] App created in App Store Connect
- [ ] `eas.json` has correct App Store Connect details
- [ ] All production secrets are set (`eas secret:list`)
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

## 🎯 Timeline Estimate

- **Apple Developer Account:** 1-2 days (approval)
- **App Store Connect Setup:** 30 minutes
- **App Configuration:** 15 minutes
- **Building App:** 30-60 minutes
- **App Store Listing:** 1-2 hours
- **Review Process:** 1-3 days
- **Total:** ~1 week (including review)

---

## 🎉 You're Ready!

Follow the steps above in order, and your app will be on the App Store soon!

**Good luck! 🚀**


