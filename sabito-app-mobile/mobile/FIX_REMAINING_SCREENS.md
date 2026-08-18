# Fix Remaining Screens - Automated Pattern

Due to the large number of files (34+ screens), here's the pattern to fix each:

## Pattern to Replace

### 1. Remove getApiUrl() function and imports

**Find:**
```javascript
import axios from 'axios';
import { API_BASE_URL } from '@env';

// Get API URL based on platform
const getApiUrl = () => {
  if (Platform.OS === 'web') {
    return 'http://localhost:4002';
  }
  return API_BASE_URL || 'http://192.168.0.167:4002';
};
```

**Replace with:**
```javascript
import apiClient from '../../services/apiClient';
```

### 2. Replace axios calls

**Find:**
```javascript
const token = await AsyncStorage.getItem('accessToken');
const apiUrl = getApiUrl();
const response = await axios.get(`${apiUrl}/api/endpoint`, {
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});
```

**Replace with:**
```javascript
const response = await apiClient.get('/api/endpoint');
```

### 3. For POST/PUT/PATCH/DELETE

**Find:**
```javascript
const token = await AsyncStorage.getItem('accessToken');
const apiUrl = getApiUrl();
const response = await axios.post(`${apiUrl}/api/endpoint`, data, {
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});
```

**Replace with:**
```javascript
const response = await apiClient.post('/api/endpoint', data);
```

## Files Remaining (34 files)

1. `mobile/src/screens/marketer/MarketerBusinesses.js`
2. `mobile/src/screens/business/BusinessDashboard.js`
3. `mobile/src/screens/business/BusinessAccount.js`
4. `mobile/src/screens/business/BusinessMarketers.js`
5. `mobile/src/screens/marketer/MarketerDashboard.js`
6. `mobile/src/screens/marketer/BusinessDetailsScreen.js`
7. `mobile/src/components/payments/MarketerFeePaymentModal.js`
8. `mobile/src/components/payments/PlatformFeePaymentModal.js`
9. `mobile/src/screens/business/MarketerDetailsScreen.js`
10. `mobile/src/screens/marketer/MarketerEarnings.js`
11. `mobile/src/screens/business/BusinessReports.js`
12. `mobile/src/screens/marketer/MarketerReports.js`
13. `mobile/src/screens/marketer/MarketerReferralDetailsScreen.js`
14. `mobile/src/screens/marketer/PaymentMethodSetupScreen.js`
15. `mobile/src/screens/marketer/CashoutRequestScreen.js`
16. `mobile/src/screens/marketer/AddReferralScreen.js`
17. `mobile/src/screens/business/OrganisationScreen.js`
18. `mobile/src/screens/business/ProfileScreen.js`
19. `mobile/src/screens/common/DiscoverMarketerDetailsScreen.js`
20. `mobile/src/screens/business/InvitesScreen.js`
21. `mobile/src/screens/marketer/MarketerReferrals.js`
22. `mobile/src/screens/marketer/MarketerProjects.js`
23. `mobile/src/screens/business/TeamMembersScreen.js`
24. `mobile/src/screens/business/SubscriptionScreen.js`
25. `mobile/src/screens/business/ReferralDetailsScreen.js`
26. `mobile/src/screens/business/ProjectDetailsScreen.js`
27. `mobile/src/screens/business/PlatformFeesScreen.js`
28. `mobile/src/screens/business/MarketerFeesScreen.js`
29. `mobile/src/screens/business/CommissionsSetupScreen.js`
30. `mobile/src/screens/business/BusinessReferrals.js`
31. `mobile/src/screens/business/BusinessProjects.js`
32. `mobile/src/screens/business/AddProjectScreen.js`
33. `mobile/src/components/payments/RecordPaymentModal.js`
34. `mobile/src/screens/common/AllActivitiesScreen.js`

## Quick Fix Script (Manual)

For each file:
1. Remove `getApiUrl()` function
2. Remove `import axios from 'axios'` and `import { API_BASE_URL } from '@env'`
3. Add `import apiClient from '../../services/apiClient'` (or '../services/apiClient' depending on depth)
4. Replace all `axios.get/post/put/delete` with `apiClient.get/post/put/delete`
5. Remove manual token retrieval and headers
6. Remove `getApiUrl()` calls

## Status

✅ **Fixed:**
- `mobile/src/screens/auth/PlanConfirmationScreen.js`
- `mobile/src/api/marketplace.js`
- `mobile/src/api/aiMatch.js`
- `mobile/src/api/professionalPlan.js`
- `mobile/src/api/ratings.js`

⏳ **Remaining:** 34 screen files

