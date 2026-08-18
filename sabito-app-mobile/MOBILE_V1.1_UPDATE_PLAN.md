# 🚀 Mobile App v1.1 Update Plan

## Overview
To bring the v1.1 backend/frontend upgrades into the React Native app, we are adding marketer-focused features directly in the mobile experience. The goal is to keep parity with web while preserving existing flows for free users.

## Feature Rollout Structure
1. **Upgrade to Professional (Marketers)** – in-app upsell + Paystack flow.
2. **Public/Private Visibility Toggle** – only for Professional marketers.
3. **AI Matching via Search Bar** – new AI-powered business matching, Pro-only.
4. **Public Marketplace Browse** – new Discover tab for businesses & marketers.

Features can ship incrementally; each is independent and guarded by plan checks.

---

## 1. Upgrade to Professional (Marketers)
### Goal
Let free marketers upgrade to the Professional plan inside the app, unlocking the new v1.1 capabilities.

### UI
- Show an upgrade banner/card on `MarketerDashboard` and `MarketerAccount` when `subscriptionPlan === 'free'`.
- Create `MarketerUpgradeScreen` summarising benefits, pricing (GHS 50/month or GHS 500/year), and FAQs.

### Payment Flow
- Reuse Paystack integration (existing payment modals) with the new `marketer-professional` plan slug.
- After payment success, call the backend upgrade endpoint, refresh the user profile, and show a success modal.

### Edge Cases
- Handle payment failures with retry prompts.
- Hide the banner once upgraded; show Pro-only tools instead.

---

## 2. Public / Private Visibility Toggle
### Goal
Give Professional marketers control over whether their profile appears in public searches.

### UI
- Add a visibility toggle in the marketer profile edit view.
- Label examples: `🌐 Public – businesses can find you` / `🔒 Private – only you initiate contact`.
- Hide/disable for free users; default remains private.

### API
- Wire to backend endpoint (`PATCH /api/marketer/profile/visibility`).
- Update local context/state after toggling so UI reflects changes immediately.

### Edge Cases
- Show error prompt if backend denies (e.g. not Pro or network failure).

---

## 3. AI Matching (Professional-Only)
### Goal
Let Professional marketers use OpenAI-backed matching to find high-fit businesses using the existing search bar.

### Entry Point
- On `MarketerDashboard` search bar, show a "✨ AI Match" icon/button when `subscriptionPlan === 'professional'`.

### MarketerAIMatchScreen
- Prefill the customer need from the search bar text.
- Additional optional inputs: location, budget, timeline.
- Display quota (`Matches this month: X of 10 used`).
- On submit: show loading state, call `POST /api/marketer/ai-match`, render results with match scores and reasons.

### Result Actions
- View business profile, start chat, save match, request partnership.
- Cache latest results locally to avoid double-charging quota.

### Quota Handling
- If quota exhausted, show friendly message and next reset date.
- Track usage via the backend `ai_match_usage` endpoint.

---

## 4. Public Marketplace Browse (Businesses & Marketers)
### Goal
Mirror the web marketplace so mobile-only users can browse without visiting the site.

### Navigation
- Add a `Discover` tab in the main navigator with two top tabs/toggles: `Businesses` and `Marketers`.

### Businesses View
- Filters: industry, location, rating, services, budget.
- Card component: company name, badges (Founder/Premium), stats, actions (view profile, invite).
- Pagination with infinite scroll or Load More.

### Marketers View
- Show only marketers whose visibility is Public.
- Card component: photo, badges (Founder/Top), rating, services, response time.
- Actions: view profile (if allowed), invite, message.

### API
- Reuse new endpoints:
  - `GET /api/public/businesses`
  - `GET /api/public/marketers`
- Support query params for filters, search, sorting, pagination.

### Edge Cases
- Display “No results” state and CTA to adjust filters.
- Placeholder skeletons while loading.

---

## Backend/API Checklist
- Confirm backend exposes:
  - `POST /api/marketer/upgrade` (Paystack callback / plan update).
  - `PATCH /api/marketer/profile/visibility`.
  - `POST /api/marketer/ai-match` + `GET usage` endpoint.
  - Existing `GET /api/public/businesses` & `GET /api/public/marketers`.
- Add any missing environment keys in `mobile/.env` (Paystack key, AI feature flag, API base URL).

---

## Release Strategy
1. **Phase 1**: Upgrade banner → payment flow → visibility toggle.
2. **Phase 2**: Discover tab with public browsing.
3. **Phase 3**: AI Match activation with feature flag (staged rollout).

Each phase can be tested independently; use feature flags/server config to disable if issues arise.

---

## Testing Checklist
- [ ] Free marketer sees upgrade banner; Pro marketer does not.
- [ ] Paystack flow completes and plan updates immediately.
- [ ] Visibility toggle only available to Pro; state sync works.
- [ ] AI Match button shows only for Pro; usage capped at 10/month.
- [ ] Discover tab loads businesses/marketers with filters and pagination.
- [ ] Error states (network, payment, quota) handled gracefully.

---

## Next Steps
- Scaffold `MarketerUpgradeScreen`, `MarketerAIMatchScreen`, and `DiscoverTabNavigator`.
- Implement API hooks in `src/api/` (upgrade, visibility, AI, public search).
- Gate new flows behind `subscriptionPlan` and environment feature flags for staged rollout.
