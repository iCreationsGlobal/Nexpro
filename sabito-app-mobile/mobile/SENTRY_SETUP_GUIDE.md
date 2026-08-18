# Sentry Setup Guide for Sabito Mobile App

## Overview

Sentry has been integrated into the Sabito mobile app for production error tracking and monitoring. This guide will help you complete the setup.

## What's Already Done ✅

1. ✅ Sentry package installed (`@sentry/react-native`)
2. ✅ Sentry configuration file created (`mobile/src/config/sentry.js`)
3. ✅ Sentry initialized in `App.js`
4. ✅ ErrorBoundary updated to send errors to Sentry
5. ✅ User context tracking added (on login)
6. ✅ EAS configuration updated to include `SENTRY_DSN` environment variable

## What You Need to Do

### Step 1: Create a Sentry Account

1. Go to https://sentry.io/signup/
2. Sign up for a free account (or log in if you already have one)
3. Create a new project:
   - Select **React Native** as the platform
   - Name it "Sabito Mobile" (or similar)
   - Click **Create Project**

### Step 2: Get Your Sentry DSN

1. After creating the project, Sentry will show you a **DSN** (Data Source Name)
2. It looks like: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`
3. **Copy this DSN** - you'll need it in the next step

### Step 3: Add Sentry DSN to EAS Secrets

Run this command to add your Sentry DSN as an EAS environment variable:

```bash
cd mobile
eas env:create --name SENTRY_DSN --value "YOUR_SENTRY_DSN_HERE" --type string --scope project
```

**Replace `YOUR_SENTRY_DSN_HERE` with your actual DSN from Step 2.**

When prompted:
- **Visibility**: Select `Sensitive` (since it contains credentials)
- **Environment**: Select `production` (or `all` if you want it for all environments)

### Step 4: Verify Configuration

Check that `eas.json` includes the Sentry DSN reference:

```json
"production": {
  "env": {
    ...
    "SENTRY_DSN": "$SENTRY_DSN"
  }
}
```

✅ This is already configured!

### Step 5: Rebuild Your App

After adding the Sentry DSN, rebuild your production app:

```bash
cd mobile
eas build --profile production --platform ios
```

## How It Works

### Error Tracking

- **Automatic Error Capture**: All unhandled errors and exceptions are automatically sent to Sentry
- **ErrorBoundary**: React component errors are caught and sent to Sentry
- **User Context**: When users log in, their user ID, email, and account type are attached to errors

### What Gets Tracked

1. **JavaScript Errors**: Unhandled exceptions, promise rejections
2. **React Errors**: Component errors caught by ErrorBoundary
3. **API Errors**: Network errors (can be enhanced further)
4. **User Context**: User ID, email, account type (when logged in)
5. **Device Info**: Platform, OS version, app version
6. **Performance**: Slow operations (10% sample rate in production)

### What's NOT Tracked (Privacy)

- Authorization headers (automatically filtered)
- Sensitive user data
- Passwords or tokens

## Viewing Logs in Sentry

1. Go to https://sentry.io
2. Log in to your account
3. Select your "Sabito Mobile" project
4. View:
   - **Issues**: All errors and exceptions
   - **Performance**: Slow operations and transactions
   - **Releases**: App versions and their error rates
   - **Users**: Affected users and their sessions

## Testing Sentry

To test that Sentry is working:

1. **Add a test error** (temporarily) in your app:
   ```javascript
   // In any screen, add a button that throws an error
   <Button onPress={() => { throw new Error('Test Sentry Error'); }}>
     Test Sentry
   </Button>
   ```

2. **Build and run** the app
3. **Trigger the error** by pressing the button
4. **Check Sentry dashboard** - you should see the error within a few seconds

5. **Remove the test code** before releasing!

## Manual Error Reporting

You can also manually send errors or messages to Sentry:

```javascript
import { captureException, captureMessage } from '../config/sentry';

// Capture an exception
try {
  // some code
} catch (error) {
  captureException(error, { 
    extra: { 
      userId: user.id,
      action: 'payment_processing'
    } 
  });
}

// Capture a message
captureMessage('User completed onboarding', 'info', {
  userId: user.id,
  accountType: user.accountType
});
```

## User Context Tracking

User context is automatically set when:
- User logs in (email/password or Google)
- App starts and user is already logged in

To manually set/clear user context:

```javascript
import { setSentryUser, clearSentryUser } from '../config/sentry';

// Set user (on login)
setSentryUser({
  id: user.id,
  email: user.email,
  username: user.name,
  accountType: user.accountType
});

// Clear user (on logout)
clearSentryUser();
```

## Environment-Specific Behavior

- **Development**: Sentry disabled in Expo Go (won't interfere with development)
- **Production**: Full error tracking enabled
- **Debug Mode**: More verbose logging when `DEBUG_MODE=true`

## Troubleshooting

### Sentry Not Capturing Errors

1. **Check DSN is set**: Verify `SENTRY_DSN` is in EAS secrets
   ```bash
   cd mobile
   eas env:list
   ```

2. **Check build logs**: Make sure DSN was included in the build
   ```bash
   cd mobile
   eas build:view [BUILD_ID]
   ```

3. **Check Sentry dashboard**: Errors may take a few seconds to appear

4. **Check app logs**: Look for Sentry initialization messages
   - Should see: `✅ [Sentry] Initialized successfully`
   - If you see: `⚠️ [Sentry] DSN not configured` - DSN is missing

### Too Many Errors

- Adjust `tracesSampleRate` in `mobile/src/config/sentry.js`
- Currently set to `0.1` (10%) in production
- Set to `0.0` to disable performance tracking (errors still tracked)

### Privacy Concerns

- Authorization headers are automatically filtered
- User data is only sent if you explicitly set it (via `setSentryUser`)
- No passwords or tokens are sent

## Next Steps

1. ✅ Complete Steps 1-5 above
2. ✅ Deploy a production build
3. ✅ Monitor Sentry dashboard for errors
4. ✅ Set up alerts (optional) in Sentry for critical errors
5. ✅ Review and fix errors as they appear

## Additional Resources

- [Sentry React Native Docs](https://docs.sentry.io/platforms/react-native/)
- [Sentry Dashboard](https://sentry.io)
- [EAS Environment Variables](https://docs.expo.dev/build-reference/variables/)

## Support

If you encounter issues:
1. Check Sentry dashboard for error details
2. Review build logs: `eas build:view [BUILD_ID]`
3. Check app logs on device (Xcode Console for iOS)
4. Verify DSN is correctly set in EAS secrets


