# Admin Panel - Quick Start Guide

## ✅ Implementation Complete!

The mobile admin panel has been fully implemented with 5 bottom tabs and comprehensive management features.

## 🚀 To Test Right Now

### 1. Start the Mobile App

```bash
cd mobile
npm start
```

### 2. Login as Admin

You need an admin user in your database:
- **Account Type:** `admin`
- **Email:** `admin@sabito.app` (or your admin email)
- **Password:** Your admin password

### 3. What You'll See

After logging in as admin, you'll see:

```
┌──────────────────────────────────────────┐
│ Sabito Admin       🔍   💬(3)   👤      │ ← Header
├──────────────────────────────────────────┤
│                                          │
│        [Dashboard Content]               │
│                                          │
└──────────────────────────────────────────┘
┌──────┬─────────┬─────────┬─────────┬────┐
│  🏠  │   🏢    │   👤    │   🔗    │ ≡  │
│ Home │Business │Marketer │Referral │More│ ← 5 Bottom Tabs
└──────┴─────────┴─────────┴─────────┴────┘
```

## 📱 Navigation Guide

### Tab 1: 🏠 Home (Dashboard)
- View platform statistics
- Time filters: Today, Week, Month, Year
- Quick actions for common tasks
- Summary cards with trend indicators

**Try:** Tap different time filters to see stats change

### Tab 2: 🏢 Businesses  
- View all businesses
- Tabs: All | Pending | Approved | Rejected | Suspended
- Search businesses
- Approve/Reject pending businesses
- Suspend active businesses

**Try:** 
1. Tap "Pending" tab
2. Find a pending business
3. Tap "Approve" button

### Tab 3: 👤 Marketers
- View all marketers
- Filters: All | Active | Suspended
- Search marketers
- View performance stats
- Suspend/Activate marketers

**Try:**
1. Search for a marketer
2. View their stats (referrals, earnings, conversion rate)

### Tab 4: 🔗 Referrals
- Toggle between Referrals and Projects
- Filter by status
- Search referrals/projects
- View details

**Try:**
1. Tap "Projects" button to switch view
2. Filter by status

### Tab 5: ≡ More
- Cashout Requests (with badge)
- Finance Overview
- Platform Commissions
- Reports
- Waiting List
- Team Members
- Settings
- Logout

**Try:** Explore each menu item

## 🎯 Key Features to Test

### 1. Business Approval Workflow
```
Businesses Tab → Pending → Select Business → Approve
```
✅ Business status changes to "Approved"
✅ Badge count on tab decreases

### 2. Marketer Suspension
```
Marketers Tab → Active → Select Marketer → Suspend
```
✅ Marketer status changes to "Suspended"

### 3. Dashboard Filters
```
Home Tab → Tap "Week" → View updated stats
```
✅ Stats recalculate for the selected period
✅ Trend indicators show comparison with previous period

### 4. Search Functionality
```
Any Tab → Type in search bar → See filtered results
```
✅ Results update as you type

### 5. Header Actions
```
Tap Search Icon → Global search opens
Tap Chat Icon → Messages open (with unread count)
Tap Profile Icon → Admin profile opens
```

## ⚙️ Backend Requirements

Ensure these endpoints work:

```bash
# Dashboard
GET /api/admin/dashboard/summary?period=today

# Businesses
GET /api/admin/businesses?page=1&limit=20&status=pending
PUT /api/admin/businesses/{id}/approve
PUT /api/admin/businesses/{id}/reject

# Marketers
GET /api/admin/marketers?page=1&limit=20&status=active
PUT /api/admin/users/{userId}/suspend
PUT /api/admin/users/{userId}/activate

# Referrals
GET /api/admin/referrals?page=1&limit=20
GET /api/admin/projects?page=1&limit=20

# Cashouts
GET /api/admin/cashout-requests?page=1&limit=20&status=pending

# Chat (for unread count)
GET /api/chat/conversations
```

## 🐛 Troubleshooting

### Issue: "Cannot read property 'accountType' of null"
**Solution:** Ensure you're logged in with an admin account

### Issue: "Network Error" or 404
**Solution:** 
1. Check backend is running
2. Verify API endpoints exist
3. Check `API_URL` in `.env`

### Issue: No data showing
**Solution:**
1. Check backend has data (businesses, marketers, etc.)
2. Check console logs for API errors
3. Pull to refresh the screen

### Issue: Badge counts not showing
**Solution:**
1. Ensure pending businesses exist
2. Wait 30 seconds for auto-refresh
3. Pull to refresh

## 📊 Expected Data Flow

### Login Flow
```
Login Screen → Verify Admin → RootNavigator checks accountType 
→ accountType === 'admin' → Navigate to AdminTabNavigator
```

### Business Approval Flow
```
API Call → Backend Validation → Database Update 
→ Response → UI Update → Badge Count Update
```

### Real-time Updates
```
Every 30s: Check pending businesses count → Update badge
Every 30s: Check unread messages count → Update badge
```

## 📁 Files You Can Reference

| File | Purpose |
|------|---------|
| `src/navigation/AdminTabNavigator.js` | Main admin navigation |
| `src/screens/admin/AdminDashboardScreen.js` | Dashboard/Home |
| `src/screens/admin/AdminBusinessesScreen.js` | Business management |
| `src/screens/admin/AdminMarketersScreen.js` | Marketer management |
| `src/screens/admin/AdminReferralsScreen.js` | Referrals & Projects |
| `src/screens/admin/AdminMoreScreen.js` | More menu |
| `src/components/admin/AdminHeader.js` | Header component |
| `src/api/admin.js` | All admin API calls |

## 🎨 Customization

### Change Badge Refresh Interval
```javascript
// AdminTabNavigator.js, line ~30
const interval = setInterval(fetchPendingCount, 30000); // 30 seconds
// Change to 60000 for 1 minute
```

### Change Items Per Page
```javascript
// Any screen with pagination
const response = await apiClient.get('...?page=1&limit=20'); // 20 items
// Change to limit=50 for more items
```

### Add New Menu Item to More Screen
```javascript
// AdminMoreScreen.js
{renderMenuItem(
  <YourIcon size={24} color={COLORS.APP_GREEN} strokeWidth={2} />,
  'Your Feature',
  'Your subtitle',
  () => navigation.navigate('YourScreen'),
  0,
  COLORS.APP_GREEN
)}
```

## ✨ Next Steps

1. ✅ Test admin login
2. ✅ Test each tab navigation
3. ✅ Test business approval/rejection
4. ✅ Test marketer suspend/activate
5. ✅ Test search functionality
6. ✅ Test pull-to-refresh
7. ✅ Test badge notifications
8. ✅ Test header actions (search, chat, profile)
9. ✅ Test dark mode toggle
10. ✅ Test logout

## 🎉 You're Ready!

The admin panel is fully functional and ready to use. All core features are implemented:

✅ Navigation (5 tabs)
✅ Dashboard with stats
✅ Business management
✅ Marketer management
✅ Referrals & Projects
✅ More menu with additional features
✅ Search & filters
✅ Badge notifications
✅ Theme support
✅ API integration

**Happy administrating! 🚀**

---

For detailed documentation, see:
- `ADMIN_PANEL_GUIDE.md` - Comprehensive feature guide
- `ADMIN_IMPLEMENTATION_SUMMARY.md` - Technical implementation details

