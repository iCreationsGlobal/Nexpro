# Rental Module — Architecture Decisions Summary

**Date:** 26 August 2026  
**Status:** Finalized  
**Approach:** Native ABS module (not external integration)

---

## Key Architectural Decisions

### 1. Expense Handling: Reuse Existing Model ✅

**Decision:** Use existing `Expense` model for rental damage costs. Create NO new expense table.

**Rationale:**
- ABS already has robust Expense model with approval workflows, categories, payment methods, receipt tracking
- Rental damage is just one expense category (like "Rental Damage" or "Rental Repair")
- Expense already has FK to `shopId` (branch-scoped expenses)
- Approval workflow (`draft` → `pending_approval` → `approved` → `paid`) perfectly fits damage cost workflow

**Implementation:**
- Add optional FK: `Expense.damageReportId` (links expense back to damage record)
- When damage is recorded → auto-create Expense with `damageReportId`
- Manager approves/adjusts cost via existing Expense approval flow
- Damage cost tracked through Expense, not new table

**Benefits:**
- Reuses existing infrastructure
- Reports on rental expenses already work (branches, categories, approval)
- Accounting integrates seamlessly
- Finance team familiar with Expense workflows

---

### 2. Customer Rental Data: JSONB Metadata ✅

**Decision:** Store rental-specific customer info (guarantor, emergency contact, risk profile, ID verification) in `Customer.metadata.rental` JSONB field.

**Rationale:**
- ABS already uses `Customer.metadata` for Sabito integration data
- No new table needed; Customer model stays clean
- Flexible schema: can add new rental fields without migration
- Follows established ABS pattern (non-invasive extension)

**Fields Stored:**
```json
{
  "rental": {
    "guarantor": { name, phone, idType, idNumber, idExpiry },
    "emergencyContact": { name, phone, relationship },
    "riskProfile": { riskRating, creditLimit, credibilityScore },
    "verification": { idVerificationDate, idProofUrl, addressVerified },
    "preferences": { preferredPaymentMethod, autoExtend },
    "history": { totalRentals, totalRevenue, damageIncidents, lastRentalDate }
  }
}
```

**Benefits:**
- Non-invasive: rental data doesn't clutter core Customer model
- Extensible: businesses can add custom rental fields
- Queryable: PostgreSQL JSONB supports indexing and queries
- Reusable pattern: same approach for other future business types

**Related Doc:** [RENTAL_CUSTOMER_METADATA.md](RENTAL_CUSTOMER_METADATA.md)

---

### 3. Damage Tracking: DamageReport + Expense Integration ✅

**Decision:** Create DamageReport table (records damage details, photos, severity) + link to Expense (tracks cost).

**Rationale:**
- **DamageReport** = what happened (condition, damage type, photos, inspection notes)
- **Expense** = financial impact (repair cost, approval, payment)
- Separation of concerns: operational data vs. financial data
- Audit trail: both tables together show full story

**Workflow:**
1. Staff returns rental → records damage (DamageReport created)
2. Estimated repair cost entered (DamageReport.estimatedRepairCost)
3. Auto-create Expense with damageReportId FK
4. Manager approves Expense (cost may be adjusted)
5. Repair completed → Expense marked paid
6. Rental closes with damage liability settled

**Bonus:**
- DamageReport.photos enables visual audit trail
- Damage trends reportable: which products damaged most, cost patterns
- Customer damage history tracked in Customer.metadata.rental.history

**Related Doc:** [RENTAL_DAMAGE_EXPENSE_WORKFLOW.md](RENTAL_DAMAGE_EXPENSE_WORKFLOW.md)

---

### 4. Inventory Management: Reuse Product + ProductShopStock ✅

**Decision:** Extend existing Product model with `isRentable` boolean and `rentalRatePerDay` decimal. Use ProductShopStock for branch-level inventory.

**Benefits:**
- Products already support multi-branch via ProductShopStock
- Availability calculation uses ProductShopStock.quantity directly
- No new inventory tables needed
- Rental rate is just another product attribute (like sale price)

---

### 5. Invoicing: Reuse Invoice Model ✅

**Decision:** Rental transactions auto-generate Invoice records (like Sales do). Link via `metadata.rentalId`.

**Benefits:**
- Invoice model already supports multiple transaction types
- Proforma → final invoice workflow already exists
- Late charges and damage charges become invoice line items
- Payment integration (Paystack) already works for invoices
- Accounting (GL entries, journal entries) already set up

---

### 6. Multi-Tenancy & Branch Isolation: Follow ABS Patterns ✅

**Decision:** All rental records scoped by `tenantId` and `branchId`. Use existing permission/role system.

**Benefits:**
- Matches ABS architecture (Tenant, Shop/Branch, User, Role models)
- Staff see only their branch; managers see cross-branch dashboards
- Queries naturally filtered by tenantId (query-level security)

---

### 7. Availability Calculation: Date-Range Overlap Logic ✅

**Decision:** Core algorithm accounts for active rentals + pre-bookings over date ranges.

**Formula:**
```
availableQty = total stock - active rentals (overlapping dates) - pre-bookings (overlapping dates)

where date overlap: startA <= endB && startB <= endA
```

**Why This Matters:**
- Rentals are time-bound (not instant sales)
- Pre-bookings must hold inventory (prevent double-booking)
- Availability changes as dates approach
- Late returns affect future availability

---

### 8. Pre-Bookings as Reservations ✅

**Decision:** Pre-booking is a confirmed reservation (not auto-converted). Staff must explicitly convert to rental when customer confirms.

**Benefits:**
- Controlled workflow: staff can contact customer for confirmation
- Proforma invoice prepared in advance (customer can pay upfront)
- Inventory held: pre-booking counts in availability checks
- Flexibility: customer can cancel without automatic rental creation

---

## Files Structure

**Core Models:**
- `Backend/models/Rental.js` — rental transactions
- `Backend/models/RentalItem.js` — line items in rental
- `Backend/models/PreBooking.js` — future reservations
- `Backend/models/PreBookingItem.js` — line items in pre-booking
- `Backend/models/DamageReport.js` — damage inspection records

**Controllers:**
- `Backend/controllers/rentalController.js` — rental CRUD + workflows
- `Backend/controllers/damageReportController.js` — damage recording + approval

**Services:**
- `Backend/services/rentalAvailabilityService.js` — date-range overlap, availability calculation
- `Backend/services/rentalInvoiceService.js` — auto-generate invoices, calculate late charges
- `Backend/services/rentalDamageService.js` — damage cost estimation, expense creation

**Routes:**
- `Backend/routes/rentalRoutes.js` — all rental endpoints

**Migrations:**
- `Backend/migrations/create-rentals.js`
- `Backend/migrations/create-rental-items.js`
- `Backend/migrations/create-pre-bookings.js`
- `Backend/migrations/create-pre-booking-items.js`
- `Backend/migrations/create-damage-reports.js`
- `Backend/migrations/modify-products-rental-fields.js` — add isRentable, rentalRatePerDay
- `Backend/migrations/modify-expenses-damage-fk.js` — add damageReportId to Expense
- `Backend/migrations/modify-customers-rental-metadata.js` — ensure metadata field exists

**Documentation:**
- `Backend/RENTAL_MODULE_PLAN.md` — overall architecture
- `Backend/RENTAL_CUSTOMER_METADATA.md` — customer data extension guide
- `Backend/RENTAL_DAMAGE_EXPENSE_WORKFLOW.md` — damage & expense integration guide

---

## Technology Stack

| Component | Tech | Notes |
|-----------|------|-------|
| **ORM** | Sequelize | Existing ABS standard |
| **Database** | PostgreSQL | JSONB support for metadata |
| **Background Jobs** | Node cron | Late charge calculation, pre-booking expiry |
| **Invoicing** | Existing Invoice model | Link via metadata |
| **Payments** | Paystack (via existing Payment model) | Rental invoices use same payment flow |
| **Notifications** | Existing Notification model | Email on rental events |
| **Reporting** | Existing Dashboard + Report models | Rental KPIs added to dashboards |

---

## Rollout Plan

### Phase 1: MVP (2–3 weeks)
- Core rental CRUD (create, list, get, update)
- Return & damage inspection
- Extend rental
- Late charge auto-calculation
- Basic availability check
- Dashboard: active rentals, due back today

### Phase 2: Pre-Bookings (1–2 weeks)
- Pre-booking creation & conversion
- Proforma invoice auto-generation
- Availability includes pre-bookings
- Public storefront (optional)

### Phase 3: Invoicing (1 week)
- Auto-create Invoice from rental
- Late charges on invoice
- Damage charges on invoice
- Payment tracking

### Phase 4: Reporting (1 week)
- Rental revenue dashboard
- Late returns report
- Damage trends report
- Customer rental history

### Phase 5: Notifications & Compliance (1 week)
- Email alerts (new rental, due back, overdue, damage)
- Audit log for damage inspection

---

## Success Criteria

✅ **Functional:**
- Rental workflow: create → return → damage → settle (end-to-end working)
- Availability calculation correct (no double-bookings)
- Late charges auto-calculated
- Damage costs tracked via Expense

✅ **Data Integrity:**
- Multi-tenant isolation enforced
- Branch-scoped inventory correct
- Rental totals (amount + late + damage) calculated correctly
- Audit trail complete (who inspected damage, when, photos)

✅ **Performance:**
- Availability check < 500ms
- Dashboard loads < 2 seconds
- Late charge batch job completes nightly

✅ **UX:**
- Staff can issue rental in < 2 minutes (vs RentDesk requirement)
- Damage inspection captures photos easily
- Dashboard shows due-back rentals clearly

---

## Open Questions / Future Enhancements

1. **Pre-booking expiry:** How long before expired pre-booking is cancelled? (default: 30 days)
2. **Late charge grace period:** Should there be a grace period before late charge applies? (e.g., 1 hour)
3. **Damage waiver:** Can customers waive damage liability for high-value rentals?
4. **Insurance integration:** Track rental insurance purchased?
5. **Automated damage photo analysis:** Use AI to estimate damage severity from photos?
6. **Delivery/Logistics:** Track rental delivery & pickup (additional feature)?

---

## Conclusion

The rental module leverages **existing ABS infrastructure** (Expense, Invoice, Customer, Product, Shop, User, Role, Notification) while adding **minimal new tables** (Rental, RentalItem, PreBooking, PreBookingItem, DamageReport).

**Key Pattern:**
- New operational data (Rental, DamageReport) lives in new tables
- Financial data (cost, expense) reuses existing models (Expense, Invoice)
- Customer extensions (guarantor, risk) stored in metadata (no new table)
- Multi-branch & multi-tenant follows ABS patterns throughout

This approach ensures the rental module feels native to ABS, integrates seamlessly with existing workflows, and doesn't introduce debt through new tables/systems.
