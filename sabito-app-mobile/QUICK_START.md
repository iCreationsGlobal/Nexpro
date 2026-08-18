# ⚡ Quick Start - Get Your App Built in 30 Minutes!

The fastest way to get your Sabito mobile app built and ready for testing.

---

## 🎯 **3 Simple Steps**

### Step 1: Install & Login (5 minutes)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo (create account if needed at expo.dev)
eas login

# Go to mobile directory
cd mobile

# Initialize project
eas init
```

---

### Step 2: Add Your Secrets (10 minutes)

#### **Get Your Values Ready:**

Before running the commands, have these ready:
- ✅ Your production API URL (e.g., `https://api.sabito.com`)
- ✅ Paystack LIVE public key (starts with `pk_live_`)
- ✅ Google OAuth client IDs (iOS, Android, Web)

#### **Run These Commands:**

Open `SETUP_COMMANDS.sh`, replace the placeholder values with your real ones, then run:

```bash
bash SETUP_COMMANDS.sh
```

**OR** Copy-paste these commands one by one:

```bash
# 1. API Configuration
eas secret:create --scope project --name PROD_API_URL \
  --value "https://api.sabito.com"

eas secret:create --scope project --name PROD_SUPPORT_URL \
  --value "https://sabito.com/api/support/support-content.json"

# 2. Paystack (REPLACE WITH YOUR REAL LIVE KEY!)
eas secret:create --scope project --name PROD_PAYSTACK_KEY \
  --value "pk_live_YOUR_REAL_KEY_HERE"

# 3. Google OAuth (REPLACE WITH YOUR REAL CLIENT IDs!)
eas secret:create --scope project --name PROD_GOOGLE_IOS \
  --value "your-ios-id.apps.googleusercontent.com"

eas secret:create --scope project --name PROD_GOOGLE_ANDROID \
  --value "your-android-id.apps.googleusercontent.com"

eas secret:create --scope project --name PROD_GOOGLE_WEB \
  --value "your-web-id.apps.googleusercontent.com"
```

#### **Verify:**
```bash
eas secret:list
```
You should see 6 secrets! ✅

---

### Step 3: Build Your App (15 minutes)

```bash
# Build for Android (fastest, good for testing)
eas build --profile development --platform android
```

**That's it!** 🎉

EAS will:
- Upload your code
- Build the app in the cloud
- Give you a download link

---

## 📱 **Download & Test**

1. Click the link EAS provides
2. Download the `.apk` file
3. Install on your Android device
4. Test the app!

---

## 🚀 **Next Steps**

### Ready for Production?

```bash
# Build production version for both platforms
eas build --profile production --platform all
```

### Submit to App Stores?

See `PRODUCTION_GUIDE.md` for complete instructions on:
- Apple App Store submission
- Google Play Store submission
- App store assets requirements

---

## 🐛 **Troubleshooting**

### "Command not found: eas"
```bash
npm install -g eas-cli
```

### "Authentication required"
```bash
eas login
```

### "Secret already exists"
```bash
# Delete and recreate
eas secret:delete --name SECRET_NAME
eas secret:create --scope project --name SECRET_NAME --value "new_value"
```

### Build Failed?
1. Check build logs at expo.dev
2. Verify all secrets are set correctly: `eas secret:list`
3. Run `npm install` in mobile directory
4. Try again!

---

## 📊 **Timeline**

| Step | Time | What Happens |
|------|------|--------------|
| Install & Login | 5 min | One-time setup |
| Add Secrets | 10 min | Configure production values |
| Build App | 15 min | EAS builds in cloud |
| **Total** | **30 min** | Ready to test! |

---

## ✅ **Success Checklist**

- [ ] EAS CLI installed
- [ ] Logged into Expo
- [ ] Project initialized (`eas init`)
- [ ] 6 secrets added (`eas secret:list`)
- [ ] First build started
- [ ] Build completed successfully
- [ ] App downloaded and tested

---

## 🎉 **You're Done!**

Your app is built and ready for testing!

**For detailed instructions, see:** `PRODUCTION_GUIDE.md`

**Need help?** Check the troubleshooting section above or visit [docs.expo.dev/eas](https://docs.expo.dev/eas/)

---

**Pro Tip:** Build the development version first to test everything, then build production when you're ready for the app stores! 🚀

