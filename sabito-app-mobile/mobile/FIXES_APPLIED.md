# Mobile App Fixes Applied

## ✅ Fix 1: Google Auth Not Working on Mobile

### Problem
- Mobile app sends authorization code to backend
- Backend couldn't determine redirect URI (mobile apps don't send `origin` header)
- Code exchange failed

### Solution
1. **Mobile**: Updated `googleSignIn()` to accept and send `redirectUri` parameter
2. **Mobile**: Extract redirect URI from OAuth request and send it to backend
3. **Backend**: Updated to accept `redirectUri` from request body (for mobile) before falling back to headers (for web)

### Files Changed
- `mobile/src/api/auth.js` - Added `redirectUri` parameter to `googleSignIn()`
- `mobile/src/screens/auth/LoginScreen.js` - Extract and send redirect URI
- `mobile/src/screens/auth/SignupProfileScreen.js` - Extract and send redirect URI
- `mobile/src/services/googleAuth.js` - Store redirect URI in request
- `services/user-service/src/controllers/googleAuth.controller.ts` - Accept redirect URI from request body

### Testing
- Test Google sign-in on mobile
- Test Google sign-up on mobile
- Verify web Google auth still works

---

## ✅ Fix 2: Web Users Can't Sign In to Mobile - LoginScreen

### Problem
- LoginScreen uses hardcoded `getApiUrl()` function
- Falls back to `localhost` or `192.168.0.167:4002` instead of production API
- Direct axios call bypasses centralized API client

### Solution
- Removed `getApiUrl()` function
- Use centralized `apiClient` instead of direct `axios` calls
- Use `API_CONFIG.baseURL` from centralized config

### Files Changed
- `mobile/src/screens/auth/LoginScreen.js` - Use `apiClient` instead of direct axios

### Remaining Work
- **170+ instances** across **36 files** still use `getApiUrl()` or `API_BASE_URL`
- Need to replace all with centralized `apiClient` and `API_CONFIG.baseURL`
- This is a larger refactoring task

---

## ⚠️ Fix 3: Pages Take Too Long to Load (Partially Addressed)

### Problem
- Multiple hardcoded API URLs causing wrong endpoints
- Direct axios calls bypass token refresh
- No request caching or optimization

### Solution Applied
- Fixed LoginScreen to use centralized API client
- This ensures proper token refresh and correct API URL

### Remaining Work
- Replace all `getApiUrl()` instances (170+ files)
- Implement request caching
- Add request deduplication
- Optimize API calls (parallel where possible)

---

## Next Steps

1. **Test Google Auth**: Verify mobile Google sign-in/sign-up works
2. **Test Login**: Verify web users can sign in to mobile
3. **Refactor API Calls**: Replace remaining `getApiUrl()` instances
4. **Performance**: Implement caching and optimization

---

## Testing Checklist

- [ ] Google sign-in on mobile (iOS)
- [ ] Google sign-up on mobile (iOS)
- [ ] Email/password login on mobile (web user account)
- [ ] Verify API calls use correct production URL
- [ ] Check Sentry for any new errors

