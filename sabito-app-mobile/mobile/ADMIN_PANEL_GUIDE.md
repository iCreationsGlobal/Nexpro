# Mobile Admin Panel Guide

## Overview

The Sabito mobile admin panel provides comprehensive management capabilities for platform administrators through an intuitive mobile interface.

## Navigation Structure

### Bottom Tab Navigation (5 Tabs)

```
┌─────────────────────────────────────────┐
│ [Logo] Sabito Admin    🔍  💬(3)  👤   │ ← Header (all screens)
├─────────────────────────────────────────┤
│         [Screen Content]                │
└─────────────────────────────────────────┘
┌─────┬─────────┬─────────┬─────────┬─────┐
│ 🏠  │   🏢    │   👤    │   🔗    │  ≡  │
│Home │Business │Marketer │Referral │More │
└─────┴─────────┴─────────┴─────────┴─────┘
```

## Features by Tab

### 1. 🏠 Home (Dashboard)

**File:** `mobile/src/screens/admin/AdminDashboardScreen.js`

**Features:**
- **Time Filters:** Today, Week, Month, Year
- **Summary Cards:**
  - Total Users (with comparison metrics)
  - Total Businesses (with trend indicators)
  - Total Marketers (with growth percentage)
  - Total Referrals (with status breakdown)
  - Platform Revenue (with earnings trends)
- **Quick Actions:**
  - Pending Approvals (with badge count)
  - Cashout Requests (with pending count)
  - Quick navigation to all sections
- **Recent Activities Feed**

**API Endpoints:**
- `GET /api/admin/dashboard/summary?period={period}`
- `GET /api/admin/recent-activities`

### 2. 🏢 Businesses

**File:** `mobile/src/screens/admin/AdminBusinessesScreen.js`

**Features:**
- **Status Tabs:** All | Pending | Approved | Rejected | Suspended
- **Search & Filter:** By name, industry, location, owner email
- **Business Cards Display:**
  - Business logo and name
  - Industry and location
  - Owner email
  - Status indicator
  - Referral count
- **Quick Actions:**
  - Approve Business (for pending)
  - Reject Business (for pending)
  - Suspend Business (for approved)
- **Pending Badge:** Shows count of pending approvals on tab icon
- **Pull to Refresh**

**API Endpoints:**
- `GET /api/admin/businesses?page={page}&limit={limit}&status={status}`
- `PUT /api/admin/businesses/{id}/approve`
- `PUT /api/admin/businesses/{id}/reject`
- `PUT /api/admin/users/{userId}/suspend`

### 3. 👤 Marketers

**File:** `mobile/src/screens/admin/AdminMarketersScreen.js`

**Features:**
- **Status Filters:** All | Active | Suspended
- **Search & Filter:** By name, email, location
- **Marketer Cards Display:**
  - Profile picture
  - Name and email
  - Location
  - Status (Active/Suspended)
  - Performance stats:
    - Total referrals
    - Total earnings
    - Conversion rate
- **Quick Actions:**
  - Suspend Marketer (for active)
  - Activate Marketer (for suspended)
- **Pull to Refresh**

**API Endpoints:**
- `GET /api/admin/marketers?page={page}&limit={limit}&status={status}`
- `GET /api/admin/marketers/{id}`
- `PUT /api/admin/users/{userId}/suspend`
- `PUT /api/admin/users/{userId}/activate`

### 4. 🔗 Referrals

**File:** `mobile/src/screens/admin/AdminReferralsScreen.js`

**Features:**
- **View Toggle:** Referrals ⟷ Projects
- **Referral Status Filters:** 
  - All | New | Contacted | Interested | Converted | Rejected
- **Project Status Filters:**
  - All | Active | Completed | Cancelled
- **Search:** By client name, marketer, business
- **Referral Cards Display:**
  - Client name
  - Status badge
  - Marketer info
  - Business info
  - Date created
- **Project Cards Display:**
  - Project title
  - Status badge
  - Business name
  - Client name
  - Estimated value
  - Date created
- **Pull to Refresh**

**API Endpoints:**
- `GET /api/admin/referrals?page={page}&limit={limit}&status={status}`
- `GET /api/admin/projects?page={page}&limit={limit}&status={status}`
- `GET /api/admin/referrals/{id}`
- `GET /api/admin/projects/{id}`

### 5. ≡ More

**File:** `mobile/src/screens/admin/AdminMoreScreen.js`

**Features:**

#### Finance Section
- **Cashout Requests** (with pending badge)
  - Review and approve marketer payouts
- **Finance Overview**
  - Earnings, commissions, subscriptions
- **Platform Commissions**
  - Track platform revenue

#### Analytics Section
- **Reports**
  - View detailed analytics
  - Generate custom reports

#### User Management Section
- **Waiting List**
  - Pre-launch signups
- **Team Members**
  - Manage admin team
- **Role Management**
  - Permissions & access control

#### Account Section
- **Settings**
  - Account preferences
- **Help & Support**
  - Get help and contact support
- **Logout**

## Header Component

**File:** `mobile/src/components/admin/AdminHeader.js`

**Features:**
- **Search Icon (🔍):** Opens global search
- **Chat Icon (💬):** Opens messages (with unread badge)
- **Profile Icon (👤):** Opens admin profile

**Auto-refresh:**
- Unread message count updates every 30 seconds
- Pending business approvals update every 30 seconds

## API Service

**File:** `mobile/src/api/admin.js`

Centralized API service for all admin operations:

### Dashboard
- `getDashboardSummary(period)`
- `getSystemHealth()`

### Businesses
- `getAllBusinesses(params)`
- `getBusinessById(id)`
- `approveBusiness(id)`
- `rejectBusiness(id)`

### Marketers
- `getAllMarketers(params)`
- `getMarketerById(id)`

### User Management
- `suspendUser(userId)`
- `activateUser(userId)`
- `deleteUser(userId)`

### Referrals & Projects
- `getAllReferrals(params)`
- `getReferralById(id)`
- `getAllProjects(params)`
- `getProjectById(id)`

### Finance
- `getAllCashoutRequests(params)`
- `updateCashoutStatus(id, status)`
- `getAllEarnings(params)`
- `getPlatformFees(params)`
- `getSubscriptions(params)`
- `getPlatformRevenue()`

### Reports
- `getReports(params)`
- `generateReport(type, params)`

### Waiting List
- `getWaitingList(params)`
- `updateWaitingListStatus(id, status)`

### Team
- `getTeamMembers(params)`

### Search
- `globalSearch(query)`

## Authentication & Routing

**File:** `mobile/src/navigation/RootNavigator.js`

When a user with `accountType: 'admin'` logs in:
1. App detects admin role
2. Routes to `AdminTabNavigator` (instead of Business or Marketer navigators)
3. Admin sees the 5-tab navigation
4. All admin features are accessible

## Theming Support

All admin screens support:
- ✅ Light mode
- ✅ Dark mode
- ✅ Dynamic color adaptation
- ✅ Consistent design language with business/marketer sides

## Badge Notifications

Real-time badge counts for:
1. **Businesses Tab Icon:** Pending business approvals
2. **Chat Icon (Header):** Unread messages
3. **Cashout Requests (More):** Pending cashout requests

## Pull-to-Refresh

All list screens support pull-to-refresh:
- Businesses
- Marketers
- Referrals
- Projects

## Status Indicators

Color-coded status indicators:
- ✅ **Green:** Approved, Active, Completed, Converted
- ⚠️ **Yellow:** Pending, Interested, In Progress
- ❌ **Red:** Rejected, Suspended, Cancelled
- 🔵 **Blue:** New, Contacted
- 🟣 **Purple:** Qualified

## Screen Navigation Flow

```
AdminTabNavigator
├── Home (Dashboard)
├── Businesses
│   └── AdminBusinessDetails
├── Marketers
│   └── AdminMarketerDetails
├── Referrals
│   ├── AdminReferralDetails
│   └── AdminProjectDetails
└── More
    ├── AdminCashouts
    ├── AdminFinance
    ├── AdminCommissions
    ├── AdminReports
    ├── AdminWaitingList
    ├── AdminTeamMembers
    ├── AdminRoleManagement
    ├── AdminSettings
    ├── AdminHelp
    └── Logout
```

## Usage Examples

### Example 1: Approve a Business
1. Admin opens app → Sees AdminTabNavigator (Home tab)
2. Notices pending business badge on Businesses tab
3. Taps Businesses tab
4. Sees "Pending" tab selected by default (if there are pending businesses)
5. Views business card with all details
6. Taps "Approve" button
7. Confirms approval in alert dialog
8. Business status updated to "Approved"
9. Badge count decrements

### Example 2: Suspend a Marketer
1. Admin taps Marketers tab
2. Searches for marketer by name
3. Taps marketer card to view details
4. Taps "Suspend" button
5. Confirms suspension
6. Marketer status updated to "Suspended"

### Example 3: View Dashboard Stats
1. Admin opens app → Home tab active
2. Selects time filter (Today, Week, Month, Year)
3. Views summary cards with comparison metrics
4. Sees trending indicators (up/down arrows)
5. Taps quick action to navigate to specific section

## Performance Optimizations

1. **Pagination:** All lists load 20 items at a time
2. **Badge Auto-refresh:** Updates every 30 seconds (not on every screen change)
3. **Pull-to-Refresh:** Manual refresh for latest data
4. **Lazy Loading:** Detail screens only load when needed
5. **Cached Data:** Previous data shown while fetching new data

## Testing Checklist

- [ ] Admin login routes to AdminTabNavigator
- [ ] All 5 tabs navigate correctly
- [ ] Business approval/rejection works
- [ ] Marketer suspend/activate works
- [ ] Dashboard stats load and filter correctly
- [ ] Search functionality works on all tabs
- [ ] Status filters work correctly
- [ ] Badges update in real-time
- [ ] Pull-to-refresh works on all list screens
- [ ] Chat icon opens ChatList
- [ ] Search icon opens global search
- [ ] Profile icon opens admin profile
- [ ] Logout works correctly
- [ ] Dark mode works on all screens
- [ ] Navigation to detail screens works

## Deployment Notes

### Environment Variables
No special environment variables needed for admin panel (uses existing API_URL).

### Backend Requirements
Ensure these admin endpoints are available:
- `/api/admin/dashboard/summary`
- `/api/admin/businesses`
- `/api/admin/marketers`
- `/api/admin/referrals`
- `/api/admin/projects`
- `/api/admin/cashout-requests`
- `/api/admin/*` (all other admin endpoints)

### Authentication
Admin users must have:
- `accountType: 'admin'` in user object
- Valid JWT access token
- Proper admin permissions on backend

## Future Enhancements

1. **Push Notifications:** Real-time alerts for pending approvals
2. **Advanced Filters:** Date range, multiple status selection
3. **Bulk Actions:** Approve/reject multiple businesses at once
4. **Export Reports:** Download reports as PDF/CSV
5. **Advanced Analytics:** Charts and graphs on dashboard
6. **Real-time Updates:** WebSocket for live data updates
7. **Offline Support:** Cached data for offline viewing

## Support

For issues or questions:
- Check backend logs for API errors
- Verify admin permissions in database
- Check console logs in the app
- Ensure backend endpoints are accessible

## Version

- **Current Version:** 1.0.1
- **Build:** 7
- **Last Updated:** December 2024

