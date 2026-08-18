# 🔧 Google OAuth Redirect URI Fix

## Problem
Getting `unauthorized_client` error when trying to sign in with Google on iOS.

## Root Cause
The redirect URI being used doesn't match what's configured in Google Cloud Console.

## Solution

### Step 1: Check Current Redirect URI
The app is currently trying to use:
```
com.googleusercontent.apps.YOUR_IOS_CLIENT_ID:/oauthredirect
```

### Step 2: Configure Redirect URI in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **Credentials**
4. Find your **iOS OAuth Client ID** (the one ending in `-<your-ios-client-id-suffix>`)
5. Click **Edit**
6. Under **Authorized redirect URIs**, add:
   ```
   com.sabito.app:/oauthredirect
   ```
7. **Save**

### Step 3: Verify app.json Configuration

Make sure `app.json` has the correct scheme:
```json
{
  "expo": {
    "scheme": "com.sabito.app"
  }
}
```

### Step 4: Test

After updating Google Cloud Console:
1. Restart the Expo app
2. Try Google Sign-In again
3. Check console logs for the redirect URI being used

## Alternative: Use Reversed Client ID Format

If you prefer to use the reversed client ID format (current approach), ensure this redirect URI is added to Google Cloud Console:
```
com.googleusercontent.apps.YOUR_IOS_CLIENT_ID:/oauthredirect
```

## Current Code Configuration

The code now uses:
- **Redirect URI**: `com.sabito.app:/oauthredirect` (bundle identifier format)
- **Client ID**: iOS OAuth Client ID from environment variables
- **Response Type**: Code (authorization code flow)
- **PKCE**: Enabled for security

## Testing

After making changes:
1. Clear app cache: `npx expo start --clear`
2. Test Google Sign-In
3. Check logs for redirect URI confirmation

