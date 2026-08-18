# How to Test Sentry During Development

## The Problem

Sentry doesn't work in Expo Go because it requires native modules. So how do you test error tracking during development?

## Solution Options

### Option 1: Development Build (RECOMMENDED) ⭐

Build a custom development client that includes native modules but still hot-reloads like Expo Go.

#### Steps:

1. **Install EAS CLI** (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo**:
   ```bash
   eas login
   ```

3. **Configure EAS** (if not already done):
   ```bash
   eas build:configure
   ```

4. **Build for iOS** (if you have a Mac):
   ```bash
   eas build --platform ios --profile development
   ```
   
   Or **Build for Android**:
   ```bash
   eas build --platform android --profile development
   ```

5. **Install the build on your device**:
   - iOS: EAS will provide a download link, or install via TestFlight
   - Android: Download the APK and install it

6. **Run the dev server**:
   ```bash
   npm start
   ```

7. **Open the development build** on your device
   - It will connect to your local dev server
   - Sentry will be fully functional
   - You get hot reload just like Expo Go!

#### Benefits:
- ✅ Sentry works perfectly
- ✅ Hot reload still works
- ✅ Can test all native features
- ✅ Connects to your local dev environment
- ✅ Best for testing production features in development

---

### Option 2: Production Build

Build and test the full production app:

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

#### Benefits:
- ✅ Exact production environment
- ✅ All features work as in production
- ❌ No hot reload (need to rebuild for changes)
- ❌ Slower iteration cycle

---

### Option 3: Continue with Expo Go for Now

For rapid development, keep using Expo Go and test Sentry later:

#### What works in Expo Go:
- ✅ All your app logic
- ✅ API calls
- ✅ UI/UX testing
- ✅ Most features
- ❌ Sentry (and other native modules)

#### When to use:
- Early development and prototyping
- UI/UX iterations
- Testing business logic
- Quick feature testing

#### Test Sentry when:
- Ready for production testing
- Need to verify error tracking
- Before final deployment

---

## Recommended Workflow

### Phase 1: Rapid Development (Current)
- Use **Expo Go** for fast iterations
- Test core functionality
- Build features quickly
- Don't worry about Sentry yet

### Phase 2: Feature Complete
- Build a **Development Build**
- Test Sentry integration
- Test all native features
- Verify error tracking

### Phase 3: Production Ready
- Build **Production Build**
- Final testing
- Deploy to stores

---

## Quick Start: Development Build

If you want to test Sentry right now:

```bash
# 1. Build development client for Android (faster)
eas build --platform android --profile development --local

# 2. Install the APK on your Android device

# 3. Start dev server
npm start

# 4. Open the dev build app on your device

# 5. Trigger a test error:
```

In your app, add a test button:

```javascript
import * as Sentry from '@sentry/react-native';

// Test Sentry
const testSentry = () => {
  Sentry.captureMessage('Test from development build!', 'info');
  Sentry.captureException(new Error('Test error from dev build'));
};
```

---

## Checking Sentry in Development Build

When you run a development build, you'll see:

```
✅ [Sentry] Initialized successfully
[Sentry] 📊 Configuration: {
  dsn: 'https://d88ee4684dbd...',
  environment: 'development',
  debug: true,
  tracesSampleRate: 1.0
}
✅ [Sentry] Test message sent to Sentry
```

Then check your Sentry dashboard at:
https://sentry.io → Your Project → Issues

---

## For Your Current Situation

Since you're actively developing:

1. **Keep using Expo Go** for now (it's faster)
2. **Build a development build** when you want to test:
   - Sentry error tracking
   - Push notifications (also requires native modules)
   - Any other native features

3. **Before production deployment**, do a full test with a production build

---

## Need Help?

- EAS Build docs: https://docs.expo.dev/build/introduction/
- Development builds: https://docs.expo.dev/develop/development-builds/introduction/
- Sentry docs: https://docs.sentry.io/platforms/react-native/

## TL;DR

**Right now**: Keep using Expo Go, Sentry will work in production
**To test Sentry**: Run `eas build --platform android --profile development`
**Production**: Everything works including Sentry ✅

