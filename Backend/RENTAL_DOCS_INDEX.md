# Rental Module Documentation Index

**Project:** ABS Rental Module  
**Status:** ✅ P0–P2 Complete — Pilot-ready  
**Date:** 29 August 2026  
**Approach:** Native ABS module (not external integration)

---

## 📋 Documentation Map

### 🎯 Start Here

**For a 5-minute overview:**
→ [RENTAL_QUICK_REFERENCE.md](RENTAL_QUICK_REFERENCE.md)

**For project status:**
→ [RENTAL_STATUS_UPDATE.md](RENTAL_STATUS_UPDATE.md)

---

### 📐 Architecture & Planning

**1. [RENTAL_MODULE_PLAN.md](RENTAL_MODULE_PLAN.md)** — Main architecture document
   - Module overview (rental lifecycle)
   - Complete data model (7 tables: Rental, RentalItem, PreBooking, PreBookingItem, DamageReport, RentalExtension, LateCharge)
   - API endpoints (14+ operations)
   - Business workflows (3 main workflows with step-by-step)
   - Availability calculation algorithm (date-range overlap logic)
   - Integration with existing ABS modules (Product, Customer, Invoice, Expense, Dashboard, Notifications)
   - Phased implementation roadmap (Phase 1-5 with timeline)
   - File structure for implementation
   - Key design decisions
   - Success metrics
   - **Read this to:** Understand overall architecture

**2. [RENTAL_ARCHITECTURE_DECISIONS.md](RENTAL_ARCHITECTURE_DECISIONS.md)** — Rationale for key decisions
   - ✅ Why reuse Expense model (not create new one)
   - ✅ Why use Customer.metadata for rental data (not new table)
   - ✅ Why DamageReport + Expense integration
   - ✅ Why reuse Product, Invoice, Shop models
   - ✅ Why availability is date-range aware
   - ✅ Why pre-bookings are reservations
   - Technology stack
   - Rollout plan
   - Success criteria
   - Future enhancements
   - **Read this to:** Understand the "why" behind decisions

**3. [RENTAL_ARCHITECTURE_DIAGRAMS.md](RENTAL_ARCHITECTURE_DIAGRAMS.md)** — Visual diagrams
   - Data model (tables & relationships)
   - Workflow: rental start to finish
   - Availability calculation algorithm (step-by-step)
   - Customer risk profile (auto-updated)
   - Integration points with ABS
   - Phase breakdown (what's built when)
   - **Read this to:** See the bigger picture visually

---

### 🔧 Implementation Guides

**4. [RENTAL_CUSTOMER_METADATA.md](RENTAL_CUSTOMER_METADATA.md)** — How to store rental-specific customer data
   - Full metadata schema (guarantor, emergency contact, risk profile, verification, preferences, history)
   - Field definitions (when to use each field)
   - Code examples (reading, writing, querying metadata)
   - API endpoints (PATCH customer with metadata)
   - Validation rules
   - PostgreSQL JSONB queries
   - Migration script (if moving from old model)
   - Best practices
   - **Read this to:** Implement customer rental data (guarantor, risk profile, etc.)
   - **Length:** 5000+ words with code examples

**5. [RENTAL_DAMAGE_EXPENSE_WORKFLOW.md](RENTAL_DAMAGE_EXPENSE_WORKFLOW.md)** — How damage integrates with Expense model
   - Data flow (damage → expense workflow)
   - Table schema (DamageReport model, Expense enhancements)
   - Workflow steps (6 steps from inspection to closed)
   - API endpoints (damage recording, approval, completion)
   - Reporting queries (damage by product, trends, cost reconciliation)
   - Error handling (validation rules & error responses)
   - Notification triggers
   - **Read this to:** Implement damage tracking & expense integration
   - **Length:** 4000+ words with SQL examples

---

### 📍 Quick Reference

**6. [RENTAL_QUICK_REFERENCE.md](RENTAL_QUICK_REFERENCE.md)** — 2-minute team reference + **pilot tenant setup checklist**
   - What we're building (1 sentence)
   - Key design principles
   - Core tables (NEW vs EXTENDED vs REUSED)
   - Customer rental data structure (JSONB)
   - Damage → Expense workflow
   - Availability calculation (formula)
   - Rental status flow (diagram)
   - Late charge calculation
   - Pre-booking workflow
   - Phase 1 API endpoints (quick list)
   - Development checklist
   - Team questions to discuss
   - Next steps
   - **Read this to:** Get oriented before development

---

### 📊 Status & Planning

**7. [RENTAL_STATUS_UPDATE.md](RENTAL_STATUS_UPDATE.md)** — Current project status (P0–P2 complete)
   - What we decided today (3 major decisions)
   - Documentation created
   - Architecture summary
   - Core concepts
   - Phase 1 scope
   - Implementation files (to be created)
   - Tech stack confirmed
   - Rollout readiness checklist
   - Next: Development phase questions
   - **Read this to:** Understand current progress

---

## 🎓 How to Use This Documentation

### For Different Roles

**Project Manager / Product Owner:**
1. Start: [RENTAL_STATUS_UPDATE.md](RENTAL_STATUS_UPDATE.md) (current status)
2. Then: [RENTAL_QUICK_REFERENCE.md](RENTAL_QUICK_REFERENCE.md) (team overview)
3. For decisions: [RENTAL_ARCHITECTURE_DECISIONS.md](RENTAL_ARCHITECTURE_DECISIONS.md)

**Backend Developer (Building Phase 1):**
1. Start: [RENTAL_ARCHITECTURE_DIAGRAMS.md](RENTAL_ARCHITECTURE_DIAGRAMS.md) (visual overview)
2. Then: [RENTAL_MODULE_PLAN.md](RENTAL_MODULE_PLAN.md) (data model & APIs)
3. For implementation: [RENTAL_CUSTOMER_METADATA.md](RENTAL_CUSTOMER_METADATA.md) & [RENTAL_DAMAGE_EXPENSE_WORKFLOW.md](RENTAL_DAMAGE_EXPENSE_WORKFLOW.md)

**QA / Tester:**
1. Start: [RENTAL_QUICK_REFERENCE.md](RENTAL_QUICK_REFERENCE.md) (understand features)
2. Then: [RENTAL_MODULE_PLAN.md](RENTAL_MODULE_PLAN.md) (workflows & edge cases)
3. For test cases: [RENTAL_ARCHITECTURE_DIAGRAMS.md](RENTAL_ARCHITECTURE_DIAGRAMS.md) (workflow diagrams)

**Tech Lead / Architect:**
1. Start: [RENTAL_ARCHITECTURE_DECISIONS.md](RENTAL_ARCHITECTURE_DECISIONS.md) (design rationale)
2. Then: [RENTAL_MODULE_PLAN.md](RENTAL_MODULE_PLAN.md) (complete design)
3. For implementation: [RENTAL_CUSTOMER_METADATA.md](RENTAL_CUSTOMER_METADATA.md) & [RENTAL_DAMAGE_EXPENSE_WORKFLOW.md](RENTAL_DAMAGE_EXPENSE_WORKFLOW.md)

**New Team Member:**
1. Start: [RENTAL_QUICK_REFERENCE.md](RENTAL_QUICK_REFERENCE.md) (2-minute intro)
2. Then: [RENTAL_ARCHITECTURE_DIAGRAMS.md](RENTAL_ARCHITECTURE_DIAGRAMS.md) (see the big picture)
3. Then: [RENTAL_MODULE_PLAN.md](RENTAL_MODULE_PLAN.md) (full details)

---

## 📚 Key Concepts Summary

### Decision 1: Expense Reuse ✅
**What:** Use existing `Expense` model for rental damage costs  
**Why:** Expense already has approval workflows, payment methods, reconciliation  
**Implementation:** Add `damageReportId` FK to Expense  
**Docs:** [RENTAL_DAMAGE_EXPENSE_WORKFLOW.md](RENTAL_DAMAGE_EXPENSE_WORKFLOW.md)

### Decision 2: Customer Metadata ✅
**What:** Store rental data in `Customer.metadata.rental` JSONB  
**Why:** Flexible, non-invasive, follows ABS pattern  
**Stores:** Guarantor, emergency contact, risk profile, ID verification, preferences, history  
**Docs:** [RENTAL_CUSTOMER_METADATA.md](RENTAL_CUSTOMER_METADATA.md)

### Decision 3: Damage + Expense Integration ✅
**What:** DamageReport records damage; Expense records cost  
**Why:** Separation of concerns (operational vs financial)  
**Workflow:** Damage → Expense auto-created → Manager approves → Repair paid  
**Docs:** [RENTAL_DAMAGE_EXPENSE_WORKFLOW.md](RENTAL_DAMAGE_EXPENSE_WORKFLOW.md)

### Core Algorithm: Availability Calculation
**Formula:** `available = totalStock - activeRentals - preBookings` (date-range aware)  
**Why:** Rentals are time-bound; pre-bookings hold inventory  
**Location:** [RENTAL_ARCHITECTURE_DIAGRAMS.md](RENTAL_ARCHITECTURE_DIAGRAMS.md#availability-calculation-algorithm)

---

## 📂 Files to Create (Phase 1 & 2)

**Models (Backend/models/):**
- `Rental.js` — rental transactions
- `RentalItem.js` — line items
- `PreBooking.js` — future reservations
- `PreBookingItem.js` — reservation line items
- `DamageReport.js` — damage inspection records

**Migrations (Backend/migrations/):**
- `create-rentals.js`
- `create-rental-items.js`
- `create-damage-reports.js`
- `modify-products-rental-fields.js` (add isRentable, rentalRatePerDay)
- `modify-expenses-damage-fk.js` (add damageReportId)

**Services (Backend/services/):**
- `rentalAvailabilityService.js` (core: date-range overlap)
- `rentalInvoiceService.js` (auto-generate invoices)
- `rentalDamageService.js` (damage cost + Expense creation)

**Controllers (Backend/controllers/):**
- `rentalController.js` (CRUD + workflows)
- `damageReportController.js` (damage inspection)

**Routes (Backend/routes/):**
- `rentalRoutes.js` (all rental endpoints)

---

## 🚀 Phase Breakdown

### Phase 1: MVP (2–3 weeks)
**What Staff Can Do:**
- Create rental
- Check availability
- Record return
- Inspect damage
- Extend rental
- See dashboard (active rentals, due back)

**What Happens Auto:**
- Late charges calculated
- Expense created for damage
- Invoice generated

**Tables:** Rental, RentalItem, DamageReport  
**Models:** ~600 lines  
**Services:** Availability, Damage→Expense  

### Phase 2: Pre-Bookings (1–2 weeks)
**What Staff Can Do:**
- Create pre-booking (reservation)
- Convert to rental

**What Happens Auto:**
- Proforma invoice generated
- Inventory held

**Tables:** PreBooking, PreBookingItem  
**Models:** ~300 lines  

### Phase 3: Invoicing (1 week)
**What Happens Auto:**
- Invoice created on return
- Late charges on invoice
- Damage charges on invoice

### Phase 4: Reporting (1 week)
**Dashboards:**
- Rental revenue
- Late returns
- Damage trends
- Customer history

### Phase 5: Notifications (1 week)
**Email Alerts:**
- New rental (manager)
- Due back (staff)
- Overdue (manager)
- Damage (manager)

---

## ✅ Checklist: Pilot Tenant Setup (Admin)

Platform admins provisioning the first rental businesses:

1. **Create or select tenant** with `businessType = rental` and sub-type (e.g. `equipment_rental`)
2. **Assign plan:** starter or professional (starter auto-grants `rentals` via business-type core feature)
3. **Verify access tab:** Rentals feature should show as effective (Inherited or Allowed) — see Admin → Tenants → Access
4. **Open workspace:** add rentable products (`isRentable`, daily rate, stock qty)
5. **Optional seed:** `cd Backend && node scripts/seed-rental-pilot-tenant.js owner@email.com`
6. **Online Store:** Admin → Online Store setup → enable store, publish rentable listings (`commerceMode: rent`)
7. **Storefront test:** `GET /api/public/store/:slug/rental-availability` and submit booking request
8. **Staff flow:** confirm pre-booking in Rentals → checkout → return

**Plan gating reference:**

| Plan | Base `rentals` | Rental business type |
|------|----------------|----------------------|
| starter | ❌ | ✅ (core override) |
| professional | ✅ | ✅ |
| trial / enterprise | ✅ | ✅ |

**Storefront requires:** online store enabled **and** effective `rentals` feature **and** published rentable listing.

---

## ✅ Checklist: Before You Start Coding (historical)

- [x] Read [RENTAL_MODULE_PLAN.md](RENTAL_MODULE_PLAN.md) (data model section)
- [x] Read [RENTAL_QUICK_REFERENCE.md](RENTAL_QUICK_REFERENCE.md) (2 min overview)
- [x] Review [RENTAL_ARCHITECTURE_DIAGRAMS.md](RENTAL_ARCHITECTURE_DIAGRAMS.md) (visuals)
- [x] Implement P0–P2 (complete)
- [x] Add integration tests (`npm run test:rental`)
- [x] Plan gating + pilot checklist (P2-10)

---

**Status:** ✅ Pilot-ready  
**Last Updated:** 29 August 2026  
**Next Step:** Onboard pilot rental tenants
