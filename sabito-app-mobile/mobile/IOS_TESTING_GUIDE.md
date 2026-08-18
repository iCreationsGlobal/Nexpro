# 📱 iOS Testing Guide for Sabito Mobile App

## 🎯 Overview

This guide covers all methods to test the Sabito mobile app on iOS devices. Since you're on Windows, you have several options for iOS testing.

---

## 🚀 **Method 1: Expo Go on Physical iOS Device (Easiest - Recommended for Development)**

This is the fastest way to test on a real iOS device without any build process.

### **Prerequisites:**
- ✅ Physical iPhone/iPad
- ✅ iPhone and computer on the same Wi-Fi network
- ✅ Expo Go app installed from App Store

### **Steps:**

#### **1. Install Expo Go on Your iPhone**
- Open App Store on your iPhone
- Search for "Expo Go"
- Install the app

#### **2. Start Expo Development Server**
```bash
cd mobile
npx expo start
```

**Expected Output:**
```
Metro waiting on exp://192.168.0.167:8081
› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press r │ reload app
› Press m │ toggle menu
```

#### **3. Connect Your iPhone**

**Option A: Scan QR Code (Recommended)**
- In the Expo terminal, you'll see a QR code
- Open the **Camera app** on your iPhone (not Expo Go)
- Point it at the QR code
- Tap the notification that appears
- Expo Go will open with your app

**Option B: Manual Connection**
- Open **Expo Go** app on your iPhone
- Tap "Enter URL manually"
- Enter: `exp://192.168.0.167:8081` (use your computer's IP)
- Tap "Connect"

#### **4. Troubleshooting Connection Issues**

**If QR code doesn't work:**
```bash
# Make sure both devices are on same network
# Check your computer's IP address:
# Windows PowerShell:
ipconfig | findstr IPv4

# Use that IP in Expo Go app
```

**If connection fails:**
- Ensure firewall allows port 8081
- Try using tunnel mode:
```bash
npx expo start --tunnel
```
- This uses Expo's servers (slower but more reliable)

---

## 🏗️ **Method 2: Development Build on Physical iOS Device**

This creates a standalone app with your custom native code. Better for testing features that require native modules.

### **Prerequisites:**
- ✅ Expo account (free)
- ✅ EAS CLI installed
- ✅ Apple Developer account ($99/year) - **Required for physical device**
- ✅ macOS computer (for building) OR use EAS Build cloud service

### **Steps:**

#### **1. Install EAS CLI**
```bash
npm install -g eas-cli
```

#### **2. Login to Expo**
```bash
eas login
```

#### **3. Configure EAS Build**

Your `eas.json` is already configured! Check that it has:
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": false  // Set to false for physical device
      }
    }
  }
}
```

#### **4. Build for iOS Development**

**Option A: Build Locally (Requires macOS)**
```bash
eas build --profile development --platform ios --local
```

**Option B: Build in Cloud (Recommended - Works on Windows)**
```bash
eas build --profile development --platform ios
```

This will:
- Upload your code to Expo's servers
- Build the iOS app in the cloud
- Provide a download link or TestFlight link

#### **5. Install on Device**

**If using EAS Build:**
- Download the `.ipa` file
- Install via TestFlight (if configured) or direct install
- Open the app and connect to your dev server

**Start dev server:**
```bash
npx expo start --dev-client
```

---

## 🖥️ **Method 3: iOS Simulator (Requires macOS)**

If you have access to a Mac, you can use the iOS Simulator.

### **Steps:**

#### **1. Install Xcode**
- Download from Mac App Store (free, ~12GB)
- Install Xcode Command Line Tools:
```bash
xcode-select --install
```

#### **2. Start Expo with iOS Simulator**
```bash
cd mobile
npx expo start --ios
```

This will:
- Automatically open iOS Simulator
- Install Expo Go in simulator
- Load your app

#### **3. Alternative: Open Simulator Manually**
```bash
# Start Expo
npx expo start

# In another terminal, open simulator
open -a Simulator

# Then press 'i' in Expo terminal to open iOS
```

---

## ☁️ **Method 4: Cloud-Based iOS Simulator (Works on Windows)**

Use cloud services to access iOS simulators from Windows.

### **Option A: BrowserStack (Paid)**
- Sign up at browserstack.com
- Upload your app or use their Expo integration
- Test on real iOS devices in the cloud

### **Option B: Sauce Labs (Paid)**
- Similar to BrowserStack
- Real device testing in cloud

### **Option C: Expo Snack (Free - Limited)**
- Go to snack.expo.dev
- Paste your code
- Test in browser-based iOS simulator
- Limited native features

---

## 🧪 **Testing Checklist for iOS**

### **Basic Functionality:**
- [ ] App launches without crashes
- [ ] Login flow works
- [ ] Navigation between screens
- [ ] API calls succeed
- [ ] Images load correctly
- [ ] Forms submit properly

### **iOS-Specific:**
- [ ] Safe area insets (notch/status bar)
- [ ] Keyboard behavior
- [ ] Swipe gestures
- [ ] Pull-to-refresh
- [ ] Camera permissions
- [ ] Photo library permissions
- [ ] Location permissions
- [ ] Push notifications (if implemented)

### **Device Testing:**
- [ ] iPhone SE (small screen)
- [ ] iPhone 13/14 (standard)
- [ ] iPhone 14 Pro Max (large screen)
- [ ] iPad (if `supportsTablet: true`)

---

## 🔧 **iOS-Specific Configuration**

### **Check `app.json` iOS Settings:**

Your current config:
```json
{
  "ios": {
    "supportsTablet": true,
    "bundleIdentifier": "com.sabito.app",
    "buildNumber": "1",
    "infoPlist": {
      "NSCameraUsageDescription": "...",
      "NSPhotoLibraryUsageDescription": "...",
      "NSMicrophoneUsageDescription": "..."
    }
  }
}
```

### **Update Bundle Identifier (if needed):**
```json
{
  "ios": {
    "bundleIdentifier": "com.yourcompany.sabito"
  }
}
```

### **Add More Permissions (if needed):**
```json
{
  "ios": {
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "Sabito needs location to show nearby businesses.",
      "NSLocationAlwaysUsageDescription": "Sabito needs location for background features."
    }
  }
}
```

---

## 🐛 **Common iOS Testing Issues**

### **Issue: "Unable to connect to Metro"**
**Solution:**
- Ensure same Wi-Fi network
- Check firewall settings
- Try tunnel mode: `npx expo start --tunnel`
- Restart Expo: `npx expo start --clear`

### **Issue: "Build failed"**
**Solution:**
- Check `eas.json` configuration
- Verify Apple Developer account is active
- Check build logs: `eas build:list`
- Ensure all dependencies are compatible

### **Issue: "Permission denied"**
**Solution:**
- Check `infoPlist` in `app.json`
- Ensure permission descriptions are clear
- Test on physical device (simulator may not show all permissions)

### **Issue: "App crashes on launch"**
**Solution:**
- Check Expo Go version matches Expo SDK version
- Clear cache: `npx expo start --clear`
- Check for native module compatibility
- Review error logs in Expo Go

---

## 📊 **Recommended Testing Workflow**

### **For Daily Development:**
1. ✅ Use **Method 1 (Expo Go)** - Fastest iteration
2. ✅ Test on physical iPhone
3. ✅ Use tunnel mode if Wi-Fi issues

### **For Pre-Release Testing:**
1. ✅ Use **Method 2 (Development Build)**
2. ✅ Test on multiple iOS versions
3. ✅ Test on different device sizes
4. ✅ Test all permissions and native features

### **For CI/CD:**
1. ✅ Use **EAS Build** in cloud
2. ✅ Automate builds on git push
3. ✅ Distribute via TestFlight

---

## 🚀 **Quick Start Commands**

```bash
# Start Expo (for Expo Go)
cd mobile
npx expo start

# Start Expo with tunnel (if local network issues)
npx expo start --tunnel

# Start Expo for development build
npx expo start --dev-client

# Build iOS development version (cloud)
eas build --profile development --platform ios

# Build iOS for TestFlight
eas build --profile production --platform ios

# Submit to App Store
eas submit --platform ios
```

---

## 📱 **Testing on Multiple iOS Versions**

### **Using Expo Go:**
- Install Expo Go from App Store (uses latest iOS)
- For older iOS versions, you need older devices or simulators

### **Using Development Builds:**
- Build with specific iOS deployment target in `app.json`:
```json
{
  "ios": {
    "deploymentTarget": "13.0"  // Minimum iOS version
  }
}
```

---

## ✅ **Next Steps**

1. **Choose your testing method** (Method 1 recommended to start)
2. **Install Expo Go** on your iPhone
3. **Start Expo server**: `cd mobile && npx expo start`
4. **Scan QR code** with iPhone Camera app
5. **Start testing!** 🎉

---

## 📞 **Need Help?**

If you encounter issues:
1. Check Expo documentation: docs.expo.dev
2. Check EAS Build logs: `eas build:list`
3. Review error messages in Expo Go
4. Check network connectivity

---

## 🎯 **Summary**

**Best for Windows users:**
- ✅ **Method 1 (Expo Go)** - Easiest, no build needed
- ✅ **Method 2 (EAS Build)** - For production-like testing

**Not available on Windows:**
- ❌ iOS Simulator (requires macOS)
- ❌ Local iOS builds (requires macOS + Xcode)

**Recommended workflow:**
1. Develop and test with Expo Go (Method 1)
2. Build development version before release (Method 2)
3. Use EAS Build cloud service (works on Windows!)

---

Happy Testing! 🚀📱


