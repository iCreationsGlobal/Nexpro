# Rental Module — Quick Reference

## What We're Building

A **native rental business type** in ABS that handles:
- Rental transactions (item borrowing with return date)
- Pre-bookings (future reservations with inventory hold)
- Damage tracking + repair cost estimation
- Late return charges
- Invoicing + payment integration

**NOT an external API integration** — full single-platform functionality.

---

## Key Design Principles

| Principle | What It Means | Benefit |
|-----------|---------------|---------|
| **Reuse, Don't Rebuild** | Use existing Expense, Invoice, Product, Customer models | Reduces complexity, integrates seamlessly |
| **Metadata for Extensions** | Store rental-specific customer data in `metadata.rental` | No new tables; flexible & extensible |
| **Separation of Concerns** | DamageReport (what) + Expense (cost) | Clean audit trail, financial integration |
| **Multi-Tenant First** | All queries filtered by tenantId | Data isolation, security |
| **Date-Range Aware** | Availability based on date overlaps | Prevents double-booking |

---

## Core Tables

**NEW (Just for Rentals):**
- `Rental` — rental transactions
- `RentalItem` — line items in rental
- `PreBooking` — future reservations
- `PreBookingItem` — line items in pre-booking
- `DamageReport` — damage inspection records

**EXTENDED (Add rental fields):**
- `Product` → add `isRentable`, `rentalRatePerDay`
- `Expense` → add `damageReportId` FK
- `Customer` → add `metadata.rental` JSONB

**REUSED (No changes):**
- `Invoice` — rental transactions create invoices
- `Payment` — track rental payments
- `Notification` — send rental alerts
- `Shop` — branch-level scoping

---

## Customer Rental Data (No New Table!)

**Stored in:** `Customer.metadata.rental` (JSONB)

**Structure:**
```json
{
  "guarantor": { name, phone, idType, idNumber, idExpiry },
  "emergencyContact": { name, phone, relationship },
  "riskProfile": { riskRating, creditLimit, credibilityScore },
  "verification": { idVerificationDate, idProofUrl },
  "preferences": { preferredPaymentMethod, autoExtend },
  "history": { totalRentals, totalRevenue, damageIncidents, lastRentalDate }
}
```

**Why JSONB?**
- Flexible: add new fields without migration
- Non-invasive: rental data isolated from core Customer fields
- Queryable: PostgreSQL JSONB supports filtering/indexing
- Pattern: ABS already does this for Sabito integration

**Docs:** [RENTAL_CUSTOMER_METADATA.md](RENTAL_CUSTOMER_METADATA.md)

---

## Damage → Expense Workflow (No New Expense Table!)

```
Rental Returned
    ↓
Staff Records Damage
    ↓
DamageReport Created ← Photos, damage type, severity
    ↓
Expense Auto-Created ← Links to DamageReport via damageReportId FK
    ↓
Manager Approves Cost
    ↓
Repair Completed
    ↓
Expense Marked Paid
    ↓
Rental Closes with Damage Settled
```

**Why Reuse Expense?**
- Expense already has approval workflows
- Expense already has payment methods, reconciliation
- Expense already scoped to branch (shopId)
- No new financial model needed

**Docs:** [RENTAL_DAMAGE_EXPENSE_WORKFLOW.md](RENTAL_DAMAGE_EXPENSE_WORKFLOW.md)

---

## Availability Calculation (Core Algorithm)

```javascript
availableQty = totalStock - activeRentals - priorBookings

where:
  totalStock = ProductShopStock.quantity for branch
  activeRentals = rentals with status='confirmed'|'active'
                  AND dates overlap
  preBookings = pre-bookings with status='pending'|'confirmed'
                AND dates overlap

dateOverlap: startA <= endB && startB <= endA
```

**Example:**
```
Product: Camera
Branch: Accra
Total Stock: 5 cameras

Rental 1: Aug 26-30 (active) → 1 camera taken
Pre-booking 1: Aug 28-Sep 2 (pending) → 1 camera reserved

Available for Aug 26-27: 5 - 1 - 0 = 4 cameras
Available for Aug 28-30: 5 - 1 - 1 = 3 cameras
Available for Aug 31-Sep 2: 5 - 0 - 1 = 4 cameras
```

---

## Rental Status Flow

```
pending → confirmed → active → returned → completed
   ↓                              ↓
   └─→ cancelled ←─────────────────┘
```

- **pending:** Just created, awaiting confirmation
- **confirmed:** Customer confirmed, items allocated
- **active:** Rental period started
- **returned:** Items returned, damage inspected
- **completed:** Damage settled, payment done
- **cancelled:** Cancelled before return

---

## Late Charge Auto-Calculation

```javascript
if (actualReturnDate > rentalEndDate) {
  LateCharge {
    daysLate = actualReturnDate - rentalEndDate
    chargePerDay = rentalRatePerDay * 0.5 // 50% of daily rate
    totalCharge = daysLate * chargePerDay
    status = 'pending'
  }
}
```

**When:** After rental returned (actualReturnDate set)  
**Who can waive:** Manager (via PATCH late-charge/:id/waive)

---

## Pre-Booking Workflow

```
Customer requests booking
    ↓
Pre-booking created (status: pending)
Proforma invoice auto-generated
    ↓
Manager reviews → may contact customer
    ↓
Customer confirms
    ↓
Convert to Rental (PATCH pre-booking/:id/confirm)
    ↓
Rental created with same items, dates, customer
Pre-booking status → converted
    ↓
Rental workflow continues (return → damage → settle)
```

**Key:** Pre-booking **holds inventory** (counts in availability)

---

## API Endpoints (Phase 1 MVP)

**Create Rental**
```
POST /api/rentals
Body: { customerId, items: [{productId, qty}], startDate, endDate, branchId?, paymentMethod, discount }
```

**List Rentals**
```
GET /api/rentals?status=&branchId=&customerId=&overdue=true
```

**Return Rental**
```
POST /api/rentals/:id/return
Body: { actualReturnDate, notes }
```

**Record Damage**
```
POST /api/rentals/:id/damage
Body: { rentalItemId, damageType, severity, description, photos[], estimatedCost }
```

**Extend Rental**
```
POST /api/rentals/:id/extend
Body: { newEndDate, reason }
```

**Check Availability**
```
GET /api/rentals/availability?productId=&startDate=&endDate=&branchId=
```

---

## Documentation Files

**Architecture & Planning:**
1. [RENTAL_MODULE_PLAN.md](RENTAL_MODULE_PLAN.md) — Overall architecture, data models, workflows
2. [RENTAL_ARCHITECTURE_DECISIONS.md](RENTAL_ARCHITECTURE_DECISIONS.md) — Key decisions & rationale

**Implementation Guides:**
3. [RENTAL_CUSTOMER_METADATA.md](RENTAL_CUSTOMER_METADATA.md) — How to store customer rental data (guarantor, risk, etc.)
4. [RENTAL_DAMAGE_EXPENSE_WORKFLOW.md](RENTAL_DAMAGE_EXPENSE_WORKFLOW.md) — How damage integrates with Expense model

**This File:**
5. [RENTAL_QUICK_REFERENCE.md](RENTAL_QUICK_REFERENCE.md) — 2-minute overview

---

## Development Checklist

**Phase 1–5:** ✅ Implemented (see P0–P2 completion in [RENTAL_STATUS_UPDATE.md](RENTAL_STATUS_UPDATE.md))

---

## Pilot Tenant Setup Checklist

Platform admins onboarding rental pilot tenants:

| Step | Action |
|------|--------|
| 1 | Set tenant `businessType = rental` (+ sub-type e.g. `equipment_rental`) |
| 2 | Assign **starter** or **professional** plan (starter gets `rentals` via business-type core override) |
| 3 | Admin → Tenants → **Access** tab: confirm Rentals is effective |
| 4 | Add rentable products in workspace (daily rate, stock, `isRentable`) |
| 5 | *(Optional)* Run `node scripts/seed-rental-pilot-tenant.js owner@email.com` |
| 6 | Admin → **Online Store setup**: enable store, publish listings with `commerceMode: rent` |
| 7 | Test storefront: `/api/public/store/:slug/rental-availability` + booking request |
| 8 | Staff: confirm pre-booking → checkout rental → return flow |

### Plan gating

| Plan | Base plan includes `rentals` | Rental business type gets `rentals` |
|------|------------------------------|-------------------------------------|
| starter | No | **Yes** (BUSINESS_TYPE_CORE_FEATURES) |
| professional | Yes | Yes |
| trial / enterprise | Yes | Yes |

Shop/studio/pharmacy tenants never receive `rentals` regardless of plan tier.

### Storefront booking requirements

All three must be true:

1. **Online store enabled** (`online_store_settings.enabled`)
2. **Effective `rentals` feature** (plan + business-type gates; checked on public endpoints)
3. **Published rentable listing** on the storefront

---

## Team Questions to Discuss

1. **Late charge grace period:** Allow 1 hour before charging? (e.g., return at 5:15 PM = no charge if 5 PM return time)
2. **Pre-booking expiry:** Cancel unreserved bookings after 30 days? 60 days?
3. **Damage liability:** Can customer sign waiver to opt out of damage charges?
4. **Credit limits:** Prevent customer from renting if they exceed credit limit?
5. **Notifications:** Send SMS or just email? (Use existing Notification model)
6. **Public storefront:** Include in Phase 2? Or later?

---

## Next Steps

1. ✅ P0–P2 implementation complete
2. ✅ Plan gating + pilot checklist (P2-10)
3. ⏭️ Onboard pilot rental tenants
4. ⏭️ Gather UAT feedback and iterate

---

## Summary in One Sentence

**ABS Rental Module = Time-bound Product Loan Management using existing Expense, Invoice, Product, Customer infrastructure + minimal new models (Rental, DamageReport) + JSONB metadata for customer extensions.**
