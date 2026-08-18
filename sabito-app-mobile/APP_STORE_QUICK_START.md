# 🚀 App Store Quick Start Checklist

Follow these steps in order to deploy your app to the App Store.

---

## ✅ **Step 1: Prerequisites** (1-2 days)

- [ ] Apple Developer Account ($99/year) - [Sign up](https://developer.apple.com)
- [ ] Expo account - [Sign up](https://expo.dev)
- [ ] EAS CLI installed: `npm install -g eas-cli`
- [ ] Logged into Expo: `eas login`

---

## ✅ **Step 2: App Store Connect Setup** (30 min)

- [ ] Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
- [ ] Create new app:
  - Name: **Sabito**
  - Bundle ID: **com.sabito.app**
  - SKU: **sabito-ios-001**
- [ ] Note your **App Store Connect App ID** (10-digit number)
- [ ] Note your **Apple Team ID** (from developer.apple.com/account)

---

## ✅ **Step 3: Configure Your Project** (15 min)

- [ ] Update `eas.json` with your details:
  ```json
  "submit": {
    "production": {
      "ios": {
        "appleId": "YOUR_APPLE_ID@example.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_TEAM_ID"
      }
    }
  }
  ```

- [ ] Initialize EAS (if not done):
  ```bash
  cd mobile
  eas init
  ```

- [ ] Configure build:
  ```bash
  eas build:configure
  ```

---

## ✅ **Step 4: Add Production Secrets** (10 min)

```bash
cd mobile

# Add your production secrets
eas secret:create --scope project --name PROD_API_URL --value "https://api.sabito.com"
eas secret:create --scope project --name PROD_SUPPORT_URL --value "https://sabito.com/api/support/support-content.json"
eas secret:create --scope project --name PROD_PAYSTACK_KEY --value "pk_live_YOUR_LIVE_KEY"
eas secret:create --scope project --name PROD_GOOGLE_IOS --value "YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"

# Verify
eas secret:list
```

---

## ✅ **Step 5: Build Your App** (30-60 min)

```bash
cd mobile
eas build --profile production --platform ios
```

- [ ] Wait for build to complete (check at expo.dev)
- [ ] Download `.ipa` file
- [ ] Test on physical iOS device

---

## ✅ **Step 6: Submit to App Store** (15 min)

```bash
cd mobile
eas submit --platform ios --profile production
```

Or upload manually via App Store Connect.

---

## ✅ **Step 7: Complete App Store Listing** (1-2 hours)

In App Store Connect, fill in:

- [ ] **App Information:**
  - Category
  - Subtitle
  - Privacy Policy URL (required)
  - Support URL (required)

- [ ] **Pricing:** Free or Paid

- [ ] **App Privacy:** Answer data collection questions

- [ ] **Version Information:**
  - Screenshots (all required sizes)
  - Description (up to 4000 characters)
  - Keywords (up to 100 characters)
  - App Icon (1024x1024 PNG)
  - Select your uploaded build

- [ ] **Export Compliance:** Answer encryption questions

---

## ✅ **Step 8: Submit for Review** (5 min)

- [ ] Review all information
- [ ] Click **"Submit for Review"**
- [ ] Wait for review (1-3 days)

---

## ✅ **Step 9: Release**

- [ ] When approved, release your app
- [ ] App goes live on App Store! 🎉

---

## 📚 **Need More Details?**

See the full guide: `APP_STORE_DEPLOYMENT_GUIDE.md`

---

## 🆘 **Common Issues**

**Build fails?**
- Check: `eas build:list` for error logs
- Verify: All secrets are set (`eas secret:list`)
- Run: `npm install` in mobile directory

**Submission fails?**
- Verify: `eas.json` has correct App Store Connect details
- Check: Build is fully processed (wait 10-30 min)
- Try: Manual upload via App Store Connect

**App rejected?**
- Read rejection email carefully
- Fix all mentioned issues
- Update version/build number
- Rebuild and resubmit

---

**Good luck! 🚀**


