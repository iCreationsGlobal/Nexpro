# Sabito Store Mobile — Product Decisions

## App identity
- **Display name:** Sabito Store
- **Slug / scheme:** `sabito-buyer`
- **Bundle IDs:** `com.sabito.buyer` (iOS & Android)
- **Audience:** End shoppers on the Sabito Store marketplace (Ghana-first)

## Launch region & currency
- **Primary market:** Ghana
- **Default currency:** GHS
- **Delivery regions:** Ghana regions supported by storefront checkout (Greater Accra, Ashanti, etc.)

## Brand assets
- **Primary color:** `#166534` (Sabito Store green, aligned with ABS/Sabito storefront)
- **Logo:** `assets/images/icon.png` (derived from Sabito Store branding)
- **Splash:** Green background with centered Sabito Store mark

## Auth strategy (v1)
- Email/password, OTP login, Google Sign-In (via backend `/public/storefront/auth/google`)
- **Apple Sign In:** deferred to a follow-up release; not required for Android-first internal testing. Add before App Store submission if offering other social login on iOS.

## Commerce scope (v1)
- Marketplace browse (home, stores, products, studios, services)
- Single-store cart (matches web storefront constraint)
- Paystack checkout (card + mobile money via WebView + deep link verify)
- Orders, tracking, confirm received, disputes, reviews, wishlist, addresses
- Push notification registration (order/payment/delivery updates)

## Backend coupling
- Reuses existing `/api/public/marketplace/*` and `/api/public/storefront/*` endpoints
- Mobile-specific additions: product detail, checkout preview, push tokens, dispute inbox, Paystack webhook for storefront orders

## Deep links
- `sabito-buyer://checkout/paystack-callback?reference=...`
- `sabito-buyer://product/:id`
- `sabito-buyer://order/:id`
