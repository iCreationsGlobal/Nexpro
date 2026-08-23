---
name: ABS Rentals Module
overview: Add Rentals as a first-class ABS business type. Rental stock is managed through the existing Products catalogue and published through the existing Online Store. Company Assets > Equipment remains an internal-assets feature and is not changed.
todos:
  - id: rental-domain-contract
    content: Approve rental statuses, availability policy, deposit rules, and MVP scope.
    status: pending
  - id: rental-tenant-gating
    content: Add the rental business type, rental subtypes, features, plans, routes, and navigation gates.
    status: pending
    dependencies: [rental-domain-contract]
  - id: rental-schema
    content: Add product rental configuration and rental, item, event, return, charge, and optional unit tables with migrations and associations.
    status: pending
    dependencies: [rental-domain-contract]
  - id: rental-backend
    content: Implement tenant-safe rental APIs, pricing, allocation, availability, checkout, return, extension, and invoice/payment integration.
    status: pending
    dependencies: [rental-schema, rental-tenant-gating]
  - id: rental-web-app
    content: Build the ABS rental catalogue, rental workflow, return inspection, calendar, dashboard, and reports.
    status: pending
    dependencies: [rental-backend]
  - id: rental-storefront
    content: Extend the existing Online Store with rental listings, date selection, availability checks, and booking requests.
    status: pending
    dependencies: [rental-backend]
  - id: rental-mobile
    content: Add mobile staff workflows for viewing rentals, handover, return, photos, and overdue alerts.
    status: pending
    dependencies: [rental-backend]
  - id: rental-notifications-reports
    content: Add overdue and due-date notifications, rental reporting, exports, PDFs, and dashboard metrics.
    status: pending
    dependencies: [rental-backend]
  - id: rental-verification-rollout
    content: Complete unit, integration, and E2E coverage; pilot with a rental tenant; then enable the feature by plan.
    status: pending
    dependencies: [rental-web-app, rental-storefront, rental-mobile, rental-notifications-reports]
---

# ABS Rentals Module — Implementation Plan

## 1. Decision and scope

Build **Rentals inside ABS**, not as a separate RentDesk application.

Rentals will be a new tenant business type (`rental`) with configurable subtypes:

- General rental
- Equipment and tool hire
- Car rental
- Event furniture and décor
- Camera / AV rental

The first release is a general rental engine that supports equipment and quantity-based items. It must also support individual units so it is safe to use for cars, generators, cameras, or any item that requires a serial number, registration number, or condition history.

### Non-negotiable product boundary

**Products are the rental catalogue.** A rental tenant creates cars, equipment, chairs, or other hireable stock in **Products**. A product can be configured as:

- `sale` — existing ABS selling behaviour;
- `rental` — available only for hire; or
- `both` — can be rented and sold.

**Company Assets > Equipment is not part of Rentals.** It continues to track assets used internally by a business and receives no schema, UI, or behavioural change for this project.

### ABS capabilities that Rentals reuses

- Tenant isolation, onboarding, subscriptions, plans, platform administration
- Users, tenant roles, permissions, customers, vendors, branches/shops
- Products, categories, product images, stock and stock movements
- Payments, invoices, payment links, Paystack, expenses and accounting
- Notifications, email/SMS/WhatsApp integrations, PDFs and exports
- Dashboards, reporting, audit patterns, web app, Expo mobile app
- Online Store and `OnlineProductListing`

## 2. Operating model

### Rental lifecycle

```text
Draft / Booking request
        |
        v
Pending review -> Reserved -> Checked out -> Due today -> Overdue
                    |              |                         |
                    |              +---- Extension ----------+
                    v
                Cancelled

Checked out / Overdue -> Returned for inspection -> Closed
                                               |
                                               +-> Damage / late / missing charge
```

### Status meanings

| Status | Meaning | Blocks availability? |
|---|---|:---:|
| `draft` | Staff is preparing a rental. | No |
| `booking_request` | Submitted from the Online Store; staff has not accepted it. | No |
| `reserved` | Staff has accepted the booking or created a confirmed future reservation. | Yes |
| `checked_out` | The customer has collected the items. | Yes |
| `partially_returned` | At least one line/unit remains out. | Yes, for unreturned quantity |
| `returned_pending_inspection` | Items are back but condition and settlement are outstanding. | No |
| `closed` | Return, charges, and financial settlement are complete. | No |
| `cancelled` | The rental will not proceed. | No |

An expired reservation is automatically released. A `booking_request` does **not** block stock: otherwise an unreviewed public request could make the catalogue unavailable indefinitely. Once staff accepts it, it becomes `reserved` and blocks its date range.

### Availability rule

For a product and branch, availability for the requested interval is:

`rentable quantity − quantity allocated by overlapping reserved, checked-out, and partially-returned rentals`

The same calculation must execute inside the transaction that creates or confirms a rental. The Online Store availability preview is helpful, but it is never the final authority.

Use one documented interval convention everywhere: the return date is the date the item is due back; a new rental beginning that same day is permitted only after the return/handover time or date policy is satisfied. The MVP uses whole-day rentals and treats the end date as the final booked day; later releases may add time slots.

## 3. Product and data design

### 3.1 Extend the existing `Product` model

Keep all current product and sale fields. Add a migration with rental-specific fields:

| Field | Purpose |
|---|---|
| `productMode` | `sale`, `rental`, or `both`; default existing products to `sale`. |
| `rentalRate` | Base charge per configured billing period. |
| `rentalRateUnit` | `day`, `week`, or `month`. |
| `rentalDepositAmount` | Default security deposit per unit/order. |
| `rentalDepositType` | `fixed` or `percentage`. |
| `rentalQuantity` | Number that can be hired; defaults from stock where appropriate but remains deliberately configurable. |
| `requiresUnitAssignment` | Requires an exact car/camera/generator unit at checkout. |
| `rentalBufferDays` | Optional post-return preparation/cleaning buffer. |
| `rentalTerms` | Product-specific terms shown on the agreement/storefront. |

Do not use a completed sale to represent a rental and do not deduct `quantityOnHand` permanently when an item is checked out. Rental allocation is held in rental records; existing sales still reduce sale stock according to the current ABS rules.

### 3.2 New domain models

| Model | Key responsibility |
|---|---|
| `Rental` | Rental header: tenant, branch, customer, dates, status, totals, deposit, payment/invoice references, notes, source, and created/checked-out/returned actors. |
| `RentalItem` | Snapshots each product's name/SKU/rate/quantity/dates; owns line-level return state and allocation. |
| `RentalUnit` | Optional individually hireable unit for a product: serial/VIN/registration, status, condition, odometer/hours, and images. |
| `RentalItemUnit` | Records which exact unit was assigned to a rental item. |
| `RentalReturn` | Return event header: received by, returned time, overall notes and inspection state. |
| `RentalReturnItem` | Quantity/unit returned, condition, missing/damaged classification, notes, images, and assessed amount. |
| `RentalCharge` | Late, damage, cleaning, missing-item, fuel, or custom charge; amount, status, invoice/payment linkage. |
| `RentalEvent` | Immutable operational timeline: created, requested, reserved, payment recorded, checked out, extended, returned, charge raised, closed, cancelled. |

Every model includes `tenantId`, timestamps, appropriate tenant/branch indexes, and foreign keys. Add associations in `Backend/models/index.js`. Enforce tenant ownership for every referenced customer, product, branch, user, invoice and payment.

### 3.3 Rental-specific product units

Quantity-only rental products are sufficient for chairs, tables, tents and common tools. `RentalUnit` is mandatory only when `requiresUnitAssignment` is true. Examples:

- Cars: registration, VIN, make/model, odometer, fuel level, insurance/inspection metadata
- Cameras/generators: serial number, running hours, condition and accessory checklist
- Furniture: normally quantity-only, unless each asset must be identified

Car-only fields belong in `RentalUnit.metadata` during MVP. Move them to explicit columns only after car rental is validated as a dedicated product expansion.

## 4. Backend implementation

### 4.1 Tenant type, feature and plan gates

Update the following configuration and entitlement paths:

- `Backend/config/businessTypes.js`: add `rental`, subtypes, and permitted features.
- `Backend/config/features.js` and `Backend/config/modules.js`: add `rentalManagement`, `rentalProducts`, `rentalBookings`, `rentalReturns`, `rentalReports`, and `rentalOnlineStore`.
- Plan configuration: enable the module deliberately by plan, with limits for branches, staff, rental products and/or active rentals as required.
- Frontend business-type constants, onboarding, route guards, sidebar and tours.
- Mobile business-type/feature gates.

Existing tenants must not see Rentals until their business type and feature entitlement enable it.

### 4.2 API surface

Create `rentalController.js`, `rentalRoutes.js`, `rentalAvailabilityService.js`, `rentalPricingService.js`, and focused validation helpers. Every route uses existing authentication, tenant context and feature middleware.

Suggested tenant API endpoints:

```text
GET    /api/rentals                         list, search, filter by status/date/customer/branch
POST   /api/rentals                         create draft, reservation, or staff rental
GET    /api/rentals/:id                     detail with items, units, payments, return and timeline
PUT    /api/rentals/:id                     edit permitted fields before checkout
POST   /api/rentals/:id/reserve             confirm a reservation after atomic availability check
POST   /api/rentals/:id/checkout            assign units, capture handover, move to checked_out
POST   /api/rentals/:id/extend              quote and apply additional rental period/cost
POST   /api/rentals/:id/returns             record partial/full return and inspection evidence
POST   /api/rentals/:id/charges             add a damage/late/custom charge
POST   /api/rentals/:id/close               settle/refund deposit and close
POST   /api/rentals/:id/cancel              cancel before checkout; release allocation
GET    /api/rentals/availability            availability by product(s), branch, startDate, endDate
GET    /api/rentals/calendar                allocation/calendar data for a branch or product
GET    /api/rentals/:id/document            branded agreement/return document PDF

GET/POST/PUT /api/rental-units              manage exact units for eligible products
GET          /api/rentals/reports/...       rental revenue, utilisation, due, overdue, returns, charges
```

Use clear action endpoints instead of a generic status update: each transition has distinct validation, events, actors and side effects.

### 4.3 Transaction, pricing and concurrency rules

- Run creation, reservation confirmation, checkout and extension in database transactions.
- Lock the relevant rental rows/units or use a suitable conflict-safe allocation strategy before confirming availability.
- Store a rate and item-name snapshot on `RentalItem`; later product edits never rewrite a historical rental.
- Store rental duration, rate, discount, tax, subtotal and total snapshots on the rental.
- Calculate an extension only for additional chargeable time. Preserve the original dates and extension event.
- Generate late charges from a defined daily rate and grace policy; require staff review before charging in MVP.
- Treat deposit as a separate balance from rental revenue: `held`, `partially_applied`, `refunded`, or `forfeited`.
- Ensure all public booking calls are rate-limited and validated; do not expose tenant/private stock data.

### 4.4 Finance integration

Reuse the existing invoice/payment infrastructure rather than duplicating ledgers:

- Create a rental agreement/proforma before confirmation when staff chooses it.
- Link a confirmed rental to an invoice or payment request for rental fees and deposit.
- Record cash, mobile money, card, bank transfer and credit with existing payment methods.
- Create incremental invoice/payment items for extensions and approved charges.
- Refund or apply deposits with an explicit audit event; do not silently reduce balances.

The detailed accounting posting treatment should follow the current ABS Accounting module conventions and be verified before implementation; the Rentals module must not introduce a parallel accounting ledger.

## 5. ABS web application

### 5.1 Navigation

For rental tenants, show:

```text
Dashboard
Products
Rentals
Rental calendar
Customers
Invoices / Payments / Expenses
Reports
Online Store
Settings
```

Products retains its shared UI but shows rental fields and labels for rental tenants. Existing Shop POS/Sales is shown only if the rental tenant has enabled `both` product mode and the relevant sales feature; it is not required for the MVP.

### 5.2 Product experience

Extend `Frontend/src/pages/Products.jsx` rather than creating a duplicate rental inventory page:

- Add mode selector: Rent, Sell, or Both.
- Show daily/weekly/monthly rate, deposit and rentable quantity.
- Let staff turn on exact-unit assignment and then manage units/serials.
- Display current availability, reserved quantity and out-on-rent quantity.
- Keep the current images, categories, barcode and shop/branch patterns.

### 5.3 Rentals screens

- **Rentals list:** status/date/branch/customer filters, overdue and due-today indicators, export.
- **New rental:** select or create customer, select products, choose dates, validate availability, apply price/discount/deposit, create draft or reserve.
- **Rental detail:** financial summary, document, assigned items, condition, return date, payment/deposit state, event timeline and actions appropriate to status.
- **Checkout/handover:** confirm customer, assign exact units, capture initial condition/photo/checklist, take payment, produce agreement.
- **Return:** scan/search rental, record returned quantities, condition and photos, calculate/propose charges, then settle or mark pending review.
- **Calendar:** day/week/month product or branch availability view; manual staff reservations are visible.
- **Rental units:** product-level unit table/history for cars and serialized equipment.

### 5.4 Roles

Follow the existing ABS access matrix:

- Staff: create/view rentals for assigned scope, checkout and record returns; no unapproved refunds, deletion, pricing configuration or report export.
- Manager: approve charges, reservations, extensions, view branch reports and exports.
- Admin/owner: manage rental configuration, units, deposit refunds, policies, user scope and all reporting.

API enforcement is mandatory; hiding a navigation item is not sufficient.

## 6. Online Store booking

Use the existing `storefront/` application and `OnlineProductListing`; do not build a separate RentDesk storefront.

### 6.1 Listing changes

Add listing metadata/configuration for rental product presentation:

- rental/sale/both public mode
- displayed rental rate and billing unit
- deposit display policy
- rental-specific terms and pickup/return guidance
- whether online booking is enabled

Published rental products appear in the existing public tenant store, using the existing branding, store slug and product details foundation.

### 6.2 Booking flow

1. Shopper opens a rental product in the Online Store.
2. Shopper chooses quantity and start/return date.
3. The store requests availability from the public rental availability endpoint.
4. Shopper provides name, phone, optional email and notes, then submits a **booking request**.
5. ABS finds/creates the tenant customer and creates a `booking_request` rental with source `online_store`.
6. Staff receives a notification, reviews it in ABS, and accepts/rejects it.
7. Acceptance runs the authoritative availability check and changes it to `reserved`; staff can then send a deposit invoice/payment link.

This flow does not require online payment for the MVP. Existing storefront checkout for product sales stays separate. A later phase can add a deposit payment checkout after staff confirmation.

### 6.3 Public API and safety

```text
GET  /api/public/rentals/:tenantSlug/products
GET  /api/public/rentals/:tenantSlug/availability
POST /api/public/rentals/:tenantSlug/booking-requests
```

Use the existing public-store identity/branding lookup where practical. Validate date range, maximum booking window and contact details; rate-limit submissions and protect against duplicate retries with an idempotency key.

## 7. Mobile application

Add a Rentals tab or feature-gated entry in `mobile/` after the web workflow is stable:

- Today: due, overdue, pickups and returns
- Rental search and customer/rental detail
- Handover and return forms
- Camera capture for item-condition evidence
- Unit scan/search for serialised rentals
- Offline queue only for safe, draft evidence capture; checkout/return confirmation must reconcile availability and payments on the server
- Push notifications for due/overdue assignments and booking requests, respecting existing notification preferences

The web app is the release blocker for the rental lifecycle. Mobile does not block the first controlled tenant pilot if it would compromise correctness.

## 8. Notifications, documents, reporting

### Notifications

Use the existing notification system with new rental events:

- New Online Store booking request
- Reservation confirmed/cancelled
- Rental due tomorrow / due today / overdue
- Rental checked out, extended, returned
- Damage or late charge awaiting approval/payment
- Deposit refund due/completed

Make recipient roles and channels tenant-configurable. Scheduled due/overdue processing must be idempotent.

### Documents

Reuse ABS PDF patterns for:

- Rental agreement / handover form
- Booking confirmation / proforma
- Return and inspection report
- Charge invoice/receipt

Include tenant branding, customer, dates, item/rate snapshots, payment/deposit balances, terms, signatures/checklists where enabled, and document number.

### Reports and dashboard

MVP metrics:

- Rentals due today, overdue, checked out and upcoming reservations
- Rental revenue, deposits held, outstanding rental/charge balance
- Product utilisation and availability
- Late returns, damages, missing items and charge collection status
- Branch and staff breakdown where the current permission model permits

Keep rental revenue and deposits visually distinct. Add CSV/PDF export using existing report conventions.

## 9. Migration and rollout

### Migration strategy

1. Add nullable/defaulted rental columns to `products`; all current products default to `sale`.
2. Create new rental tables and indexes without changing the Equipment table.
3. Deploy backward-compatible backend support first.
4. Deploy UI and feature gates, disabled for existing tenants by default.
5. Create a pilot rental tenant and seed test products/units.
6. Enable public booking only after staff rental workflows and availability tests pass.

No existing sale, invoice, product, equipment or online listing data needs destructive conversion.

### Pilot acceptance scenarios

- Rent 10 chairs for overlapping and non-overlapping periods; reject the eleventh overlapping allocation.
- Reserve a generator, assign its exact serialised unit at checkout, extend it, return it damaged, and collect a charge.
- Submit an Online Store booking request, approve it in ABS, then verify it blocks dates.
- Cancel/expire a reservation and verify availability becomes free.
- Record a partial return; remaining units stay unavailable and visible as overdue where applicable.
- Record/refund/apply a deposit; verify invoices, payments and reports remain consistent.
- Verify a tenant cannot see, query, update or reserve another tenant's products/rentals.
- Verify staff/manager/admin API permissions, not just navigation visibility.

## 10. Test plan

### Backend

- Unit tests for duration, pricing, deposit, extension, late-fee and availability calculations.
- Transaction/concurrency integration tests for simultaneous reservations and checkout.
- Model/route tests for tenant isolation, association ownership and status transition validation.
- Invoice/payment integration tests for deposit, extension and charge workflows.
- Scheduled notification idempotency tests.

### Frontend and storefront

- Component tests for product rental configuration, availability messages, reservation actions and return inspection validation.
- Playwright tests in `e2e/` for staff rental lifecycle, roles, and Online Store booking submission.
- Responsive and accessibility checks for date fields, status messaging, error states and evidence upload.

### Release checks

- Run the relevant backend Jest suite, frontend Vitest suite, and Playwright rental flow.
- Apply migrations to a staging database and run a rollback/recovery rehearsal.
- Use a non-production tenant for Paystack/payment-link verification.
- Monitor rejected availability checks, failed jobs, unclosed rentals and booking-error rates during the pilot.

## 11. Out of scope for the initial release

- Automatic acceptance or automatic payment of public booking requests
- Hourly/time-slot rentals and delivery route optimisation
- GPS/telematics, driver verification, insurance workflows, traffic fines and full vehicle-fleet management
- Maintenance scheduling beyond marking a unit unavailable and recording notes
- A separate RentDesk brand, authentication system, tenant database, app or storefront

These can be added as focused extensions after the shared Rental lifecycle is live and validated.

## 12. Implementation order

1. Approve the lifecycle, availability, deposit and pricing policies in this plan.
2. Add business-type/feature gates and database migrations.
3. Build backend models, associations, availability/pricing services and action APIs with tests.
4. Extend Products for rental configuration and build the ABS Rentals web workflow.
5. Add documents, notifications, dashboard and reports.
6. Extend the Online Store with booking requests and staff review.
7. Add mobile handover/return workflows.
8. Pilot, correct operational edge cases, then expose the feature by subscription plan.

