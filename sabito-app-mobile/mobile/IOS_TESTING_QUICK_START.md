# 🚀 iOS Testing Quick Start

## ⚡ Fastest Way to Test on iOS (5 minutes)

### **Step 1: Install Expo Go on iPhone**
- Open **App Store** on your iPhone
- Search **"Expo Go"**
- Tap **Install**

### **Step 2: Start Expo Server**
```bash
cd mobile
npx expo start
```

### **Step 3: Connect iPhone**
- Open **Camera app** on iPhone (not Expo Go)
- Point at the **QR code** in terminal
- Tap the notification that appears
- App opens in Expo Go! 🎉

---

## 🔧 Alternative: Manual Connection

If QR code doesn't work:

1. **Get your computer's IP:**
   ```powershell
   ipconfig | findstr IPv4
   ```
   Example: `192.168.1.100`

2. **Open Expo Go app** on iPhone
3. **Tap "Enter URL manually"**
4. **Enter:** `exp://192.168.1.100:8081` (use your IP)
5. **Tap "Connect"**

---

## 🌐 If Network Doesn't Work: Use Tunnel

```bash
npx expo start --tunnel
```

This uses Expo's servers (slower but works anywhere)

---

## 📱 Testing Checklist

- [ ] App launches
- [ ] Login works
- [ ] Navigation works
- [ ] API calls succeed
- [ ] Images load
- [ ] Forms work

---

## 🐛 Troubleshooting

**"Unable to connect"**
- ✅ Same Wi-Fi network?
- ✅ Firewall blocking port 8081?
- ✅ Try tunnel mode: `npx expo start --tunnel`

**"Build failed"**
- ✅ Check `eas.json` configuration
- ✅ Verify Apple Developer account (for builds)

**"Permission denied"**
- ✅ Check `app.json` → `ios.infoPlist`
- ✅ Test on physical device

---

## 📖 Full Guide

See **[IOS_TESTING_GUIDE.md](./IOS_TESTING_GUIDE.md)** for:
- Development builds
- EAS Build setup
- Multiple testing methods
- Advanced configuration

---

## 🎯 Windows Users: Best Options

✅ **Expo Go** - Easiest (no build needed)  
✅ **EAS Build** - Cloud builds (works on Windows)  
❌ **iOS Simulator** - Requires macOS  
❌ **Local builds** - Requires macOS + Xcode

---

**Ready? Run `.\test-ios.ps1` for interactive setup!** 🚀


