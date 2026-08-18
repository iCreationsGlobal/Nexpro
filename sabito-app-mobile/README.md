# Sabito Mobile (ABS)

Full marketer Expo app for African Business Suite Partner Program.

Design and marketer UX come from Sabito v1.1. Networking targets the ABS API (`/api/public/sabito-*`).

## What you get (full marketer surface)

- Onboarding + email/password signup & login
- Dashboard (balances, quick actions, recent activity)
- Businesses marketplace → apply to partner
- Referrals: list, create (email **or** phone match), details
- Earnings: commissions + cashout request + cashout history
- Account: profile edit, payment method (MoMo), theme, help/support, activities, logout
- All-activities feed (ABS-backed)

## Intentionally removed

- Business login
- Admin login
- Chat / Socket.IO
- Google auth / OTP / Paystack plan upgrade / AI match (not on ABS)

## Setup

```bash
cd sabito-mobile
cp .env.example .env
# Set EXPO_PUBLIC_ABS_API_URL=http://localhost:5001/api  (or your ABS API)
npm install
npx expo start
```

## Verify

- Backend: run migrations so partner referral/cashout tables exist
- Journey: sign up → browse businesses → apply → add referral → request cashout → business marks paid in ABS Settings → Sabito Partners

Auth token key: `sabito_marketer_token` (marketer JWT with `type: sabito_marketer`).

See [`docs/sabito-marketer-api.md`](../docs/sabito-marketer-api.md) for the API contract.
