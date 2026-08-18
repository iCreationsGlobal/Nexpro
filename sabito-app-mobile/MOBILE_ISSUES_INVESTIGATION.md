# Mobile App Issues Investigation & Fixes

## Issues Found

### 1. ❌ Web Users Can't Sign In to Mobile with Same Account

**Root Cause:**
- Many screens use hardcoded `getApiUrl()` functions that bypass the centralized `API_CONFIG.baseURL`
- These functions fallback to `localhost` or `192.168.0.167:4002` instead of production API
- Found **170 instances** across **36 files** using `getApiUrl()` or `API_BASE_URL`

**Impact:**
- Mobile app may be hitting wrong API endpoint
- No automatic token refresh on these calls
- Inconsistent API URL usage

**Fix:**
- Replace all `getApiUrl()` calls with `API_CONFIG.baseURL`
- Use centralized `apiClient` instead of direct `axios` calls
- Remove hardcoded API URLs

---

### 2. ❌ Google Auth Not Working on Mobile

**Root Cause:**
- Mobile sends authorization `code` to backend
- Backend expects redirect URI from request headers (`req.headers.origin` or `req.headers.referer`)
- Mobile apps don't send these headers, causing code exchange to fail
- Backend code tries to construct redirect URI but fails for mobile

**Backend Code Issue:**
```typescript
const redirectUri = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : '');
if (!redirectUri) {
  return res.status(400).json({ message: 'Cannot determine redirect URI...' });
}
```

**Mobile Code:**
- Uses reverse domain notation: `${clientIdReversed}:/oauthredirect`
- But backend doesn't know this format for mobile

**Fix:**
- Send redirect URI explicitly in request body from mobile
- Update backend to accept redirect URI from request body for mobile clients
- Or use a different endpoint for mobile Google auth

---

### 3. ❌ Pages Take Too Long to Load

**Root Causes:**
1. **Multiple API calls**: Many screens make direct axios calls instead of using cached `apiClient`
2. **No request optimization**: No batching or parallel request handling
3. **Hardcoded API URLs**: 170+ instances causing potential wrong endpoints
4. **No caching**: Repeated API calls for same data
5. **Blocking operations**: Synchronous operations blocking UI

**Performance Issues:**
- Business dashboard makes multiple sequential API calls
- No request deduplication
- No response caching
- Large payloads without pagination

**Fix:**
- Use centralized `apiClient` for all API calls
- Implement request caching
- Add request deduplication
- Optimize API calls (parallel where possible)
- Add loading states and optimistic updates

---

## Fixes Applied

See individual fix files for detailed changes.

