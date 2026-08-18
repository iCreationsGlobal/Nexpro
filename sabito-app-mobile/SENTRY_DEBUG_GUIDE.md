# Sentry Debug Guide for Mobile App

## Problem
Sentry logs are not appearing for mobile app, only for frontend.

## What I Fixed

### 1. Enhanced Sentry Initialization
- Added multiple fallback methods to find `SENTRY_DSN`
- Added comprehensive logging to see what's happening
- Added test message on successful initialization

### 2. Added SENTRY_DSN to Environment Map
- Added `SENTRY_DSN` to `DOT_ENV_MAP` in `env.js`
- Now it can be loaded from `.env` file

### 3. Better Error Tracking
- Added logging when sending exceptions/messages
- Shows if Sentry is initialized before sending

## How to Check if Sentry is Working

### Step 1: Check App Logs on Launch

When the app starts, you should see:

**✅ If Sentry is working:**
```
[Sentry] 🔍 Checking Sentry configuration...
[Sentry] 📋 Configuration check: { hasDsn: true, dsnPrefix: 'https://xxx@xxx...', environment: 'production' }
✅ [Sentry] Initialized successfully
[Sentry] 📊 Configuration: { dsn: 'https://xxx@xxx...', environment: 'production', ... }
✅ [Sentry] Test message sent to Sentry
```

**❌ If Sentry is NOT working:**
```
[Sentry] 🔍 Checking Sentry configuration...
[Sentry] 📋 Configuration check: { hasDsn: false, dsnPrefix: 'NOT FOUND', ... }
⚠️ [Sentry] DSN not configured. Skipping Sentry initialization.
⚠️ [Sentry] To enable Sentry:
   1. Add SENTRY_DSN to EAS secrets: eas env:create --name SENTRY_DSN --value "YOUR_DSN"
   2. Or add to app.json extra field
   3. Or add to .env file
```

### Step 2: Check Where SENTRY_DSN Should Be

Sentry will try to find `SENTRY_DSN` in this order:

1. **EAS Build Secrets** (Recommended for production)
   ```bash
   eas env:create --name SENTRY_DSN --value "https://xxx@xxx.ingest.sentry.io/xxx" --type string --scope project
   ```
   - This is set in `eas.json` as `"SENTRY_DSN": "$SENTRY_DSN"`
   - Only works in EAS builds, not in Expo Go

2. **app.json extra field**
   ```json
   {
     "expo": {
       "extra": {
         "SENTRY_DSN": "https://xxx@xxx.ingest.sentry.io/xxx"
       }
     }
   }
   ```
   - Works in all builds
   - ⚠️ **Not recommended** - exposes DSN in code

3. **.env file** (Development only)
   ```env
   SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
   ```
   - Works in development
   - Must be added to `.gitignore`

4. **process.env** (EAS builds)
   - Automatically set by EAS if configured in secrets

### Step 3: Verify EAS Secrets

```bash
# List all environment variables
eas env:list

# Check if SENTRY_DSN exists
eas env:list | grep SENTRY_DSN

# If missing, create it
eas env:create --name SENTRY_DSN --value "YOUR_DSN_HERE" --type string --scope project
```

### Step 4: Test Sentry Manually

Add this to any screen to test Sentry:

```javascript
import { captureMessage, captureException } from '../config/sentry';

// Test message
<Button onPress={() => captureMessage('Test Sentry from Mobile', 'info')}>
  Test Sentry Message
</Button>

// Test exception
<Button onPress={() => captureException(new Error('Test Sentry Exception'))}>
  Test Sentry Exception
</Button>
```

You should see in logs:
```
[Sentry] 📤 Sending message to Sentry: { message: 'Test Sentry from Mobile', level: 'info' }
✅ [Sentry] Message sent successfully
```

Then check your Sentry dashboard - the message should appear within seconds.

## Common Issues

### Issue 1: "DSN not configured"

**Symptoms:**
- Logs show: `⚠️ [Sentry] DSN not configured`
- No Sentry logs in dashboard

**Solutions:**
1. Check if `SENTRY_DSN` is in EAS secrets:
   ```bash
   eas env:list | grep SENTRY_DSN
   ```

2. If missing, add it:
   ```bash
   eas env:create --name SENTRY_DSN --value "YOUR_DSN" --type string --scope project
   ```

3. Rebuild the app:
   ```bash
   eas build --platform ios --profile production
   ```

### Issue 2: "Not initialized" warnings

**Symptoms:**
- Logs show: `⚠️ [Sentry] Not initialized. Not sending error to Sentry.`
- Errors are logged but not sent to Sentry

**Solutions:**
- This means `initSentry()` failed or DSN is missing
- Check app launch logs for Sentry initialization errors
- Verify DSN is correct format: `https://xxx@xxx.ingest.sentry.io/xxx`

### Issue 3: Sentry works in development but not production

**Possible Causes:**
1. **EAS secrets not set** - DSN only in `.env` (development only)
2. **Wrong build profile** - Using development profile instead of production
3. **DSN format wrong** - Check DSN is valid

**Solutions:**
1. Add DSN to EAS secrets (not just `.env`)
2. Use production build profile
3. Verify DSN format in Sentry dashboard

### Issue 4: Sentry works on frontend but not mobile

**Possible Causes:**
1. **Different DSN** - Frontend and mobile use different Sentry projects
2. **Mobile DSN not configured** - Only frontend has DSN set
3. **Build-time vs runtime** - Mobile needs build-time configuration

**Solutions:**
1. Check if mobile has its own Sentry project (recommended)
2. Verify mobile DSN is set in EAS secrets
3. Rebuild mobile app after adding DSN

## Debugging Steps

### 1. Check Current Configuration

Look at app logs on launch:
```bash
# In React Native Debugger or Metro bundler
# Look for [Sentry] logs
```

### 2. Verify DSN Format

Your DSN should look like:
```
https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

### 3. Test in Development

Add to `mobile/.env`:
```env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

Then check logs - should see:
```
✅ [Sentry] Initialized successfully
```

### 4. Test in Production Build

1. Add DSN to EAS secrets
2. Rebuild app
3. Check logs on app launch
4. Send test message
5. Check Sentry dashboard

## Expected Logs

### On App Launch (Success)
```
[Sentry] 🔍 Checking Sentry configuration...
[Sentry] 📋 Configuration check: { hasDsn: true, dsnPrefix: 'https://xxx@xxx...', environment: 'production' }
✅ [Sentry] Initialized successfully
[Sentry] 📊 Configuration: { dsn: 'https://xxx@xxx...', environment: 'production', debug: false, tracesSampleRate: 0.1 }
✅ [Sentry] Test message sent to Sentry
```

### When Sending Error (Success)
```
[Sentry] 📤 Sending exception to Sentry: { errorMessage: 'Test error', errorName: 'Error', contextKeys: [] }
✅ [Sentry] Exception sent successfully
```

### On App Launch (Failure)
```
[Sentry] 🔍 Checking Sentry configuration...
[Sentry] 📋 Configuration check: { hasDsn: false, dsnPrefix: 'NOT FOUND', ... }
⚠️ [Sentry] DSN not configured. Skipping Sentry initialization.
```

## Next Steps

1. **Check your app logs** on launch - look for `[Sentry]` messages
2. **Verify EAS secrets** - run `eas env:list | grep SENTRY_DSN`
3. **Add DSN if missing** - use `eas env:create`
4. **Rebuild app** - DSN changes require rebuild
5. **Test manually** - use `captureMessage()` to test
6. **Check Sentry dashboard** - should see test messages

## Quick Test

Add this to `App.js` after `initSentry()`:

```javascript
import { captureMessage } from './src/config/sentry';

// After initSentry() call
setTimeout(() => {
  captureMessage('App started - Sentry test', 'info');
}, 2000);
```

If you see this in logs:
```
✅ [Sentry] Message sent successfully
```

And the message appears in Sentry dashboard, then Sentry is working! 🎉

