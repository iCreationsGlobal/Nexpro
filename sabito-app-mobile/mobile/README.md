# 📱 Sabito Mobile App

React Native mobile application for the Sabito referral and partnership platform.

---

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)

**Mac/Linux:**
```bash
chmod +x setup-env.sh
./setup-env.sh
npm start --reset-cache
```

**Windows:**
```bash
setup-env.bat
npm start --reset-cache
```

### Option 2: Manual Setup

```bash
# 1. Copy environment template
cp .env.example .env.development

# 2. Edit .env.development
# - iOS Simulator: Use localhost
# - Android Emulator: Use 10.0.2.2
# - Physical Device: Use your local IP

# 3. Start the app
npm start --reset-cache
```

---

## 📚 Documentation

| Document | Purpose | Time |
|----------|---------|------|
| **[QUICK_START.md](./QUICK_START.md)** | Fix network errors fast | 3 min |
| **[ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)** | Complete setup guide | 10 min |
| **[ENVIRONMENT_MIGRATION_COMPLETE.md](./ENVIRONMENT_MIGRATION_COMPLETE.md)** | What we changed | 5 min |
| **[SUPPORT_CONTENT_CONFIG.md](./SUPPORT_CONTENT_CONFIG.md)** | Support content docs | 5 min |
| **[IOS_TESTING_GUIDE.md](./IOS_TESTING_GUIDE.md)** | iOS testing guide | 10 min |

---

## 🔧 Environment Configuration

All configuration is managed through environment files:

```
.env.development   ← Local development
.env.production    ← Production builds
.env.example       ← Template (commit this)
```

### Key Variables

```bash
# Backend & Support
API_URL=http://localhost:4002
SUPPORT_CONTENT_URL=http://localhost:5174/api/support/support-content.json

# Feature Flags
ENABLE_DARK_MODE=true
ENABLE_BIOMETRIC_AUTH=true
ENABLE_PUSH_NOTIFICATIONS=true

# Debug
DEBUG_MODE=true
LOG_LEVEL=verbose
```

**See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for complete list.**

---

## 🏗️ Project Structure

```
mobile/
├── App.js                     # Main app entry
├── app.json                   # Expo configuration
├── src/
│   ├── api/                   # API clients
│   ├── components/            # Reusable components
│   ├── config/
│   │   └── env.js            # ✨ Centralized config
│   ├── constants/            # Colors, sizes, themes
│   ├── context/              # React context providers
│   ├── hooks/                # Custom hooks
│   │   └── useSupportContent.js  # ✨ Support content hook
│   ├── navigation/           # App navigation
│   ├── screens/              # App screens
│   ├── services/             # Services (auth, images, etc)
│   └── utils/                # Utility functions
├── .env.development          # Development config
├── .env.production           # Production config
└── .env.example              # Template
```

---

## 🎯 Key Features

### Implemented
✅ Authentication (Email/Password + Google OAuth)  
✅ Dark Mode Support  
✅ Business & Marketer Dashboards  
✅ Referral Management  
✅ Project Tracking  
✅ Real-time Chat  
✅ Push Notifications  
✅ Payment Integration (Paystack)  
✅ Help & Support (Content from website)  
✅ Privacy & Security Settings  
✅ Team Management  
✅ Reports & Analytics  

---

## 🌐 Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| iOS Simulator | ✅ | Use `localhost` URLs |
| Android Emulator | ✅ | Use `10.0.2.2` URLs |
| iOS Device | ✅ | Use local IP |
| Android Device | ✅ | Use local IP |

---

## 🐛 Troubleshooting

### "Network request failed"
**Solution:** Wrong URL for your platform. See [QUICK_START.md](./QUICK_START.md)

### Environment variables not loading
**Solution:** Restart Metro with cache clear:
```bash
npm start --reset-cache
```

### Support content not loading
**Check:**
1. ✅ Sabito-website running on `localhost:5174`
2. ✅ Correct URL in `.env.development`
3. ✅ Metro restarted after changing `.env`

**See full troubleshooting in [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)**

---

## 🔒 Security

### ⚠️ NEVER Commit These Files:
- `.env.development`
- `.env.production`
- `.env` (any environment file)

### ✅ Safe to Commit:
- `.env.example` (template only)
- `src/config/env.js` (code only)

**Already protected in `.gitignore`**

---

## 📦 Dependencies

### Core
- React Native (Expo)
- React Navigation
- AsyncStorage
- Axios

### UI
- React Native Paper
- Lucide React Native (icons)
- React Native Gesture Handler

### Authentication
- Expo Auth Session
- Google Sign-In

### Other
- Paystack React Native
- Expo Constants

---

## 🚀 Scripts

```bash
# Start development server
npm start

# Start with cache clear
npm start --reset-cache

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Build for production
npm run build

# Run tests
npm test
```

---

## 🎨 Theme

The app supports **Light** and **Dark** modes with system detection:

```javascript
import { useTheme } from './src/context/ThemeContext';

const { theme, toggleTheme } = useTheme();
// theme: 'light', 'dark', or 'system'
```

**Colors:**
- Primary: `#1CA700` (Green)
- Secondary: `#1E3A8A` (Navy Blue)
- Success: `#10B981`
- Error: `#EF4444`

---

## 📱 App Features by Role

### Business Users
- Dashboard with stats
- Manage marketers & partnerships
- Review & approve referrals
- Create & track projects
- Team management
- Subscription management
- Payment tracking

### Marketer Users
- Browse businesses
- Apply for partnerships
- Create referrals
- Track earnings
- View active projects
- Performance reports

### Admin Users
- Platform oversight
- Approve businesses
- Monitor all activity
- Manage users
- Platform configuration
- Reports & analytics

---

## 🔄 Development Workflow

### 1. Setup (One Time)
```bash
# Install dependencies
npm install

# Setup environment
./setup-env.sh  # or setup-env.bat on Windows
```

### 2. Daily Development
```bash
# Start backend
cd ../services/user-service
npm start

# Start website (for support content)
cd ../Sabito-website
npm run dev

# Start mobile app
cd ../mobile
npm start
```

### 3. Making Changes
```bash
# After changing .env files
npm start --reset-cache

# After installing packages
npm install
npm start --reset-cache
```

---

## 🧪 Testing

### iOS Testing (Windows Users)
**Quick Start:**
```powershell
# Run the iOS testing helper script
.\test-ios.ps1
```

**Or manually:**
1. Install Expo Go from App Store on your iPhone
2. Run `npx expo start` in the mobile directory
3. Scan QR code with iPhone Camera app
4. App opens in Expo Go

**See [IOS_TESTING_GUIDE.md](./IOS_TESTING_GUIDE.md) for complete guide**

### Manual Testing
1. Open app on simulator/device
2. Check console for config logs
3. Navigate to Help & Support
4. Verify content loads

### Verify Configuration
```javascript
import { logConfig, validateConfig } from './src/config/env';

logConfig();     // Print all config
validateConfig(); // Validate required values
```

---

## 📊 Build & Release

### Development Build
```bash
eas build --platform android --profile development
eas build --platform ios --profile development
```

### Production Build
```bash
# Ensure .env.production has live URLs
eas build --platform android --profile production
eas build --platform ios --profile production
```

### Submit to Stores
```bash
eas submit --platform android
eas submit --platform ios
```

---

## 🤝 Contributing

1. Create `.env.development` from `.env.example`
2. Update URLs for your platform
3. Start development servers
4. Make changes
5. Test thoroughly
6. Submit PR

**Never commit `.env` files!**

---

## 📝 License

Proprietary - Sabito Platform

---

## 🆘 Need Help?

1. **Quick Fix:** [QUICK_START.md](./QUICK_START.md)
2. **Full Docs:** [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)
3. **What Changed:** [ENVIRONMENT_MIGRATION_COMPLETE.md](./ENVIRONMENT_MIGRATION_COMPLETE.md)
4. **Check Config:**
   ```javascript
   import { logConfig } from './src/config/env';
   logConfig();
   ```

---

**Built with ❤️ for Sabito Platform**
