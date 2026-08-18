# 🧪 TESTING GUIDE - Phases 1 & 2

## ✅ What We're Testing

### **Phase 1: Upgrade to Professional**
- Upgrade banner on dashboard
- MarketerUpgradeScreen
- Paystack payment flow
- Backend API integration

### **Phase 2: Visibility Toggle**
- Professional Settings section
- Public/Private toggle
- Backend visibility update

---

## 🚀 **STEP 1: Make Sure Backend is Running**

The backend should already be running on `http://192.168.0.167:4002`

**Check if it's running:**
```bash
curl http://192.168.0.167:4002/health
```

**If not running, start it:**
```bash
cd services/user-service
npm run dev
```

**Expected Output:**
```
✅ Server running on 0.0.0.0:4002
🌐 Accessible on network: http://192.168.0.167:4002
```

---

## 📱 **STEP 2: Restart Expo**

Since we added new screens and modified existing ones, restart Expo:

**Option A: If Expo is running, press `r` to reload**

**Option B: Stop and restart Expo:**
```bash
cd mobile
npx expo start --clear
```

**Expected Output:**
```
Metro waiting on exp://192.168.0.167:8081
› Press r │ reload app
› Press m │ toggle menu
```

---

## 🧪 **STEP 3: Test Phase 1 - Upgrade Flow**

### **Test with a FREE Marketer Account**

#### **1. Login as a Free Marketer**
- Open the app
- Login with a marketer account that has `subscriptionPlan: 'free'` or `null`

#### **2. Check Dashboard**
✅ **Expected:** You should see a green "Go Professional" banner with:
- ✨ Icon
- "Go Professional" title
- "Unlock AI Matching, Public Profile & More" subtitle
- "Learn More" button

❌ **If NOT visible:** 
- Check user subscription plan in AsyncStorage
- Make sure user.accountType === 'marketer'

#### **3. Click "Learn More" Button**
✅ **Expected:** Opens `MarketerUpgradeScreen` with:
- Hero section with ✨ icon
- Monthly/Yearly billing options
- GHS 50/month or GHS 500/year
- "Save 17%" badge on yearly option
- 5 feature cards
- FAQ section
- "Upgrade Now" button at bottom

#### **4. Test Billing Cycle Toggle**
- Click "Monthly" option → Should highlight
- Click "Yearly" option → Should highlight with "Save 17%" badge
- Price at bottom should change accordingly

#### **5. Test Payment Flow (Optional - requires real payment)**
⚠️ **Note:** This will trigger actual Paystack payment

- Click "Upgrade Now" button
- ✅ **Expected:** Paystack WebView opens
- Select payment method (Card, Mobile Money, Bank)
- Complete payment

**If payment succeeds:**
- ✅ Success alert: "🎉 Welcome to Professional!"
- ✅ User subscriptionPlan updates to 'professional'
- ✅ Returns to dashboard
- ✅ Upgrade banner is GONE

**If you don't want to pay:**
- Cancel the payment
- ✅ Should show "Payment Cancelled" alert
- Can try again later

---

## 🧪 **STEP 4: Test Phase 2 - Visibility Toggle**

### **Test with a PROFESSIONAL Marketer**

#### **Prerequisites:**
- Must have completed Phase 1 upgrade, OR
- Manually update user in database: `subscriptionPlan = 'professional'`

#### **1. Navigate to Account Tab**
- Tap bottom navigation "Account" tab
- ✅ **Expected:** See "Professional Settings" section with:
  - Green PRO badge with ✨ icon
  - "Professional Settings" title
  - Visibility toggle card

#### **2. Check Visibility Card**
✅ **Expected Default (Private):**
- 🔒 Lock icon in gray background
- "Profile Visibility" label
- "🔒 Private - Only you initiate contact" description
- Switch is OFF (gray)

#### **3. Toggle to Public**
- Tap the switch to turn it ON
- ✅ **Expected:**
  - Loading spinner appears briefly
  - Switch turns green
  - Icon changes to 🌐 Globe in blue background
  - Text changes to "🌐 Public - Businesses can find you"
  - Success alert appears

#### **4. Toggle Back to Private**
- Tap the switch to turn it OFF
- ✅ **Expected:**
  - Loading spinner appears briefly
  - Switch turns gray
  - Icon changes back to 🔒 Lock
  - Text changes back to "🔒 Private - Only you initiate contact"
  - Success alert appears

#### **5. Verify Backend Update**
Check in database or via API:
```bash
# Check user's visibility
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://192.168.0.167:4002/api/users/profile
```

Should show: `"visibilityMode": "public"` or `"private"`

---

## 🧪 **STEP 5: Test with FREE Marketer**

### **Verify Pro-Only Features Are Hidden**

#### **1. Login as Free Marketer**
- Use an account with `subscriptionPlan: 'free'` or `null`

#### **2. Check Dashboard**
✅ **Expected:** 
- ✅ Upgrade banner IS visible
- ❌ No AI Match button (Phase 3)

#### **3. Check Account Tab**
✅ **Expected:**
- ❌ NO "Professional Settings" section
- ❌ NO visibility toggle
- ✅ All other settings visible (Notifications, Theme, etc.)

---

## 🎯 **Test Scenarios Checklist**

### **Phase 1: Upgrade Flow**
- [ ] Free marketer sees upgrade banner
- [ ] Banner navigates to MarketerUpgradeScreen
- [ ] Monthly/Yearly toggle works
- [ ] Prices update correctly
- [ ] Features list displays
- [ ] FAQ section shows
- [ ] "Upgrade Now" button opens Paystack
- [ ] Payment success updates user plan
- [ ] Banner disappears after upgrade
- [ ] Professional marketer does NOT see banner

### **Phase 2: Visibility Toggle**
- [ ] Professional marketer sees Pro Settings section
- [ ] PRO badge displays correctly
- [ ] Default visibility is "private"
- [ ] Toggle switch works
- [ ] Icon changes (Lock ↔ Globe)
- [ ] Text updates correctly
- [ ] Loading state shows during API call
- [ ] Success alert appears
- [ ] Backend updates visibility
- [ ] Free marketer does NOT see Pro Settings

---

## 🐛 **Troubleshooting**

### **Problem: Upgrade banner not showing**
**Check:**
- User is logged in as marketer (`accountType: 'marketer'`)
- User subscription plan is `'free'` or `null`
- Dashboard component mounted correctly

**Fix:**
```javascript
// In AsyncStorage
const user = await AsyncStorage.getItem('user');
console.log(JSON.parse(user)); // Check subscriptionPlan
```

### **Problem: Professional Settings not showing**
**Check:**
- User subscription plan is exactly `'professional'`
- No typos in subscriptionPlan field

**Fix:**
```javascript
// Manually update for testing
const user = await AsyncStorage.getItem('user');
const updatedUser = { ...JSON.parse(user), subscriptionPlan: 'professional' };
await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
// Restart app
```

### **Problem: Paystack not opening**
**Check:**
- `.env.development` has `PAYSTACK_PUBLIC_KEY`
- User has email and name
- Amount is correct (> 0)

**Fix:**
Check console logs for Paystack errors

### **Problem: Visibility toggle not working**
**Check:**
- Backend is running and accessible
- API endpoint exists: `/api/marketer-professional/profile/visibility`
- User has valid access token

**Fix:**
```bash
# Test API endpoint
curl -X PATCH http://192.168.0.167:4002/api/marketer-professional/profile/visibility \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"visibilityMode":"public"}'
```

---

## 📸 **Screenshots to Verify**

### **Dashboard with Upgrade Banner:**
- Green card with ✨ icon
- "Go Professional" title
- "Learn More" button

### **MarketerUpgradeScreen:**
- Hero section
- Billing options (Monthly/Yearly)
- 5 feature cards
- Bottom CTA with price

### **Professional Settings:**
- PRO badge
- Visibility toggle
- Icon + text + switch

---

## ✅ **Success Criteria**

**Phase 1 is working if:**
1. Free marketers see upgrade banner
2. Banner navigates to upgrade screen
3. Upgrade screen displays correctly
4. Paystack integration works
5. After upgrade, banner disappears

**Phase 2 is working if:**
1. Pro marketers see Pro Settings
2. Visibility toggle appears
3. Switch updates backend
4. UI reflects changes immediately
5. Free marketers don't see Pro Settings

---

## 🎉 **Ready to Test!**

1. ✅ Backend running: `http://192.168.0.167:4002`
2. ✅ Expo running: `npx expo start`
3. ✅ Login as free marketer
4. ✅ Test upgrade flow
5. ✅ Test visibility toggle (after upgrade)

**Questions during testing?** Let me know what you see! 🚀














