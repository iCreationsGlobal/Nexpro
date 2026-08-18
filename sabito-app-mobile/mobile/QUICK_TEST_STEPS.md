# 🚀 QUICK TEST STEPS

## ✅ Backend Status: RUNNING ✓
Backend is accessible at: `http://192.168.0.167:4002`

---

## 📱 **Start Testing Now:**

### **1. Restart Expo (In your Expo terminal)**
Press `r` to reload the app, or if you need to restart:
```bash
cd mobile
npx expo start --clear
```

### **2. Test Upgrade Banner (Phase 1)**

#### On Your Phone:
1. **Open the app** → Login as a marketer
2. **Go to Dashboard** (Home tab)
3. **Look for GREEN BANNER** above your balance card:
   ```
   ┌─────────────────────────────────────┐
   │  ✨  Go Professional                │
   │  Unlock AI Matching, Public         │
   │  Profile & More                     │
   │  [Learn More]                       │
   └─────────────────────────────────────┘
   ```

4. **Click "Learn More"**
   - Should open upgrade screen
   - See Monthly (GHS 50) / Yearly (GHS 500) options
   - See 5 features listed
   - See "Upgrade Now" button at bottom

5. **Try toggling Monthly/Yearly**
   - Click each option
   - Price should update
   - "Save 17%" badge on yearly

---

### **3. Test Visibility Toggle (Phase 2)**

#### Prerequisites:
You need a Professional marketer account. Two ways:

**Option A: Manually set in AsyncStorage (for testing)**
```javascript
// In your app, add this temporarily to set user as professional:
import AsyncStorage from '@react-native-async-storage/async-storage';

// Run once:
const user = JSON.parse(await AsyncStorage.getItem('user'));
user.subscriptionPlan = 'professional';
user.visibilityMode = 'private';
await AsyncStorage.setItem('user', JSON.stringify(user));
// Then reload app
```

**Option B: Actually upgrade (requires payment)**
- Complete the upgrade flow from Step 2

#### After becoming Professional:
1. **Go to Account tab** (bottom navigation)
2. **Look for "Professional Settings"** section:
   ```
   ┌─────────────────────────────────────┐
   │  ✨ PRO  Professional Settings      │
   │                                     │
   │  🔒  Profile Visibility             │
   │  🔒 Private - Only you initiate...  │
   │                          [Switch]   │
   └─────────────────────────────────────┘
   ```

3. **Toggle the switch**
   - Should show loading spinner
   - Icon changes: 🔒 → 🌐
   - Text changes: "Private..." → "Public..."
   - Success alert appears

4. **Toggle back**
   - Should change back to private
   - Icon: 🌐 → 🔒

---

## 🎯 **What to Look For:**

### ✅ **Success Signs:**
- ✅ Upgrade banner visible on dashboard
- ✅ Banner opens upgrade screen
- ✅ Billing options toggle correctly
- ✅ Professional Settings visible (after upgrade)
- ✅ Visibility toggle works
- ✅ Loading states show
- ✅ Success messages appear

### ❌ **Potential Issues:**
- ❌ Banner not showing → Check user.subscriptionPlan is 'free' or null
- ❌ Professional Settings not showing → Check user.subscriptionPlan === 'professional'
- ❌ Toggle not working → Check backend is running
- ❌ Paystack not opening → Check PAYSTACK_PUBLIC_KEY in .env

---

## 📸 **Screenshot What You See**

Please check:
1. **Dashboard** - Do you see the upgrade banner?
2. **Upgrade Screen** - Does it load correctly?
3. **Account Tab** - Do you see Professional Settings (if pro)?

---

## 🐛 **If Something's Wrong:**

Tell me:
- What screen you're on
- What you see (or don't see)
- Any error messages
- Your user's subscription plan

I'll help you fix it! 🚀














