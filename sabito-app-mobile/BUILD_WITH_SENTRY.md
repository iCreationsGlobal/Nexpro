# Build Command with Sentry

## Production iOS Build

Run this command in your terminal:

```bash
cd mobile
eas build --profile production --platform ios
```

## What to Expect

1. **Apple Account Login**: You'll be prompted to log in to your Apple Developer account
   - Enter your Apple ID: `eamankyim@gmail.com`
   - Enter your password
   - Complete 2FA if prompted

2. **Build Process**: The build will:
   - ✅ Include Sentry DSN from EAS secrets
   - ✅ Use production environment variables
   - ✅ Upload to EAS Build servers
   - ✅ Generate iOS app (.ipa file)

3. **Build Time**: Usually takes 10-20 minutes

## Verify Sentry is Included

You should see in the build output:
```
Environment variables loaded from the "production" build profile "env" configuration: 
... SENTRY_DSN ...
```

## After Build Completes

1. **Download the build** from EAS dashboard or TestFlight
2. **Install on device** or submit to App Store
3. **Test Sentry** by triggering an error (or wait for real errors)
4. **Check Sentry Dashboard**: https://sentry.io/organizations/sabito/projects/sabito-mobile-ios/

## Quick Test

To verify Sentry is working, you can temporarily add this to any screen:

```javascript
import { captureMessage } from '../config/sentry';

// Test button
<Button onPress={() => captureMessage('Test Sentry Integration', 'info')}>
  Test Sentry
</Button>
```

Then check your Sentry dashboard - you should see the message appear within seconds!

