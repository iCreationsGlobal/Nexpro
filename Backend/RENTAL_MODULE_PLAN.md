# ABS Rental Module — Architecture & Implementation Plan

**Version:** 1.0  
**Date:** August 26, 2026  
**Scope:** Native rental business type for ABS (single platform, not external integration)  
**Status:** Planning

---

## 1. Module Overview

The Rental Module enables ABS to serve rental businesses (equipment hire, event furniture, camera rental, car rental, etc.) alongside existing business types (jobs, sales, pharmacies, etc.).

### Core Capabilities

- **Rental Lifecycle:** Create → Confirm (or Pre-booking) → Extend → Return → Inspect → Settle
- **Pre-bookings:** Reserve items for future periods (holds inventory, generates proforma)
- **Inventory Management:** Track rental vs. sale products; calculate availability over date ranges
- **Return & Damage:** Record condition on return; capture damage evidence (photos); auto-calculate charges
- **Accounting:** Link rentals to invoices, expenses, payment reconciliation
- **Reporting:** Dashboard, late returns, damage trends, revenue by product/branch
- **Multi-tenant & Multi-branch:** Full tenant isolation, branch-scoped operations
- **Public Storefront:** Optional booking channel (pre-bookings from public customers)

---

## 2. Data Model

### Core Tables

#### `Rental`
Represents a rental transaction (time-bound product hire).

```
id (UUID, PK)
tenantId (UUID, FK → Tenant)
customerId (UUID, FK → Customer)
branchId (UUID, FK → Shop/Branch) — nullable, default first branch
status (ENUM: pending, confirmed, active, returned, completed, cancelled)
startDate (DATE)
endDate (DATE)
actualReturnDate (DATE) — nullable, set on return
rentalDuration (INT) — days (calculated)
paymentMethod (VARCHAR: cash, mobile_money, card, credit)
amount (DECIMAL)
discountAmount (DECIMAL, default 0)
amountPaid (DECIMAL, default 0)
totalDue (DECIMAL) — amount + late charges + damage - discountAmount
notes (TEXT)
metadata (JSONB: extensionHistory[], damageReportIds[], proformaInvoiceId?, invoiceId?)
createdBy (UUID, FK → User)
updatedBy (UUID, FK → User)
createdAt, updatedAt (TIMESTAMPTZ)
```

#### `RentalItem`
Line items in a rental (which products, quantities, rates).

```
id (UUID, PK)
rentalId (UUID, FK → Rental)
productId (UUID, FK → Product)
branchId (UUID, FK → Shop/Branch) — where product came from
quantity (INT)
rentalRatePerDay (DECIMAL) — rate at time of rental
subtotal (DECIMAL) — quantity × rate × days
notes (TEXT)
createdAt, updatedAt (TIMESTAMPTZ)
```

#### `PreBooking`
Reserved rental for a future period (before rental starts).

```
id (UUID, PK)
tenantId (UUID, FK → Tenant)
customerId (UUID, FK → Customer)
branchId (UUID, FK → Shop/Branch)
status (ENUM: pending, confirmed, converted, expired, cancelled)
requestedStartDate (DATE)
requestedEndDate (DATE)
convertedToRentalId (UUID, FK → Rental) — nullable, set when converted
proformaInvoiceId (UUID, FK → Invoice) — nullable
notes (TEXT)
metadata (JSONB: requestedItems[], source: 'staff'|'public_storefront')
createdBy (UUID, FK → User)
createdAt, updatedAt (TIMESTAMPTZ)
```

#### `PreBookingItem`
Line items in a pre-booking.

```
id (UUID, PK)
preBookingId (UUID, FK → PreBooking)
productId (UUID, FK → Product)
branchId (UUID, FK → Shop/Branch)
quantity (INT)
requestedRatePerDay (DECIMAL)
createdAt, updatedAt (TIMESTAMPTZ)
```

#### `DamageReport`
Record damage on return.

```
id (UUID, PK)
rentalId (UUID, FK → Rental)
itemId (UUID, FK → RentalItem)
damageType (VARCHAR: minor, moderate, severe, total_loss)
description (TEXT)
estimatedRepairCost (DECIMAL)
photoUrls (TEXT[]) — array of uploaded image paths
inspectedBy (UUID, FK → User)
inspectedAt (TIMESTAMPTZ)
createdAt, updatedAt (TIMESTAMPTZ)
```

#### `RentalExtension`
Record when a rental is extended (history).

```
id (UUID, PK)
rentalId (UUID, FK → Rental)
originalEndDate (DATE)
newEndDate (DATE)
additionalCost (DECIMAL)
reason (VARCHAR)
approvedBy (UUID, FK → User)
createdAt (TIMESTAMPTZ)
```

#### `LateCharge`
Auto-calculated charges for late returns.

```
id (UUID, PK)
rentalId (UUID, FK → Rental)
daysLate (INT)
chargePerDay (DECIMAL)
totalCharge (DECIMAL)
status (ENUM: pending, paid, waived, cancelled)
invoiceLineId (UUID, FK → InvoiceLine) — nullable, linked to final invoice
createdAt, updatedAt (TIMESTAMPTZ)
```

#### Reuse Existing Tables

- **Product:** Add fields `rentalRatePerDay` (for rentals), `isSalable`, `isRentable`
- **ProductShopStock:** Track inventory per branch; used for availability calculation
- **Invoice:** Link to Rental via `metadata.rentalId` or foreign key
- **Quote:** Reuse for proformas from pre-bookings

---

## 3. API Endpoints

### Rental Operations

**Create Rental**
```
POST /api/rentals
Body: { customerId, items: [{productId, quantity}], startDate, endDate, paymentMethod, discount, notes, branchId? }
Returns: Rental
```

**Get Rental**
```
GET /api/rentals/:id
Returns: Rental (with items, damage reports, extensions, late charges)
```

**List Rentals**
```
GET /api/rentals?status=&branchId=&customerId=&startDate=&endDate=&overdue=true
Returns: Paginated rentals
```

**Extend Rental**
```
POST /api/rentals/:id/extend
Body: { newEndDate, reason }
Returns: Rental (updated), RentalExtension record
```

**Record Return**
```
POST /api/rentals/:id/return
Body: { actualReturnDate, notes }
Returns: Rental (updated to status: returned)
```

**Inspect Damage**
```
POST /api/rentals/:rentalId/damage
Body: { itemId, damageType, description, estimatedRepairCost, photos[] }
Returns: DamageReport
```

**Confirm Rental Payment**
```
POST /api/rentals/:id/confirm-payment
Body: { amountPaid }
Returns: Rental (updated amountPaid, status: completed if fully paid)
```

### Pre-Booking Operations

**Create Pre-Booking**
```
POST /api/pre-bookings
Body: { customerId, items: [{productId, quantity}], startDate, endDate, notes, branchId? }
Returns: PreBooking + auto-generated Proforma Invoice
```

**Confirm Pre-Booking (Convert to Rental)**
```
POST /api/pre-bookings/:id/confirm
Body: { paymentMethod, notes }
Returns: Rental (converted from pre-booking)
```

**List Pre-Bookings**
```
GET /api/pre-bookings?status=&branchId=&customerId=&startDate=&endDate
Returns: Paginated pre-bookings
```

### Availability Check

**Check Availability**
```
GET /api/rentals/availability?productId=&startDate=&endDate&branchId=
Returns: { productId, availableQty, bookedQty, preboookedQty, totalQty }
```

Logic:
```
availableQty = totalQty 
  - (rentals in date range where status IN (confirmed, active))
  - (pre-bookings in date range where status IN (pending, confirmed))
```

### Late Charges & Returns Report

**List Late Returns**
```
GET /api/rentals/late-returns?period=this_month&status=pending
Returns: Paginated rentals with daysLate, auto-calculated charges
```

**Waive Late Charge**
```
POST /api/late-charges/:id/waive
Body: { reason }
Returns: LateCharge (status: waived)
```

---

## 4. Business Workflows

### Workflow 1: Create & Complete a Rental

```
1. GET /api/rentals/availability → confirm items available for dates
2. POST /api/rentals → create rental (status: pending)
3. (Optional) POST /api/rentals/:id/proforma → generate quote
4. POST /api/rentals/:id/confirm-payment → mark payment received
5. [At return] POST /api/rentals/:id/return → record return date
6. POST /api/rentals/:id/damage (if needed) → inspect & record damage
7. [Auto] LateCharge calculated if actualReturnDate > endDate
8. POST /api/invoices → create final invoice (rental + late charges + damage)
9. [Auto] Rental status → completed when invoice paid
```

### Workflow 2: Pre-Booking → Rental

```
1. POST /api/pre-bookings → create pre-booking (status: pending, auto-proforma)
   - Pre-booking reserves inventory for availability checks
2. [Auto] Proforma invoice created (awaiting payment/confirmation)
3. POST /api/pre-bookings/:id/confirm → convert to rental (status: confirmed)
   - Creates Rental with same items/dates
   - Pre-booking status → converted
4. [Same as Workflow 1 from step 4]
```

### Workflow 3: Extend a Rental

```
1. POST /api/rentals/:id/extend → extend rental
   - Validates new end date does not conflict with other rentals/pre-bookings
   - Calculates additional cost (rate × extra days)
   - Updates Rental.endDate
   - Records RentalExtension (for audit)
2. [Optional] Update payment method / amountPaid
3. Continue with return workflow
```

---

## 5. Availability Calculation

### Algorithm

```javascript
async function getAvailability(productId, startDate, endDate, branchId) {
  // 1. Get total quantity in branch
  const stock = await ProductShopStock.findOne({ productId, branchId });
  const totalQty = stock.quantity;

  // 2. Count units in active rentals (overlapping date range)
  const activeRentals = await Rental.count({
    where: {
      status: ['confirmed', 'active'],
      startDate <= endDate,
      endDate >= startDate,
      items: { productId, branchId }
    }
  });

  // 3. Count units in pre-bookings (overlapping date range)
  const preBookings = await PreBooking.count({
    where: {
      status: ['pending', 'confirmed'],
      requestedStartDate <= endDate,
      requestedEndDate >= startDate,
      items: { productId, branchId }
    }
  });

  const availableQty = totalQty - activeRentals - preBookings;
  return { productId, totalQty, activeRentals, preBookings, availableQty };
}
```

### Date Range Overlap

Two date ranges overlap if:
```
startA <= endB && startB <= endA
```

---

## 6. Integration with Existing ABS Modules

### Products & Inventory

- Add fields to `Product`: `isRentable` (boolean), `rentalRatePerDay` (DECIMAL)
- Use existing `ProductShopStock` for branch-level inventory
- Restock workflow: same as sales (purchase → stock in)

### Customers

- Rentals attach to existing `Customer` records
- Rental-specific data stored in `Customer.metadata.rental` (JSONB, non-invasive)
- Rental history visible on customer profile
- Customer credit/payment status tracked via existing `Payment` model

**Rental Metadata Structure** (added to Customer.metadata):
```json
{
  "rental": {
    "guarantorName": "John Doe",
    "guarantorPhone": "+233201234567",
    "guarantorIdType": "ghanaCard|passport|drivingLicense",
    "guarantorIdNumber": "GHA-XXXX-XXXX-XXXX-XXXX",
    "guarantorIdExpiry": "2027-06-15",
    "emergencyContact": {
      "name": "Jane Doe",
      "phone": "+233209876543",
      "relationship": "Sister"
    },
    "riskRating": "low|medium|high",
    "riskNotes": "Previous late return incident",
    "idVerificationDate": "2026-08-26",
    "idVerificationProof": "url_to_photo_or_document",
    "rentalPreferences": {
      "preferredPaymentMethod": "mobile_money",
      "creditLimitForRentals": 5000.00
    },
    "rentalHistory": {
      "totalRentals": 12,
      "totalLateCharges": 250.00,
      "damageIncidents": 2,
      "lastRentalDate": "2026-08-20"
    }
  }
}
```

- Fields updated via PATCH `/api/customers/:id` with `metadata.rental` payload
- Flexible schema: businesses can add custom fields without DB migration

### Invoices & Accounting

- `Rental` → auto-creates `Invoice` on return completion
- Invoice lines: rental items + late charges + damage charges
- Journal entries: revenue (rental), receivable (if credit), expense (damage repair)
- GL accounts: Rental Revenue, Receivable - Rentals, Rental Damage Expense

### Expenses & Reconciliation

**Reuse existing `Expense` model** — no new expense table needed.

When damage is recorded:
1. **DamageReport** created: records *what happened* (damage type, photos, condition)
2. **Expense** created: records *the cost* (repair/replacement cost)
   - `category: "Rental Damage"` or `"Rental Repair"`
   - `description: "Damage to [Product] - Rental #REN-2026-08-001"`
   - `amount: estimatedRepairCost` (from DamageReport)
   - Add new optional FK: `damageReportId` (link back to DamageReport for audit trail)
   - `shopId: branchId` (expense tracked to branch where rental occurred)
   - `status: "pending"` initially; marked `"paid"` when repair completed

Example Expense fields for rental damage:
```javascript
{
  expenseNumber: "EXP-2026-08-001",
  shopId: "branch-uuid",
  damageReportId: "damage-report-uuid", // NEW: link to damage record
  category: "Rental Damage",
  description: "Camera lens replacement - Rental #REN-2026-08-115",
  amount: 850.00, // Repair cost
  expenseDate: "2026-08-26",
  paymentMethod: "bank_transfer",
  status: "pending",
  approvalStatus: "pending_approval"
}
```

**Workflow:**
- Damage inspected → DamageReport records condition + estimated cost
- Auto-create Expense with `damageReportId` (tracking link)
- Manager approves Expense
- Once paid, Expense status → `paid`, and damage liability settled
- Closing balances: rental payments minus damage expenses = net branch revenue

### Dashboard

- Rental KPIs: active rentals, due back today, overdue, late charges pending
- Revenue: rentals vs. sales (by period, product, branch)
- Damage trends: frequency, cost
- Customer segment: rental-only vs. rental+sales

### Notifications & Events

- Email on: new pre-booking (manager), rental due back (staff), late return alert, damage reported
- Webhook events: rental.created, rental.confirmed, rental.returned, damage.reported

### Multi-Branch

- `branchId` on Rental, PreBooking, RentalItem
- Staff see only rentals for assigned branch (via role/permissions)
- Managers see cross-branch dashboards & reports

---

## 7. Key Implementation Guides

**See companion documents for detailed implementation:**

1. [RENTAL_CUSTOMER_METADATA.md](RENTAL_CUSTOMER_METADATA.md) — How to store guarantor, emergency contact, risk profile, and verification data in Customer.metadata JSONB (no new table needed)

2. [RENTAL_DAMAGE_EXPENSE_WORKFLOW.md](RENTAL_DAMAGE_EXPENSE_WORKFLOW.md) — How DamageReport integrates with existing Expense model (no new expense table; damage cost tracked via expenseId FK)

---

## 8. Phased Implementation

### Phase 1: MVP (Core Rental Operations)
- [ ] Models: Rental, RentalItem, PreBooking, PreBookingItem, DamageReport
- [ ] Endpoints: create rental, return, damage inspect, extend, list, availability
- [ ] Availability calculation (date range logic)
- [ ] Basic dashboard: active rentals, due back
- [ ] Late charge auto-calculation
- **Timeline:** 2–3 weeks
- **Scope:** Staff can issue rentals, track returns, record damage

### Phase 2: Pre-Bookings & Proformas
- [ ] Pre-booking workflow (create, confirm, convert to rental)
- [ ] Auto-generate proforma invoices
- [ ] Public storefront booking channel (optional)
- [ ] Availability includes pre-bookings
- **Timeline:** 1–2 weeks
- **Scope:** Reserve items; customers can book online

### Phase 3: Invoicing & Payment Integration
- [ ] Auto-create invoices from rentals
- [ ] Late charge integration with invoicing
- [ ] Damage charge integration
- [ ] Paystack payment links for rental invoices
- **Timeline:** 1 week
- **Scope:** Complete financial flow

### Phase 4: Reporting & Analytics
- [ ] Rental dashboard (revenue, KPIs, trends)
- [ ] Late returns report
- [ ] Damage report
- [ ] Customer rental history
- **Timeline:** 1 week
- **Scope:** Managers can analyze rental business

### Phase 5: Notifications & Compliance
- [ ] Email notifications (pre-booking, due back, overdue, damage)
- [ ] SMS alerts (optional)
- [ ] Tenant audit trail (who did what)
- **Timeline:** 1 week

---

## 8. File Structure

```
Backend/
├── models/
│   ├── Rental.js
│   ├── RentalItem.js
│   ├── PreBooking.js
│   ├── PreBookingItem.js
│   ├── DamageReport.js
│   ├── RentalExtension.js
│   ├── LateCharge.js
│   └── index.js (add requires + relationships)
├── controllers/
│   ├── rentalController.js (create, get, list, extend, return, confirm payment)
│   ├── preBookingController.js (create, confirm, list)
│   └── rentalAvailabilityController.js (availability check, late returns)
├── services/
│   ├── rentalAvailabilityService.js (date range logic, conflict detection)
│   ├── rentalInvoiceService.js (auto-generate invoices, late charges)
│   ├── rentalDamageService.js (calculate repair costs, assign liability)
│   └── rentalNotificationService.js (email alerts)
├── routes/
│   ├── rentalRoutes.js
│   ├── preBookingRoutes.js
│   └── rentalAvailabilityRoutes.js
├── migrations/
│   ├── create-rental-models.js (Rental, RentalItem, PreBooking, PreBookingItem)
│   ├── create-damage-report-table.js
│   ├── create-rental-extension-table.js
│   ├── create-late-charge-table.js
│   └── add-rental-fields-to-products.js (isRentable, rentalRatePerDay)
├── __tests__/
│   ├── rental.test.js (CRUD, availability, workflows)
│   ├── preBooking.test.js
│   └── availability.test.js (date range logic)
```

---

## 9. Key Design Decisions

1. **Rental ≠ Quote:** Rentals are time-bound transactions; Quotes are price estimates. Rentals can generate Quotes for payment requests.

2. **Pre-Booking as Reservation:** Pre-bookings hold inventory and block availability for other customers. They're not auto-confirmed; staff must explicitly convert them.

3. **Damage Liability:** Damage costs are calculated upfront (estimate) and reconciled at payment time. Repair costs are tracked as expenses.

4. **Late Charges:** Auto-calculated daily from return date. Can be waived by manager (audit trail). Included in final invoice.

5. **Inventory Tracking:** Rentals reduce available stock for the rental period only. Returned items go back to available stock.

6. **Multi-Tenant Safety:** All queries scoped by `tenantId`. Branch filtering applied at role level.

7. **Extensibility:** Use JSONB `metadata` fields for future rental-specific data (insurance, damage waivers, etc.).

---

## 10. Success Metrics (Post-Launch)

- Staff can create and return rentals in <2 minutes per transaction
- Availability checks accurate (no double-booking)
- Damage tracking reduces disputes
- Late charge calculations reduce admin overhead
- Pre-booking conversion rate >70% (indicates reservation → sale)
- Rental revenue visibility in dashboards

---

## 11. Next Steps

1. **Confirm scope:** Are pre-bookings Phase 1 or Phase 2?
2. **Confirm integration:** Should public storefront be built now or later?
3. **Timeline:** How urgent? MVP in 2 weeks or 1 month?
4. **Priorities:** Which workflows matter most first?

---

This plan treats rentals as a **first-class business type in ABS**, not an external integration. All data stays in one database, all operations go through a single API, all reporting is in one platform.
