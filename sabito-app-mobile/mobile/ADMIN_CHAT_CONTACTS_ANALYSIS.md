# 📋 Admin Chat Contacts - How It Works

## Overview

The admin uses the **same chat system** as businesses and marketers, but should have access to chat with **ALL users** on the platform.

## How Chat Loading Works

### 1. **Existing Conversations** (ChatListScreen)

**API Endpoint:** `GET /api/chat/chats`

**Purpose:** Load all existing chat conversations

**For Admin:**
- Should return conversations with businesses, marketers, and support
- Same endpoint for all user types
- Backend filters based on user ID

**Screen:** `mobile/src/screens/chat/ChatListScreen.js`
```javascript
const response = await getUserChats(); // GET /api/chat/chats
```

---

### 2. **New Chat Contacts** (NewChatScreen)

**API Endpoint:** `GET /api/chat/contacts`

**Purpose:** Load available users to start new chats with

**For Admin:**
- Should return **ALL businesses** ✅
- Should return **ALL marketers** ✅
- Filters out system users (system@sabito.com, support@sabito.com)

**Screen:** `mobile/src/screens/chat/NewChatScreen.js`
```javascript
const response = await getContacts(); // GET /api/chat/contacts
```

---

## Backend Requirements for Admin

### `/api/chat/contacts` Response

**For Business Users:**
- Returns marketers they've worked with

**For Marketer Users:**
- Returns businesses they've worked with

**For Admin Users:** ⭐
```json
{
  "success": true,
  "data": [
    {
      "id": "user_id_1",
      "name": "John Smith",
      "email": "john@example.com",
      "accountType": "business",
      "business": {
        "businessName": "ABC Company"
      }
    },
    {
      "id": "user_id_2",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "accountType": "marketer",
      "marketer": {
        // marketer details
      }
    },
    // ... ALL businesses and marketers
  ]
}
```

**Admin should see:**
- ✅ All businesses (with business names)
- ✅ All marketers
- ❌ NOT system users
- ❌ NOT support users
- ❌ NOT other admins (optional)

---

## Backend Implementation (Expected)

```javascript
// services/user-service/src/controllers/chat.controller.ts

export const getContacts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userID;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accountType: true }
    });

    let contacts = [];

    if (user?.accountType === 'admin') {
      // ⭐ ADMIN: Return ALL businesses and marketers
      contacts = await prisma.user.findMany({
        where: {
          accountType: { in: ['business', 'marketer'] },
          status: 'active',
          email: {
            notIn: ['system@sabito.com', 'support@sabito.com']
          }
        },
        select: {
          id: true,
          name: true,
          email: true,
          accountType: true,
          business: {
            select: {
              businessName: true,
              logo: true
            }
          },
          marketer: {
            select: {
              profileImage: true
            }
          }
        },
        orderBy: { name: 'asc' }
      });
    } else if (user?.accountType === 'business') {
      // Business: Return marketers they've worked with
      // ... existing logic
    } else if (user?.accountType === 'marketer') {
      // Marketer: Return businesses they've worked with
      // ... existing logic
    }

    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load contacts' });
  }
};
```

---

## Mobile UI - How Contacts Display

### Contact Card Display:

```
┌─────────────────────────────────────────┐
│ [J] John Smith - ABC Company            │
│     Business                            │  ← Business user
├─────────────────────────────────────────┤
│ [J] Jane Doe                            │
│     Marketer                            │  ← Marketer user
└─────────────────────────────────────────┘
```

**Business Contact:**
- Name: `John Smith - ABC Company`
- Type: `Business`

**Marketer Contact:**
- Name: `Jane Doe`
- Type: `Marketer`

---

## What Happens When Admin Clicks Contact

1. Admin taps on a contact (e.g., "John Smith - ABC Company")
2. `createChat()` is called: `POST /api/chat/chats`
3. Backend creates or finds existing chat
4. Admin is navigated to `ChatConversationScreen`
5. Admin can now message that user

---

## Current Implementation Status

### Mobile Side: ✅ **READY**

- ✅ ChatListScreen works for all user types
- ✅ NewChatScreen filters out system users
- ✅ Displays business names for business users
- ✅ Shows account type (Business/Marketer)
- ✅ Handles chat creation
- ✅ No admin-specific code needed

### Backend Side: ⚠️ **NEEDS VERIFICATION**

**Check if backend:**
1. ✅ Returns ALL users when admin calls `/api/chat/contacts`
2. ✅ Includes business names in response
3. ✅ Filters out system/support users
4. ✅ Allows admin to create chats with any user

---

## Testing Checklist

**As Admin:**
1. ✅ Login as admin
2. ✅ Tap Chat icon in header
3. ✅ Tap "New Chat" (+ button)
4. ✅ See list of ALL businesses and marketers
5. ✅ Business users show with company name
6. ✅ Marketer users show with "Marketer" type
7. ✅ Tap a contact → Chat opens
8. ✅ Send a message → Works!

---

## API Endpoints Summary

| Endpoint | Purpose | Admin Behavior |
|----------|---------|---------------|
| `GET /api/chat/chats` | Get conversations | Returns admin's chats |
| `GET /api/chat/contacts` | Get potential contacts | Returns **ALL** businesses + marketers |
| `POST /api/chat/chats` | Create new chat | Allows chat with any user |
| `GET /api/chat/chats/:id/messages` | Get chat messages | Returns messages |
| `POST /api/chat/chats/:id/messages` | Send message | Sends message |

---

## Files Involved

### Mobile:
- ✅ `mobile/src/screens/chat/ChatListScreen.js` - Existing chats
- ✅ `mobile/src/screens/chat/NewChatScreen.js` - New chat contacts
- ✅ `mobile/src/screens/chat/ChatConversationScreen.js` - Chat messages
- ✅ `mobile/src/api/chat.js` - API calls

### Backend (Expected):
- ⚠️ `services/user-service/src/controllers/chat.controller.ts` - Chat logic
- ⚠️ `services/user-service/src/routes/chat.routes.ts` - Chat routes

---

## Potential Issues

### Issue 1: Admin sees no contacts

**Problem:** Backend not returning all users for admin
**Solution:** Update `/api/chat/contacts` to check if user is admin

### Issue 2: Admin can't start chat with certain users

**Problem:** Backend permissions blocking admin
**Solution:** Allow admin to create chats with any user

### Issue 3: Contacts missing business names

**Problem:** Backend not including business relationship
**Solution:** Include business data in query

---

## Recommendation

**Test the admin chat flow:**
1. Login as admin
2. Navigate to chat
3. Try creating a new chat
4. Check if all businesses and marketers appear

If contacts are limited or empty, the backend needs to be updated to return ALL users for admin.

---

**Mobile side is ready - just needs backend to return all users for admin!** ✅📱💬

