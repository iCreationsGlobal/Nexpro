# How to Install Your Development Build

## The Issue

You built a development client, which is a **custom native app**. It cannot be opened with Expo Go (which is what QR code scanning uses).

## ✅ Solution: Download & Install the APK

### Step 1: Get the Download Link

The build output showed this link:
```
https://expo.dev/accounts/eamankyim/projects/sabito/builds/3fc82dd9-5212-4dc6-9bb8-e9495459c5b9
```

### Step 2: Download on Your Android Phone

**Option A: Open Link Directly on Phone**
1. On your Android phone, open a browser
2. Go to: https://expo.dev/accounts/eamankyim/projects/sabito/builds/3fc82dd9-5212-4dc6-9bb8-e9495459c5b9
3. Tap "Download" button
4. Save the APK file

**Option B: Send Link to Phone**
1. Email/WhatsApp yourself the link
2. Open on your phone
3. Tap the link
4. Download the APK

### Step 3: Install the APK

1. Open the downloaded APK file
2. Android will ask: "Install unknown app?"
3. Tap "Settings"
4. Enable "Allow from this source"
5. Go back and tap "Install"
6. Wait for installation to complete
7. Tap "Open"

### Step 4: Start Your Dev Server

**On your computer:**
```bash
cd mobile
npm start
```

You should see:
```
› Metro waiting on exp://192.168.0.167:8081
```

### Step 5: Open the App

1. Open the "Sabito" app you just installed on your phone
2. It will automatically connect to your dev server
3. The app will load!

## 🎯 What You'll See

Once connected:
```
✅ [Sentry] Initialized successfully  ← Sentry works!
✅ [Sentry] Test message sent to Sentry
```

Then check your Sentry dashboard to see the error tracking working!

## ⚠️ Important Notes

1. **Not Expo Go:** This is a custom app, not Expo Go
2. **Dev Server Required:** Your computer must be running `npm start`
3. **Same Network:** Phone and computer must be on same WiFi
4. **Hot Reload Works:** Code changes will still reload automatically!

## 🔄 If Connection Fails

### Make sure:
1. Dev server is running (`npm start`)
2. Both devices on same WiFi network
3. Firewall allows port 8081
4. Try restarting the app

### Check the dev server shows:
```
› Metro waiting on exp://YOUR_IP:8081
```

Your phone should connect to that IP automatically.

## 📱 The Difference

| Expo Go | Development Build |
|---------|-------------------|
| Scans QR codes | No QR scanning |
| Limited features | All native features |
| No Sentry | ✅ Sentry works |
| No custom native | ✅ Full native access |

## 🎉 Success Indicators

You'll know it's working when:
1. App opens without errors
2. You can login
3. Sentry logs appear in console
4. Sentry dashboard shows events

## Need Help?

If you still have issues:
1. Share the error message you see
2. Check console output from `npm start`
3. Try rebuilding: `eas build --platform android --profile development`

