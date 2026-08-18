# 🚀 Mobile v1.1 - WHERE TO START

## ✅ **BACKEND STATUS: READY!**

All backend endpoints are already implemented and ready to use:

### **1. Professional Plan Endpoints** ✅
```
GET    /api/marketer-professional/plan-info           (Public - Get pricing)
POST   /api/marketer-professional/upgrade             (Auth - Upgrade to Pro)
GET    /api/marketer-professional/stats               (Pro only - Get stats)
PUT    /api/marketer-professional/profile/enhanced    (Pro only - Update profile)
GET    /api/marketer-professional/profile/enhanced    (Auth - View profile)
PATCH  /api/marketer-professional/profile/visibility  (Pro only - Toggle visibility)
```

### **2. AI Matching Endpoints** ✅
```
POST   /api/ai-match/search          (Pro only - AI search, 10/month limit)
GET    /api/ai-match/history         (Pro only - Past searches)
GET    /api/ai-match/usage           (Pro only - Check quota)
GET    /api/ai-match/:matchId        (Pro only - Match details)
POST   /api/ai-match/:matchId/select (Pro only - Select business)
```

### **3. Public Marketplace Endpoints** ✅
```
GET    /api/public/businesses        (Public - Browse businesses)
GET    /api/public/marketers         (Public - Browse marketers)
GET    /api/public/stats             (Public - Platform stats)
POST   /api/public/ai-search         (Public - AI search, rate limited)
```

---

## 📱 **MOBILE APP STATUS: NEEDS IMPLEMENTATION**

We need to build 4 main features in the mobile app:

---

## **PHASE 1: UPGRADE TO PROFESSIONAL** 🎯 **START HERE!**

### **Goal:**
Let free marketers upgrade to Professional plan (GHS 50/month or GHS 500/year) inside the mobile app.

### **What to Build:**

#### **1.1: Create Upgrade Banner** (1-2 hours)
**File:** `mobile/src/screens/marketer/MarketerDashboard.js`

Add upgrade banner for free marketers:
```jsx
{user.subscriptionPlan === 'free' && (
  <View style={styles.upgradeCard}>
    <Text style={styles.title}>🚀 Go Professional</Text>
    <Text style={styles.subtitle}>
      Unlock AI Matching, Public Profile & More
    </Text>
    <TouchableOpacity onPress={() => navigation.navigate('MarketerUpgrade')}>
      <Text style={styles.button}>Learn More</Text>
    </TouchableOpacity>
  </View>
)}
```

**Location to Edit:** Around line 150-200 in MarketerDashboard.js

---

#### **1.2: Create MarketerUpgradeScreen** (3-4 hours)
**New File:** `mobile/src/screens/marketer/MarketerUpgradeScreen.js`

**What it should show:**
- Professional plan benefits:
  - ✨ AI-Powered Business Matching (10/month)
  - 🌐 Public Profile Visibility
  - 📊 Enhanced Analytics
  - 🎖️ Top Marketer Badges
  - ⚡ Priority Support
- Pricing: GHS 50/month or GHS 500/year (save 17%)
- Call-to-action: "Upgrade Now" button

**API Call Needed:**
```javascript
// Get plan details
const response = await axios.get(`${API_CONFIG.baseURL}/api/marketer-professional/plan-info`);
```

---

#### **1.3: Implement Paystack Payment Flow** (4-5 hours)
**File:** Use existing Paystack integration in mobile app

**Flow:**
1. User clicks "Upgrade Now"
2. Show payment modal with Paystack (reuse existing code)
3. User pays via Paystack
4. On success, call upgrade endpoint:

```javascript
// After Paystack success
const response = await axios.post(
  `${API_CONFIG.baseURL}/api/marketer-professional/upgrade`,
  {
    plan: 'professional',
    billingCycle: 'monthly', // or 'yearly'
    paymentReference: paystackReference
  },
  {
    headers: { Authorization: `Bearer ${accessToken}` }
  }
);

// Refresh user profile to show new plan
await refreshUserProfile();

// Show success message
showSuccessModal('🎉 Welcome to Professional!');
```

---

#### **1.4: Hide Upgrade Banner for Pro Users** (15 mins)
After upgrade, banner should disappear automatically because:
```jsx
{user.subscriptionPlan === 'free' && <UpgradeBanner />}
```

---

## **PHASE 2: PUBLIC/PRIVATE VISIBILITY TOGGLE** ⚙️

### **Goal:**
Let Professional marketers control whether their profile appears in public searches.

### **What to Build:**

#### **2.1: Add Visibility Toggle to Profile Settings** (2-3 hours)
**File:** `mobile/src/screens/marketer/MarketerProfileEdit.js` or similar

Add toggle switch:
```jsx
{user.subscriptionPlan === 'professional' && (
  <View style={styles.settingRow}>
    <View>
      <Text style={styles.label}>Profile Visibility</Text>
      <Text style={styles.subtitle}>
        {visibilityMode === 'public' 
          ? '🌐 Public - Businesses can find you'
          : '🔒 Private - Only you initiate contact'
        }
      </Text>
    </View>
    <Switch 
      value={visibilityMode === 'public'}
      onValueChange={handleVisibilityToggle}
    />
  </View>
)}
```

**API Call:**
```javascript
const handleVisibilityToggle = async (isPublic) => {
  try {
    await axios.patch(
      `${API_CONFIG.baseURL}/api/marketer-professional/profile/visibility`,
      { visibilityMode: isPublic ? 'public' : 'private' },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    // Update local state
    setVisibilityMode(isPublic ? 'public' : 'private');
    showToast('Visibility updated');
  } catch (error) {
    showToast('Failed to update visibility');
  }
};
```

---

## **PHASE 3: AI MATCHING** 🤖

### **Goal:**
Let Professional marketers use AI to find perfect business matches.

### **What to Build:**

#### **3.1: Add AI Match Button to Search Bar** (1-2 hours)
**File:** `mobile/src/screens/marketer/MarketerDashboard.js`

Add AI button next to search:
```jsx
<View style={styles.searchRow}>
  <TextInput 
    placeholder="Search businesses..."
    value={searchText}
    onChangeText={setSearchText}
  />
  
  {user.subscriptionPlan === 'professional' && (
    <TouchableOpacity 
      style={styles.aiButton}
      onPress={() => navigation.navigate('AIMatch', { searchText })}
    >
      <Text>✨ AI Match</Text>
    </TouchableOpacity>
  )}
</View>
```

---

#### **3.2: Create AIMatchScreen** (5-6 hours)
**New File:** `mobile/src/screens/marketer/AIMatchScreen.js`

**Screen Components:**
1. **Customer Need Form:**
   - Pre-filled search text
   - Optional: Location, Budget, Timeline
   
2. **Quota Display:**
   ```jsx
   <Text>AI Matches this month: {usedMatches} of 10</Text>
   ```

3. **Submit & Loading:**
   ```jsx
   <TouchableOpacity 
     onPress={handleAISearch}
     disabled={usedMatches >= 10}
   >
     <Text>🤖 Find Matches</Text>
   </TouchableOpacity>
   ```

4. **Results List:**
   ```jsx
   {results.map(match => (
     <MatchCard 
       business={match.business}
       score={match.matchScore}
       reason={match.reason}
       onViewProfile={() => viewBusiness(match.businessId)}
       onStartPartnership={() => createPartnership(match.businessId)}
     />
   ))}
   ```

**API Calls:**

```javascript
// Check usage first
const usageResponse = await axios.get(
  `${API_CONFIG.baseURL}/api/ai-match/usage`,
  { headers: { Authorization: `Bearer ${accessToken}` } }
);
const { matchesUsed, matchesLimit } = usageResponse.data;

// Perform AI search
const handleAISearch = async () => {
  if (matchesUsed >= matchesLimit) {
    showAlert('Monthly limit reached', 'You have used all 10 AI matches this month.');
    return;
  }

  setLoading(true);
  try {
    const response = await axios.post(
      `${API_CONFIG.baseURL}/api/ai-match/search`,
      {
        customerDescription: searchText,
        location: selectedLocation,
        budgetMin: minBudget,
        budgetMax: maxBudget,
        timeline: selectedTimeline
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    setResults(response.data.matches);
  } catch (error) {
    if (error.response?.status === 429) {
      showAlert('Limit Reached', 'You have used all 10 AI matches this month.');
    } else {
      showAlert('Error', 'Failed to find matches. Try again.');
    }
  } finally {
    setLoading(false);
  }
};
```

---

## **PHASE 4: PUBLIC MARKETPLACE (DISCOVER TAB)** 🔍

### **Goal:**
Let users browse businesses and marketers like the web marketplace.

### **What to Build:**

#### **4.1: Add Discover Tab to Main Navigation** (1 hour)
**File:** `mobile/src/navigation/AppNavigator.js` (or similar)

Add new tab:
```jsx
<Tab.Screen 
  name="Discover" 
  component={DiscoverNavigator}
  options={{
    tabBarIcon: ({ color }) => <Icon name="compass" color={color} />
  }}
/>
```

---

#### **4.2: Create DiscoverNavigator with Two Tabs** (2 hours)
**New File:** `mobile/src/navigation/DiscoverNavigator.js`

```jsx
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';

const Tab = createMaterialTopTabNavigator();

export default function DiscoverNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Businesses" component={DiscoverBusinessesScreen} />
      <Tab.Screen name="Marketers" component={DiscoverMarketersScreen} />
    </Tab.Navigator>
  );
}
```

---

#### **4.3: Create DiscoverBusinessesScreen** (4-5 hours)
**New File:** `mobile/src/screens/discover/DiscoverBusinessesScreen.js`

**Features:**
- Filters: Industry, Location, Rating, Services
- Business cards with: Name, Industry, Rating, Member badge
- Actions: View Profile, Send Partnership Request
- Pagination (infinite scroll or Load More button)

**API Call:**
```javascript
const loadBusinesses = async (page = 1) => {
  try {
    const response = await axios.get(
      `${API_CONFIG.baseURL}/api/public/businesses`,
      {
        params: {
          page,
          limit: 20,
          industry: selectedIndustry,
          location: selectedLocation,
          minRating: minRating
        }
      }
    );
    
    setBusinesses([...businesses, ...response.data.businesses]);
    setTotalPages(response.data.totalPages);
  } catch (error) {
    showToast('Failed to load businesses');
  }
};
```

---

#### **4.4: Create DiscoverMarketersScreen** (4-5 hours)
**New File:** `mobile/src/screens/discover/DiscoverMarketersScreen.js`

**Features:**
- Shows only PUBLIC marketers (visibility === 'public')
- Filters: Location, Rating, Services, Response Time
- Marketer cards with: Photo, Name, Rating, Badge, Services
- Actions: View Profile, Send Message, Invite to Partnership
- Pagination

**API Call:**
```javascript
const loadMarketers = async (page = 1) => {
  try {
    const response = await axios.get(
      `${API_CONFIG.baseURL}/api/public/marketers`,
      {
        params: {
          page,
          limit: 20,
          location: selectedLocation,
          minRating: minRating,
          services: selectedServices
        }
      }
    );
    
    setMarketers([...marketers, ...response.data.marketers]);
  } catch (error) {
    showToast('Failed to load marketers');
  }
};
```

---

## 🎯 **IMPLEMENTATION PRIORITY**

### **Week 1: Start Here! 👈**
1. ✅ Phase 1.1: Add upgrade banner to MarketerDashboard
2. ✅ Phase 1.2: Create MarketerUpgradeScreen
3. ✅ Phase 1.3: Implement Paystack payment flow
4. ✅ Test upgrade flow end-to-end

**Estimated Time:** 10-12 hours

---

### **Week 2:**
1. ✅ Phase 2: Add visibility toggle
2. ✅ Phase 3.1: Add AI Match button
3. ✅ Phase 3.2: Create AIMatchScreen
4. ✅ Test AI matching flow

**Estimated Time:** 12-15 hours

---

### **Week 3:**
1. ✅ Phase 4.1-4.2: Add Discover tab
2. ✅ Phase 4.3: Build Businesses browse
3. ✅ Phase 4.4: Build Marketers browse
4. ✅ Test discovery flow

**Estimated Time:** 12-15 hours

---

## 📁 **FILES YOU'LL NEED TO CREATE**

### **New Screens:**
```
mobile/src/screens/marketer/MarketerUpgradeScreen.js
mobile/src/screens/marketer/AIMatchScreen.js
mobile/src/screens/discover/DiscoverBusinessesScreen.js
mobile/src/screens/discover/DiscoverMarketersScreen.js
```

### **New Navigators:**
```
mobile/src/navigation/DiscoverNavigator.js
```

### **New API Hooks (Optional but recommended):**
```
mobile/src/api/professionalPlan.js
mobile/src/api/aiMatch.js
mobile/src/api/publicMarketplace.js
```

---

## 📝 **FILES YOU'LL NEED TO EDIT**

### **Existing Screens to Modify:**
```
mobile/src/screens/marketer/MarketerDashboard.js      (Add upgrade banner + AI button)
mobile/src/screens/marketer/MarketerProfileEdit.js    (Add visibility toggle)
mobile/src/navigation/AppNavigator.js                 (Add Discover tab)
```

---

## 🧪 **TESTING CHECKLIST**

### **Phase 1: Upgrade Flow**
- [ ] Free marketer sees upgrade banner
- [ ] Pro marketer does NOT see upgrade banner
- [ ] Clicking banner opens MarketerUpgradeScreen
- [ ] Plan info loads correctly
- [ ] Paystack payment completes successfully
- [ ] After payment, user plan updates to 'professional'
- [ ] Banner disappears after upgrade
- [ ] Error handling works (payment failed, network error)

### **Phase 2: Visibility Toggle**
- [ ] Toggle only shows for Professional marketers
- [ ] Free marketers don't see the toggle
- [ ] Toggling to Public works
- [ ] Toggling to Private works
- [ ] Error handling works
- [ ] State persists after app restart

### **Phase 3: AI Matching**
- [ ] AI button only shows for Professional marketers
- [ ] Clicking opens AIMatchScreen
- [ ] Quota displays correctly (X of 10 used)
- [ ] Search form works
- [ ] AI search returns results
- [ ] Match cards display correctly
- [ ] Actions work (view profile, start partnership)
- [ ] Limit enforcement works (blocks at 10 matches)
- [ ] Error handling works

### **Phase 4: Discover Tab**
- [ ] Discover tab appears in main navigation
- [ ] Businesses tab loads businesses
- [ ] Marketers tab loads marketers
- [ ] Only public marketers appear
- [ ] Filters work correctly
- [ ] Pagination works
- [ ] Cards display correctly
- [ ] Actions work (view, message, invite)
- [ ] Empty states show correctly
- [ ] Loading states work

---

## 🚀 **LET'S START WITH PHASE 1!**

**Next Immediate Steps:**

1. **Open** `mobile/src/screens/marketer/MarketerDashboard.js`
2. **Add** the upgrade banner (see Phase 1.1 above)
3. **Create** `mobile/src/screens/marketer/MarketerUpgradeScreen.js`
4. **Test** the navigation works

**Do you want me to:**
- ✅ Create the MarketerUpgradeScreen first?
- ✅ Add the upgrade banner to MarketerDashboard?
- ✅ Set up the API hooks for professional plan?

**Just say "Start Phase 1" and I'll begin coding!** 🎯














