# Sabito Store Mobile — API Contracts

Base URL: `{EXPO_PUBLIC_API_URL}/api`  
Auth header: `Authorization: Bearer <storefront_customer JWT>`

All responses follow `{ success: boolean, data?: T, message?: string, errorCode?: string }` unless noted.

Reference web clients: [storefront/src/services/storeService.js](../../storefront/src/services/storeService.js), [storefront/src/services/authService.js](../../storefront/src/services/authService.js)

---

## Marketplace (public)

| Method | Path | Query/body | Response `data` |
|--------|------|------------|-----------------|
| GET | `/public/marketplace/home` | — | `{ hero, categories, featuredProducts, popularStores, studios, services }` |
| GET | `/public/marketplace/food/home` | — | `{ hero, cuisineChips, openNearYou, restaurants, popularMeals, groceries, groceryProducts, drinks, fastDelivery, hasVendors }` |
| GET | `/public/marketplace/products/home` | — | `{ hero, categories, popularStores, featuredProducts, newArrivals, bestDeals, deliveryStores, hasVendors }` — non-food product discovery sections with store cards (`category`, `productCount`, `deliveryEnabled`, `pickupEnabled`, `deliveryFee`, rating) and product cards (`onSale`, `discountPercent`, availability, store summary) |
| GET | `/public/marketplace/stores` | `page`, `limit`, `search`, `shopType` | Store cards array + pagination. `shopType` accepts comma-separated values such as `restaurant,supermarket`. Cards include `shopType`, `cuisineTags`, `openingHours`, `avgPrepMinutes`, `isOpenNow`, `deliveryFee`, `freeDeliveryThreshold`, and rating summary when available. |
| GET | `/public/marketplace/stores/:slug` | — | Store home + featured listings |
| GET | `/public/marketplace/products` | `page`, `limit`, `search`, `category`, `storeSlug`, `shopType` | Product cards + pagination |
| GET | `/public/marketplace/products/:idOrSlug` | — | **Mobile addition** — single product with store, availability, reviews |
| GET | `/public/marketplace/categories` | — | Category list |
| GET | `/public/marketplace/studios` | `page`, `limit`, `search` | Studio cards |
| GET | `/public/marketplace/studios/:slug` | — | Studio home |
| GET | `/public/marketplace/services/home` | — | `{ hero, categories, featuredServices, popularStudios, bookableServices, quoteServices, hasProviders }` — service cards include `startingPrice`, `currency`, `durationMinutes`, `canBookOnline`, `canRequestQuote`, studio summary, and rating |
| GET | `/public/marketplace/services` | `page`, `limit`, `search`, `category` | Service listings |
| GET | `/public/marketplace/studios/:slug/services/:serviceSlug` | — | Service detail |
| GET | `/public/store/:slug` | — | Store settings (delivery, pickup, fees) |
| GET | `/public/store/:slug/products` | — | Full store catalog |

---

## Auth

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/public/storefront/auth/register` | `{ name, email, phone, password }` | `{ token, customer }` |
| POST | `/public/storefront/auth/login` | `{ email, password }` | `{ token, customer }` |
| POST | `/public/storefront/auth/google` | `{ idToken, signUp? }` | `{ token, customer }` |
| POST | `/public/storefront/auth/send-login-otp` | `{ email }` | `{ message }` |
| POST | `/public/storefront/auth/verify-login-otp` | `{ email, code }` | `{ token, customer }` |
| POST | `/public/storefront/auth/forgot-password` | `{ email }` | `{ message }` |
| POST | `/public/storefront/auth/reset-password` | `{ token, newPassword }` | `{ message }` |
| GET | `/public/storefront/auth/me` | — | `{ customer }` |
| PATCH | `/public/storefront/auth/profile` | `{ name?, phone? }` | `{ customer }` |

---

## Checkout & orders

### Checkout preview (mobile addition)
`POST /public/storefront/checkout/preview` (auth required)

```json
{
  "storeSlug": "my-shop",
  "items": [{ "listingId": "uuid", "quantity": 1 }],
  "fulfillmentMethod": "delivery",
  "deliveryAddress": { "recipientName", "phone", "line1", "city", "region" }
}
```

Response:
```json
{
  "store": { "slug", "displayName", "currency", "deliveryEnabled", "pickupEnabled", "deliveryFee" },
  "items": [{ "listingId", "title", "quantity", "unitPrice", "subtotal", "available" }],
  "subtotal": 0,
  "deliveryFee": 0,
  "deliveryFeeWaived": false,
  "freeDeliveryThreshold": null,
  "total": 0,
  "currency": "GHS",
  "fulfillmentMethod": "delivery"
}
```

### Paystack checkout
`POST /public/storefront/orders/initialize-paystack` — same body as preview; creates pending sale.

Response `data`:
```json
{
  "authorization_url": "https://checkout.paystack.com/...",
  "reference": "SF-...",
  "access_code": "...",
  "order": { "id", "saleNumber", "subtotal", "deliveryFee", "total", "currency" }
}
```

`POST /public/storefront/orders/verify-paystack` — `{ reference }` → confirmed order payload.

`GET /public/storefront/orders` — paginated order summaries.  
`GET /public/storefront/orders/:id` — detail + items + `reviewActions`, `deliveryTimeline`, `tradeAssurance`, `dispute`.  
`GET /public/storefront/orders/track?reference=&contact=` — guest tracking.

---

## Wishlist, addresses, reviews

Mirrors web storefront:
- `/public/storefront/wishlist` (GET/POST/toggle/DELETE)
- `/public/storefront/addresses` (CRUD + default)
- `/public/storefront/reviews/products|stores|services/:id` (GET public, POST auth)
- `/public/storefront/service-requests` (POST lead form)
- `POST /public/storefront/services/initialize-paystack` — `{ studioSlug, serviceSlug, serviceListingId?, preferredDate?, preferredTime?, message?, amount? }` → `{ authorization_url, reference, booking }`
- `POST /public/storefront/services/verify-paystack` — `{ reference }` → `{ booking: { jobId, jobNumber, paymentStatus, amountPaid, currency } }`

---

## Push & disputes (mobile additions)

| Method | Path | Body |
|--------|------|------|
| POST | `/public/storefront/notifications/register` | `{ token, platform: "ios"\|"android", deviceName? }` |
| DELETE | `/public/storefront/notifications/register` | `{ token }` |
| GET/PATCH | `/public/storefront/notifications/preferences` | `{ orderUpdates?, promotions? }` |
| GET | `/public/storefront/disputes` | paginated buyer dispute inbox |
| GET | `/public/storefront/disputes/:id` | dispute detail |

---

## Mobile-only backend gaps (addressed in this implementation)

1. `GET /marketplace/products/:idOrSlug` — product deep links
2. `POST /storefront/checkout/preview` — totals before Paystack
3. Push token registration + preferences on `StorefrontCustomer.metadata`
4. `GET /storefront/disputes` — buyer dispute inbox
5. Paystack webhook handler branch for `metadata.type === 'storefront_order'`
