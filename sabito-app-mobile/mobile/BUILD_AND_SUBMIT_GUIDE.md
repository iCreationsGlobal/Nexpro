# 🏗️ Build and Submit Guide - Sabito iOS App

Step-by-step guide to build and submit your app to the App Store.

---

## ✅ **PREREQUISITES CHECKLIST**

Before building, ensure you have:

- [ ] Apple Developer account active ($99/year)
- [ ] App created in App Store Connect
- [ ] App Store Connect App ID noted (10-digit number)
- [ ] Apple Team ID noted (from developer.apple.com/account)
- [ ] `eas.json` updated with your credentials
- [ ] Production API URL ready
- [ ] Paystack Live Public Key ready (`pk_live_...`)
- [ ] Google OAuth iOS Client ID ready
- [ ] Support content URL ready
- [ ] Privacy Policy URL live and accessible

---

## 🔧 **STEP 1: UPDATE eas.json**

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
- `YOUR_APPLE_TEAM_ID` → 10-character Apple Team ID (e.g., `2GP52ZDJYZ`)

---

## 🔐 **STEP 2: SET PRODUCTION SECRETS**

Add your production environment variables as EAS secrets:

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

You should see all your secrets listed.

---

## 🚀 **STEP 3: INITIALIZE EAS PROJECT** (If not done)

```bash
cd mobile
eas init
```

This will:
- Link your app to Expo
- Generate a project ID
- Update your `app.json` with the project ID

**Note:** If you already ran `eas init`, skip this step.

---

## 🏗️ **STEP 4: BUILD PRODUCTION iOS APP**

Build your production iOS app:

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
- Builds typically take 15-30 minutes (first build may take 30-60 minutes)
- You'll receive an email when complete

**Important Notes:**
- First build may take longer (30-60 minutes)
- Make sure you have an active Apple Developer account
- EAS will handle certificate provisioning automatically
- You can monitor progress in the Expo dashboard

---

## 📤 **STEP 5: SUBMIT TO APP STORE CONNECT**

Once the build completes, submit it to App Store Connect:

```bash
cd mobile
eas submit --platform ios --profile production
```

**EAS will:**
1. Upload your `.ipa` to App Store Connect
2. Process the upload
3. Make it available in App Store Connect

**Alternative: Manual Upload**
If `eas submit` doesn't work, you can manually upload:
1. Download the `.ipa` file from the build page
2. Go to App Store Connect → Your App → TestFlight
3. Click "+" next to iOS builds
4. Upload your `.ipa` file
5. Wait for processing (10-30 minutes)

---

## ⏳ **STEP 6: WAIT FOR BUILD PROCESSING**

After uploading, wait for Apple to process your build:
- **Processing time:** 10-30 minutes
- **Status:** Check in App Store Connect → Your App → TestFlight
- **When ready:** Build will appear in the "Build" section of your app version

---

## 📝 **STEP 7: COMPLETE APP STORE LISTING**

Go to App Store Connect and fill in all required information:

### **7.1 App Information**
1. Click **"App Information"**
2. Fill in:
   - **Category:** Select appropriate categories (e.g., Business, Productivity)
   - **Subtitle:** Short tagline (30 characters max)
   - **Privacy Policy URL:** Required (must be live)
   - **Support URL:** Required (must be live)
   - **Marketing URL:** Optional

### **7.2 Pricing and Availability**
1. Click **"Pricing and Availability"**
2. Set:
   - **Price:** Free or Paid
   - **Availability:** All countries or specific regions

### **7.3 App Privacy**
1. Click **"App Privacy"**
2. Answer questions about data collection:
   - Camera usage ✅
   - Photo library access ✅
   - Location (if used) ✅
   - User data collection
   - Third-party data sharing

### **7.4 Version Information**
1. Click **"1.0 Prepare for Submission"**
2. Fill in:
   - **Screenshots:** Upload at least 1 for iPhone 6.5" Display
   - **Description:** Copy from `APP_STORE_CONTENT.md`
   - **Keywords:** Copy from `APP_STORE_CONTENT.md`
   - **Support URL:** Your support URL
   - **Marketing URL:** Your marketing URL (optional)
   - **Build:** Select your uploaded build
   - **Export Compliance:** Answer encryption questions
   - **Contact Information:** Fill in your details
   - **Sign-In Information:** Provide test account (if app requires login)

**See `APP_STORE_CONTENT.md` for all content.**

---

## ✅ **STEP 8: SUBMIT FOR REVIEW**

1. Review all information one more time
2. Click **"Add for Review"** button
3. Answer any final questions
4. Click **"Submit for Review"**

**Status:**
- Your app status will change to **"Waiting for Review"**
- Review typically takes **1-3 days**
- You'll receive email notifications about status changes

---

## 📊 **STEP 9: REVIEW PROCESS** (1-3 days)

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

## 🎉 **STEP 10: RELEASE YOUR APP**

### **Option A: Automatic Release** (Recommended)
- Set to automatically release when approved
- App goes live immediately after approval

### **Option B: Manual Release**
1. When status changes to **"Pending Developer Release"**
2. Go to App Store Connect
3. Click **"Release This Version"**
4. App goes live within a few hours

---

## 🔄 **UPDATING YOUR APP**

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

## 🐛 **TROUBLESHOOTING**

### **Build Fails**

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

### **Submission Fails**

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

### **App Rejected**

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

## 📋 **QUICK REFERENCE COMMANDS**

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

## ✅ **PRE-SUBMISSION CHECKLIST**

Before submitting, verify:

- [ ] Apple Developer account is active
- [ ] App created in App Store Connect
- [ ] `eas.json` has correct App Store Connect details
- [ ] All production secrets are set (`eas secret:list`)
- [ ] App builds successfully
- [ ] Build uploaded to App Store Connect
- [ ] Build processed and available
- [ ] All screenshots prepared (at least 1 for iPhone 6.5")
- [ ] App description written (from `APP_STORE_CONTENT.md`)
- [ ] Keywords added (from `APP_STORE_CONTENT.md`)
- [ ] Privacy policy URL is live
- [ ] Support URL is live
- [ ] App icon is 1024x1024 PNG
- [ ] Version and build numbers are correct
- [ ] All permissions have descriptions
- [ ] Contact information filled in
- [ ] Sign-in information provided (if app requires login)

---

## 🎯 **TIMELINE ESTIMATE**

- **Building App:** 30-60 minutes
- **Uploading to App Store Connect:** 5-10 minutes
- **Build Processing:** 10-30 minutes
- **App Store Listing:** 1-2 hours
- **Review Process:** 1-3 days
- **Total:** ~1 week (including review)

---

## 🎉 **YOU'RE READY!**

Follow the steps above in order, and your app will be on the App Store soon!

**Good luck! 🚀**


