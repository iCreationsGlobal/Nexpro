# 🚀 Production Readiness: Chats & Notifications

This document outlines the production configuration for real-time chats and push notifications in the Sabito mobile app.

## ✅ What's Been Configured

### 1. **Socket.IO (Real-time Chat)**
- ✅ Uses `API_CONFIG.baseURL` from environment variables
- ✅ Automatically handles HTTPS → WSS conversion
- ✅ Infinite reconnection attempts for production
- ✅ Proper WebSocket transport with polling fallback
- ✅ Connection timeout and error handling
- ✅ Auto-connects when user is logged in

### 2. **Push Notifications**
- ✅ Uses `apiClient` which respects environment variables
- ✅ Retry mechanism for failed token registrations
- ✅ Handles pending tokens when user logs in
- ✅ Production timeout settings (10 seconds)
- ✅ Proper error handling without blocking app

### 3. **Environment Configuration**
- ✅ Production API URL: `https://api.sabito.app`
- ✅ Configured in `eas.json` for production builds
- ✅ Fallback to production URL if env var missing

---

## 🔧 Production Build Configuration

### EAS Build Settings

Your `eas.json` already has production configuration:

```json
{
  "build": {
    "production": {
      "env": {
        "APP_ENV": "production",
        "API_URL": "https://api.sabito.app",
        "ENABLE_PUSH_NOTIFICATIONS": "true"
      }
    }
  }
}
```

### Building for Production

```bash
# Build iOS for production
eas build --profile production --platform ios

# Build Android for production
eas build --profile production --platform android
```

---

## 🔍 Verification Checklist

Before deploying to production, verify:

### Socket.IO Connection
- [ ] Backend Socket.IO server is running on `https://api.sabito.app`
- [ ] WebSocket endpoint is accessible (should auto-upgrade from HTTP)
- [ ] CORS is configured to allow mobile app origins
- [ ] Authentication token is properly validated on socket connection

### Push Notifications
- [ ] Expo push notification service is configured
- [ ] Backend `/api/notifications/register-token` endpoint works
- [ ] Backend can send push notifications via Expo
- [ ] iOS APNs certificates are configured (if using native builds)
- [ ] Android FCM is configured (if using native builds)

### Environment Variables
- [ ] `API_URL` is set to `https://api.sabito.app` in production build
- [ ] No hardcoded localhost URLs remain
- [ ] All API calls use `API_CONFIG.baseURL`

---

## 🐛 Troubleshooting

### Socket Connection Issues

**Problem: Socket won't connect in production**
- Check backend Socket.IO server is running
- Verify `API_URL` is correct in production build
- Check network logs for connection errors
- Ensure WebSocket is enabled on server

**Problem: Socket disconnects frequently**
- Check network stability
- Verify reconnection settings (already set to infinite)
- Check server-side timeout settings

### Push Notification Issues

**Problem: Notifications not received**
- Verify push token is registered: Check `AsyncStorage` for `pushToken`
- Check backend logs for token registration
- Verify Expo push notification service is working
- Test with Expo's push notification tool

**Problem: Token registration fails**
- Check `pendingPushToken` in AsyncStorage (retry mechanism)
- Verify user is logged in (needs access token)
- Check backend endpoint is accessible
- Verify API timeout settings

---

## 📱 Testing in Production

### Test Socket Connection

1. **Open app and login**
2. **Check console logs:**
   ```
   ✅ Socket connection initialized
   ✅ Socket connected: [socket-id]
   ```

3. **Send a test message in chat**
4. **Verify message appears in real-time**

### Test Push Notifications

1. **Register for notifications:**
   - App should request permission on first launch
   - Check console: `✅ Push notification token registered`

2. **Send test notification from backend:**
   ```bash
   # Use Expo's push notification tool or backend API
   curl -X POST https://api.sabito.app/api/notifications/send-test
   ```

3. **Verify notification received on device**

---

## 🔐 Security Considerations

### Socket.IO
- ✅ Uses JWT token authentication
- ✅ Token validated on connection
- ✅ Secure WebSocket (WSS) in production

### Push Notifications
- ✅ Tokens stored securely in AsyncStorage
- ✅ Tokens sent over HTTPS
- ✅ Tokens removed on logout

---

## 📊 Monitoring

### What to Monitor

1. **Socket Connection Rate**
   - Track successful connections vs failures
   - Monitor reconnection attempts

2. **Push Token Registration**
   - Track successful registrations
   - Monitor failed registrations and retries

3. **Message Delivery**
   - Track messages sent vs received
   - Monitor delivery failures

### Logging

Production logs are minimized (only errors logged):
- Socket errors logged to console
- Push notification errors logged to console
- Consider integrating with Sentry for production error tracking

---

## 🚀 Deployment Steps

1. **Verify Backend:**
   ```bash
   # Ensure backend is running on production URL
   curl https://api.sabito.app/health
   ```

2. **Build Production App:**
   ```bash
   eas build --profile production --platform ios
   eas build --profile production --platform android
   ```

3. **Test on TestFlight/Internal Testing:**
   - Install production build
   - Test chat functionality
   - Test push notifications

4. **Submit to App Stores:**
   ```bash
   eas submit --platform ios
   eas submit --platform android
   ```

---

## 📝 Notes

- Socket connections automatically retry on failure
- Push tokens are retried if initial registration fails
- All services gracefully degrade if they fail (app continues to work)
- Production builds use optimized settings (no debug logs, proper timeouts)

---

## ✅ Summary

Your mobile app is configured for production with:
- ✅ Real-time chat via Socket.IO
- ✅ Push notifications via Expo
- ✅ Proper environment variable handling
- ✅ Error handling and retry mechanisms
- ✅ Production-ready configuration

**Ready for production deployment!** 🎉

