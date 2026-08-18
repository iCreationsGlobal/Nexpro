# Sabito Store Mobile App

Dedicated Expo React Native app for Sabito Store marketplace shoppers in Ghana.

## Setup

```bash
cd sabito-buyer
cp env.example .env
npm install
npm start
```

Set `EXPO_PUBLIC_API_URL` to your backend origin (no `/api` suffix), e.g. `http://localhost:5001`.
When running in Expo Go on a physical phone, keep the backend running on the same network; the app converts local `localhost` config to the Expo dev machine host automatically.

## Features

- Marketplace home, explore (products/stores/services)
- Product detail, store pages, studio services
- Shopper auth (email/password, OTP)
- Cart, checkout preview, Paystack payment
- Orders, tracking, confirm received, disputes, reviews
- Wishlist, addresses, profile, push notification preferences

## Builds

```bash
npm run build:preview   # internal APK / device build via EAS
npm run build:ios
npm run build:android
```

Configure `EAS_PROJECT_ID` in `.env` and link the project with `eas init`.

## Deep links

- `sabito-buyer://checkout/paystack-callback?reference=...`
- `sabito-buyer://product/:id`
- `sabito-buyer://order/:id`

## Docs

- [Product decisions](./PRODUCT.md)
- [API contracts](./docs/API_CONTRACTS.md)
