# 🎯 Next Steps to Deploy to App Store

## ✅ What's Been Done

1. ✅ Fixed `eas.json` configuration (removed invalid fields)
2. ✅ Updated `app.json` with your Expo username (`eamankyim`)
3. ✅ Removed placeholder project ID (will be set by `eas init`)
4. ✅ Created comprehensive deployment guide (`DEPLOY_TO_APP_STORE_NOW.md`)

## 🚀 Immediate Next Steps

### Step 1: Get Your Apple Developer Account Ready

**If you don't have an Apple Developer account yet:**
1. Go to https://developer.apple.com
2. Sign up for Apple Developer Program ($99/year)
3. Wait for approval (usually 24-48 hours)

**If you already have an Apple Developer account:**
1. Go to https://appstoreconnect.apple.com
2. Sign in with your Apple Developer account
3. Create a new app:
   - Name: **Sabito**
   - Bundle ID: **com.sabito.app** (or select existing)
   - SKU: **sabito-ios-001**
   - Platform: **iOS**
4. Note your **App Store Connect App ID** (10-digit number)
5. Note your **Apple Team ID** (from developer.apple.com/account → Membership)

### Step 2: Update eas.json with Your Credentials

Edit `mobile/eas.json` and replace the placeholder values in the `submit.production.ios` section:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "YOUR_APPLE_ID@example.com",        // ← Replace with your Apple ID
      "ascAppId": "1234567890",                       // ← Replace with your App Store Connect App ID
      "appleTeamId": "ABCD123456"                     // ← Replace with your Apple Team ID
    }
  }
}
```

### Step 3: Initialize EAS Project

Run this command in your terminal:

```bash
cd mobile
eas init
```

This will:
- Link your app to Expo
- Generate a project ID
- Update your `app.json` automatically

### Step 4: Set Production Secrets

Add your production environment variables. Replace the placeholder values with your actual production credentials:

```bash
cd mobile

# API Configuration (replace with your production API URL)
eas secret:create --scope project --name PROD_API_URL --value "https://api.sabito.com"

# Support Content URL (replace with your actual support URL)
eas secret:create --scope project --name PROD_SUPPORT_URL --value "https://sabito.com/api/support/support-content.json"

# Paystack Live Public Key (IMPORTANT: Use LIVE key, not test key!)
eas secret:create --scope project --name PROD_PAYSTACK_KEY --value "pk_live_YOUR_ACTUAL_LIVE_KEY"

# Google OAuth iOS Client ID (replace with your actual iOS client ID)
eas secret:create --scope project --name PROD_GOOGLE_IOS --value "YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"

# Optional: Android and Web (if deploying Android later)
eas secret:create --scope project --name PROD_GOOGLE_ANDROID --value "YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com"
eas secret:create --scope project --name PROD_GOOGLE_WEB --value "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
```

**Verify secrets are set:**
```bash
eas secret:list
```

### Step 5: Build Your App

Once all secrets are set, build your production iOS app:

```bash
cd mobile
eas build --profile production --platform ios
```

This will:
- Upload your code to Expo's servers
- Build your app in the cloud
- Sign it with your Apple Developer certificate
- Provide a download link when complete

**Build Status:**
- Check progress at: https://expo.dev/accounts/eamankyim/projects/sabito/builds
- Builds typically take 15-30 minutes (first build may take longer)

### Step 6: Submit to App Store

Once the build completes:

```bash
cd mobile
eas submit --platform ios --profile production
```

This will upload your app to App Store Connect.

### Step 7: Complete App Store Listing

Go to App Store Connect and complete:
- App Information (category, subtitle, privacy policy URL, support URL)
- Pricing and Availability
- App Privacy questions
- Version Information:
  - Screenshots (all required sizes - see `APP_STORE_ASSETS_REQUIREMENTS.md`)
  - Description (up to 4000 characters)
  - Keywords (up to 100 characters)
  - Select your uploaded build
  - Export compliance questions

### Step 8: Submit for Review

Click "Submit for Review" in App Store Connect. Review typically takes 1-3 days.

---

## 📚 Detailed Guides

For more detailed information, see:
- **Full Deployment Guide:** `DEPLOY_TO_APP_STORE_NOW.md`
- **Assets Requirements:** `APP_STORE_ASSETS_REQUIREMENTS.md`
- **Quick Start:** `APP_STORE_QUICK_START.md`

---

## ⚠️ Important Notes

1. **Apple Developer Account Required:** You need an active Apple Developer account ($99/year) to deploy to the App Store.

2. **Production Credentials:** Make sure you're using **LIVE** credentials, not test/staging credentials:
   - Use `pk_live_...` for Paystack (not `pk_test_...`)
   - Use production API URL
   - Use production Google OAuth client IDs

3. **App Store Connect Setup:** You must create the app in App Store Connect before submitting. The app needs to exist there first.

4. **Screenshots Required:** You'll need screenshots for all required device sizes. See `APP_STORE_ASSETS_REQUIREMENTS.md` for details.

5. **Privacy Policy Required:** Apple requires a live privacy policy URL. Make sure yours is accessible.

---

## 🆘 Need Help?

If you encounter issues:
1. Check the troubleshooting section in `DEPLOY_TO_APP_STORE_NOW.md`
2. Review EAS build logs: `eas build:list`
3. Check Expo documentation: https://docs.expo.dev/eas/

---

## ✅ Checklist

Before building, make sure you have:

- [ ] Apple Developer account active
- [ ] App created in App Store Connect
- [ ] App Store Connect App ID noted
- [ ] Apple Team ID noted
- [ ] `eas.json` updated with your credentials
- [ ] Production API URL ready
- [ ] Paystack Live Public Key ready
- [ ] Google OAuth iOS Client ID ready
- [ ] Support content URL ready
- [ ] Privacy policy URL live and accessible

---

**Ready to start? Begin with Step 1 above! 🚀**


