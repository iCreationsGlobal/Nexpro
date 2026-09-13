# Plan: Add "Other" Business Type + Loading State for Finish Setup

## Goal
1. Add an **"Other"** business type option to onboarding
2. When selected, let users specify their custom business type
3. Default `businessType` to **`shop`** in DB, but persist the custom type in metadata
4. Show **processing state** on the "Finish setup" button during phone validation so users know it's working

---

## Current State
- Business group selection uses `BUSINESS_GROUPS` including a `services` group labeled "Other services"
- `services` currently has one option: `other_professional_services` → `coreType: 'printing_press'` (studio)
- There is no free-text input for custom business types
- The submit button only shows loading AFTER phone check passes; during phone check it appears idle

---

## Proposed Changes

### 1. Frontend: Add "Other" option with free-text input
**File:** `Frontend/src/constants/businessTypes.js`

- Add a new business option:
  ```js
  {
    id: 'other',
    label: 'Other',
    description: 'My business type is not listed',
    group: BUSINESS_GROUPS.SERVICES,
    coreType: CORE_BUSINESS_TYPES.SHOP,
  }
  ```
- Keep existing `other_professional_services` option as-is for users who want "Professional services"

**File:** `Frontend/src/pages/Onboarding.jsx`

- In Step 2 (`businessSubType` select), detect when `field.value === 'other'`
- Render a text `<Input>` below the select for custom business type name
- Store the custom value in `businessSubType` (e.g., `"other-<sanitized_name>"` or just the raw text)
- Pass the custom value through to backend as `businessSubType`

### 2. Backend: Handle custom "Other" types gracefully
**File:** `Backend/controllers/tenantController.js` — `completeOnboarding()`

- No schema changes needed; `businessType` stays as `shop`
- `businessSubType` is already stored in `metadata.businessSubType`
- `shopType` can be set to `other` when custom type is used, so category seeding falls back to generic categories

**File:** `Backend/utils/categorySeeder.js`

- Already falls back to generic categories when `shopType` is unknown — no change needed

### 3. Frontend: Show loading on "Finish setup" during phone check
**File:** `Frontend/src/pages/Onboarding.jsx`

- Set `loading = true` **at the start** of `onSubmit()`, before the phone check
- Keep `loading = true` throughout phone validation and form submission
- The existing `loading={loading}` prop on the Button will show the spinner
- Add a small UX improvement: change button text to "Checking..." during phone validation, then "Finishing setup..." during submission

---

## UX Flow After Changes

1. User selects **"Other"** from business type grid
2. In Step 2, user sees a dropdown with "Other" selected + a text input: *"Describe your business type"*
3. User types e.g., "freight forwarding" → stored as `businessSubType: "freight_forwarding"`
4. Backend saves:
   - `tenant.businessType = 'shop'`
   - `metadata.businessSubType = 'freight_forwarding'`
   - `metadata.shopType = 'other'` (generic categories)
5. User clicks **Finish setup** → button immediately shows spinner + "Checking..." → then "Finishing setup..." → success toast

---

## Files to Modify

| File | Change |
|------|--------|
| `Frontend/src/constants/businessTypes.js` | Add `other` option to `BUSINESS_OPTIONS` |
| `Frontend/src/pages/Onboarding.jsx` | Add free-text input for "Other", update button loading UX |
| `Backend/controllers/tenantController.js` | No changes needed (already handles arbitrary `shopType`/`businessSubType`) |
| `Backend/utils/categorySeeder.js` | No changes needed (already falls back to generic categories) |

---

## Optional Enhancements
- Add a character limit or sanitization for the free-text input
- Show a preview: "We'll set up your workspace as a Shop with generic categories"
- Allow admin to later convert a custom "Other" type into a proper business type with dedicated features
