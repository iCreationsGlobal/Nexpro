# Rental Module — Architecture Diagram

## Data Model (Tables & Relationships)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXISTING ABS INFRASTRUCTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │   Tenant     │    │    Shop     │    │   Customer   │    │  Product   │  │
│  │ (Org level)  │    │  (Branch)   │    │ metadata     │    │ isRentable │  │
│  │              │    │             │    │ .rental{ ... │    │ rentalRate │  │
│  └──────┬───────┘    └────┬────────┘    │            } │    │            │  │
│         │                  │              └──────┬──────┘    └────────────┘  │
│         │                  │                     │                           │
└─────────┼──────────────────┼─────────────────────┼───────────────────────────┘
          │                  │                     │
┌─────────┴──────────────────┴─────────────────────┴───────────────────────────┐
│                  RENTAL MODULE (NEW TABLES)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌────────────────┐         ┌─────────────────┐                              │
│  │    Rental      │◄────────│   RentalItem    │                              │
│  │                │         │                 │                              │
│  │ • tenantId     │         │ • rentalId      │                              │
│  │ • customerId   │         │ • productId     │                              │
│  │ • branchId     │         │ • quantity      │                              │
│  │ • startDate    │         │ • ratePerDay    │                              │
│  │ • endDate      │         │ • subtotal      │                              │
│  │ • status       │         │                 │                              │
│  │ • amount       │         └─────────────────┘                              │
│  │ • metadata     │                                                           │
│  │   (extensions) │                                                           │
│  └────────────────┘                                                           │
│         │                                                                     │
│         │                                                                     │
│  ┌──────┴──────────────────┐                                                 │
│  │   DamageReport (NEW)    │                                                 │
│  │                         │                                                 │
│  │ • rentalId              │                                                 │
│  │ • damageType            │                                                 │
│  │ • severity              │                                                 │
│  │ • photos[]              │                                                 │
│  │ • estimatedCost         │                                                 │
│  │ • expenseId ────────────┼──────────────┐                                 │
│  │ • status                │              │                                 │
│  └─────────────────────────┘              │                                 │
│                                            │                                 │
└────────────────────────────────────────────┼─────────────────────────────────┘
                                             │
┌────────────────────────────────────────────┼─────────────────────────────────┐
│                EXISTING ABS FINANCIAL MODELS                                │
├────────────────────────────────────────────┼─────────────────────────────────┤
│                                             │                                │
│  ┌──────────────────────────────────────────┴──────┐                        │
│  │            Expense (EXISTING)                   │                        │
│  │                                                 │                        │
│  │ • expenseNumber                                │                        │
│  │ • category: "Rental Damage"                   │                        │
│  │ • description: "Damage to..."                 │                        │
│  │ • amount: (from DamageReport)                 │                        │
│  │ • shopId: (branch)                            │                        │
│  │ • damageReportId ◄─── LINKS BACK             │                        │
│  │ • approvalStatus                              │                        │
│  │ • status (pending → paid)                     │                        │
│  └──────────────┬───────────────────────────────┘                        │
│                 │                                                          │
│  ┌──────────────┴───────────────────────────────┐                        │
│  │         Invoice (EXISTING)                   │                        │
│  │                                               │                        │
│  │ • invoiceNumber                              │                        │
│  │ • customerId (from Rental)                   │                        │
│  │ • metadata.rentalId ◄─── Links to Rental    │                        │
│  │ • lines: [                                   │                        │
│  │     Rental amount,                           │                        │
│  │     Late charges,                            │                        │
│  │     Damage charges (from Expense),           │                        │
│  │     Discount                                 │                        │
│  │   ]                                          │                        │
│  │ • totalAmount                                │                        │
│  │ • status (issued → paid)                     │                        │
│  └────────────────────────────────────────────┘                        │
│                                                                          │
│  ┌────────────────────────────────────────────┐                        │
│  │      Payment (EXISTING)                    │                        │
│  │                                             │                        │
│  │ • invoiceId                                │                        │
│  │ • amount                                   │                        │
│  │ • paymentMethod (cash, mobile, card, etc) │                        │
│  │ • status (pending → completed)             │                        │
│  └────────────────────────────────────────────┘                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

LEGEND:
  ◄──── Foreign Key (FK) relationship
  ─────► Data flows
```

---

## Workflow: Rental Start to Finish

```
START: Create Rental
│
├─ Staff selects Customer
├─ Staff selects Products + Qty
├─ Staff sets Rental Dates (startDate, endDate)
├─ System checks Availability
│  └─ GET /api/rentals/availability
│     Returns: availableQty for each product
├─ Staff applies Discount (optional)
├─ Rental CREATED
│  └─ status: 'pending'
│     Rental.amount = calculated
│
├─ MIDDLE: Rental Active
│  └─ Rental.status: 'confirmed' → 'active'
│     Items with customer
│
├─ Staff can EXTEND rental
│  └─ POST /api/rentals/:id/extend
│     Calculate extra days cost
│     Update Rental.endDate
│
├─ END: Return Items
│  └─ POST /api/rentals/:id/return
│     Staff records actualReturnDate
│     Rental.status: 'returned'
│
├─ DAMAGE INSPECTION (if needed)
│  ├─ POST /api/rentals/:id/damage
│  │  └─ DamageReport created
│  │     status: 'pending_approval'
│  │
│  ├─ AUTO: Create Expense
│  │  └─ Expense.damageReportId = DamageReport.id
│  │     category: "Rental Damage"
│  │     amount: estimatedRepairCost
│  │     status: 'pending'
│  │
│  └─ PATCH /api/expenses/:id
│     └─ Manager approves/adjusts cost
│        expenseStatus: 'approved'
│        Damage → 'approved'
│
├─ CALCULATE LATE CHARGES (automatic)
│  ├─ if actualReturnDate > endDate:
│  │  └─ LateCharge record created
│  │     totalCharge = daysLate × (dailyRate × 0.5)
│  └─ else: no late charges
│
├─ CLOSE RENTAL & CREATE INVOICE
│  ├─ totalDue = rentalAmount + lateCost + damageCost - discount
│  ├─ Invoice.create()
│  │  ├─ Line 1: Rental amount
│  │  ├─ Line 2: Late charges (if any)
│  │  ├─ Line 3: Damage charges (if any)
│  │  ├─ Line 4: Discount (if any)
│  │  └─ Invoice.metadata.rentalId = Rental.id
│  │
│  └─ Rental.status: 'completed'
│
├─ PAYMENT (via existing Payment system)
│  ├─ Invoice sent to customer
│  ├─ Customer pays (cash, mobile, Paystack, etc)
│  ├─ Payment recorded
│  ├─ Invoice status: 'paid'
│  │
│  └─ Auto-update Customer.metadata.rental.history
│     ├─ totalRentals++
│     ├─ totalRevenue += rentalAmount
│     ├─ totalLateCharges += lateCost
│     ├─ totalDamageCost += damageCost
│     └─ lastRentalDate = today
│
└─ END: Rental Settled
   All accounting complete
   Customer history updated
   Ready for next rental
```

---

## Availability Calculation Algorithm

```
GET /api/rentals/availability?productId=P1&startDate=2026-08-26&endDate=2026-08-30&branchId=B1

Step 1: Get Total Stock in Branch
┌─────────────────────────────────────────┐
│ SELECT quantity FROM product_shop_stocks│
│ WHERE productId = P1 AND shopId = B1    │
│ Result: 5 cameras total                 │
└─────────────────────────────────────────┘

Step 2: Count Active Rentals (Overlapping Dates)
┌──────────────────────────────────────────────────────────┐
│ SELECT COUNT(*) FROM rental_items ri                     │
│ JOIN rentals r ON ri.rentalId = r.id                    │
│ WHERE ri.productId = P1                                  │
│   AND r.branchId = B1                                    │
│   AND r.status IN ('confirmed', 'active')               │
│   AND r.startDate <= 2026-08-30   ◄─── Date overlap    │
│   AND r.endDate >= 2026-08-26     ◄─── logic            │
│                                                           │
│ Active rentals in date range: 1 camera                  │
└──────────────────────────────────────────────────────────┘

Step 3: Count Pre-Bookings (Overlapping Dates)
┌──────────────────────────────────────────────────────────┐
│ SELECT COUNT(*) FROM pre_booking_items pbi              │
│ JOIN pre_bookings pb ON pbi.preBookingId = pb.id       │
│ WHERE pbi.productId = P1                                │
│   AND pb.branchId = B1                                  │
│   AND pb.status IN ('pending', 'confirmed')            │
│   AND pb.requestedStartDate <= 2026-08-30              │
│   AND pb.requestedEndDate >= 2026-08-26                │
│                                                           │
│ Pre-bookings in date range: 2 cameras                  │
└──────────────────────────────────────────────────────────┘

Step 4: Calculate Available
┌────────────────────────────────────────┐
│ available = 5 - 1 - 2 = 2 cameras     │
│                                        │
│ Response:                              │
│ {                                      │
│   productId: "P1",                    │
│   totalStock: 5,                      │
│   activeRentals: 1,                   │
│   preBookings: 2,                     │
│   availableQty: 2,                    │
│   dateRange: {                        │
│     startDate: "2026-08-26",          │
│     endDate: "2026-08-30"             │
│   }                                    │
│ }                                      │
└────────────────────────────────────────┘
```

---

## Customer Risk Profile (Auto-Updated)

```
INITIAL STATE (First Rental)
┌─────────────────────────────────────────┐
│ customer.metadata.rental = {            │
│   riskProfile: {                        │
│     riskRating: 'low',                 │
│     credibilityScore: 100,              │
│     creditLimitForRentals: 5000         │
│   },                                    │
│   history: {                            │
│     totalRentals: 0,                    │
│     totalLateCharges: 0,                │
│     totalDamageIncidents: 0             │
│   }                                     │
│ }                                       │
└─────────────────────────────────────────┘

AFTER 3 RENTALS: All good
┌─────────────────────────────────────────┐
│ history: {                              │
│   totalRentals: 3,                      │
│   totalRevenue: 8400,                   │
│   totalLateCharges: 0,                  │
│   totalDamageIncidents: 0               │
│ }                                       │
│                                         │
│ riskRating: 'low'  ◄─ No issues        │
│ credibilityScore: 100                   │
└─────────────────────────────────────────┘

AFTER LATE RETURN
┌─────────────────────────────────────────┐
│ history: {                              │
│   totalRentals: 4,                      │
│   totalLateCharges: 250,  ◄─ + 250     │
│   totalDamageIncidents: 0               │
│ }                                       │
│                                         │
│ riskRating: 'medium'  ◄─ Warning      │
│ credibilityScore: 75  ◄─ Reduced       │
│ riskNotes: "Late return 2x in Q3"      │
└─────────────────────────────────────────┘

AFTER DAMAGE INCIDENT
┌─────────────────────────────────────────┐
│ history: {                              │
│   totalRentals: 5,                      │
│   totalLateCharges: 500,                │
│   totalDamageIncidents: 2,  ◄─ +1      │
│   totalDamageCost: 1100     ◄─ +520    │
│ }                                       │
│                                         │
│ riskRating: 'high'  ◄─ High risk      │
│ credibilityScore: 40  ◄─ Low score    │
│ riskNotes: "2 damage incidents"        │
│ creditLimitForRentals: 2000  ◄─ Reduced│
└─────────────────────────────────────────┘

USE IN RENTAL CREATION:
┌──────────────────────────────────────────────────────────┐
│ POST /api/rentals                                        │
│ VALIDATION:                                              │
│                                                          │
│ if (customer.riskRating === 'high'                      │
│     && rentalAmount > creditLimit) {                    │
│   throw "Customer credit limit exceeded"               │
│ }                                                        │
│                                                          │
│ if (customer.riskRating === 'high') {                  │
│   requireGuarantorInfo = true                          │
│   requireIdVerification = true                         │
│ }                                                        │
└──────────────────────────────────────────────────────────┘
```

---

## Integration Points with Existing ABS

```
┌───────────────────────────────────────────────────────────────┐
│                     ABS RENTAL MODULE                         │
└───────────────────────────────────────────────────────────────┘
         │          │          │          │          │
         │          │          │          │          │
    ┌────▼──┐  ┌───▼──┐  ┌───▼──┐  ┌───▼──┐  ┌────▼──┐
    │Product│  │Invoice│  │Payment│ │Expense│  │Customer
    │       │  │       │  │       │ │       │  │
    │Add:   │  │Link:  │  │Pay:   │ │Damage:│  │Extend:
    │ • iRent  │ • rental  │Rental  │ • Link   │ • metadata
    │ • rateDay│ • metadata│invoice │ damageID │   .rental
    │       │  │       │  │       │ │       │  │
    └───────┘  └───────┘  └───────┘ └───────┘  └────────┘
```

---

## Phase Breakdown (What's Built When)

```
PHASE 1: MVP (2-3 weeks)
├─ Core Rental CRUD
├─ Return & Damage Inspection
├─ Late Charge Auto-Calculation
├─ Basic Availability Check
├─ Dashboard: Active Rentals
└─ Users Can: Issue & return rentals, inspect damage, see what's due

    Tables: Rental, RentalItem, DamageReport
    Models: ~600 lines code
    Services: Availability, Damage → Expense
    Controllers: Rental operations

PHASE 2: Pre-Bookings (1-2 weeks)
├─ Create Pre-Booking (reservation)
├─ Auto-Generate Proforma Invoice
├─ Convert to Rental (when confirmed)
├─ Inventory Hold (pre-bookings count in availability)
└─ Users Can: Reserve future items, track reservations

    Tables: PreBooking, PreBookingItem
    Models: ~300 lines code

PHASE 3: Invoicing (1 week)
├─ Auto-Create Invoice on Rental Return
├─ Line Items: Rental + Late + Damage
├─ Paystack Payment Link
├─ Payment Reconciliation
└─ Users Can: Send invoice, track payment

    Services: Invoice generation, payment tracking
    Controllers: ~200 lines code

PHASE 4: Reporting (1 week)
├─ Rental Revenue Dashboard
├─ Late Returns Report
├─ Damage Trends Report
├─ Customer Rental History
└─ Users Can: Analyze rental business performance

PHASE 5: Notifications (1 week)
├─ Email on New Rental (manager)
├─ Rental Due Back Alert (staff)
├─ Overdue Rental Alert (manager)
├─ Damage Reported Alert (manager)
└─ Users Can: Be notified of important events
```

---

**Summary:** Rental module tightly integrates with existing ABS infrastructure (Customer, Product, Invoice, Expense, Payment, Notification) while adding minimal new models. All multi-tenant and branch-scoped from day one.
