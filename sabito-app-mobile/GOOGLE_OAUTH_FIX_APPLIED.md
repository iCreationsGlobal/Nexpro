# Google OAuth iOS Fix Applied

## What Was Wrong

When you tried to sign in with Google on iOS, the backend was:
1. Receiving the authorization code from the mobile app ✅
2. Trying to exchange it using the **WEB** client ID and **WEB** client secret ❌
3. Google rejected it with "invalid_grant" because iOS apps don't use client secrets

## What Was Fixed

### Backend Changes:

1. **Updated `googleAuth.controller.ts`** - Both sign-in and sign-up endpoints now:
   - Detect iOS apps by checking if redirect URI contains `googleusercontent.apps`
   - Use `GOOGLE_IOS_CLIENT_ID` for iOS apps
   - Don't send client secret for iOS (iOS OAuth doesn't use secrets)
   - Still use client secret for web OAuth

2. **Added iOS Client ID** to:
   - `services/user-service/.env` → `GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID.apps.googleusercontent.com`
   - `services/user-service/src/config/environment.ts` → Added to config exports

## Next Steps

1. **Restart your backend server:**
   ```bash
   cd services/user-service
   npm run dev
   ```

2. **Test Google Sign-In on mobile:**
   - Open the app in Expo Go
   - Tap "Continue with Google"
   - Should work now! ✅

## How It Works Now

```
Mobile App → Google → Authorization Code
↓
Backend receives code + redirect URI
↓
Checks redirect URI:
  - Contains "googleusercontent.apps"? → iOS app
    ✅ Use GOOGLE_IOS_CLIENT_ID
    ✅ No client secret
  - Otherwise → Web app
    ✅ Use GOOGLE_CLIENT_ID
    ✅ Use client secret
↓
Exchange code for tokens → Success! ✅
```

## Testing Checklist

- [ ] Backend server restarted
- [ ] Google Sign-In works on iOS
- [ ] Google Sign-Up works on iOS
- [ ] No more "invalid_grant" error
- [ ] User can login successfully

## Environment Variables

Make sure these are set in your `.env` (never commit real values):
```
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_WEB_CLIENT_SECRET
GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
```

All set! 🎉

