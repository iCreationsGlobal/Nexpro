# Rental Module — Status Update

**Date:** 29 August 2026  
**Status:** ✅ P0–P2 Complete (Pilot-ready)  
**Next Phase:** Production pilot rollout with real tenants

---

## Implementation Complete (P0–P2)

| Phase | Scope | Status |
|-------|-------|--------|
| **P0** | Business type, models, migrations, core APIs, availability | ✅ 12/12 |
| **P1** | Invoicing, deposits, damage/expense, notifications, PDFs, settings | ✅ 16/16 |
| **P2** | Storefront booking, reports, integration tests, plan gating | ✅ 10/10 |

**Test suite:** `npm run test:rental` — 116+ tests passing (unit + integration).

---

## Plan Gating (P2-10)

### Feature registry (`Backend/config/features.js`)

| Plan | `rentals` in base plan |
|------|------------------------|
| trial | ✅ (all features) |
| starter | ❌ |
| professional | ✅ |
| enterprise | ✅ (all features) |

### Business-type override (`Backend/config/businessTypes.js`)

`BUSINESS_TYPE_CORE_FEATURES.rental = ['rentals']` ensures **rental-primary tenants on starter** still get the Rentals module even though starter omits it globally.

Non-rental tenants on professional/enterprise have `rentals` stripped by business-type filtering.

### Storefront booking gate

Public rental availability/booking endpoints require:

1. Online store launched (`online_store_settings.enabled = true`)
2. Tenant effective `rentals` feature (plan + business-type gates)
3. Published listing with rentable product

---

## Pilot Tenant Setup Checklist

See [RENTAL_QUICK_REFERENCE.md#pilot-tenant-setup-checklist](RENTAL_QUICK_REFERENCE.md#pilot-tenant-setup-checklist) for the full admin checklist.

**Quick seed:** `cd Backend && node scripts/seed-rental-pilot-tenant.js owner@example.com`

---

## Architecture Summary (unchanged)

### Tables Created
- `Rental`, `RentalItem`, `PreBooking`, `PreBookingItem`, `DamageReport`, `RentalExtension`, `LateCharge`, `RentalUnit`

### Tables Extended
- `Product` → `isRentable`, `rentalRatePerDay`
- `Expense` → `damageReportId` FK
- `Customer` → `metadata.rental` JSONB

### Reused
- `Invoice`, `Payment`, `Notification`, `Shop`, `OnlineStoreSettings`, `OnlineProductListing`

---

## Rollout Readiness

✅ Architecture finalized  
✅ Full module implemented (P0–P2)  
✅ Plan gating + starter rental override  
✅ Storefront booking with entitlement check  
✅ Integration test harness + `test:rental` script  
✅ Pilot seed script + admin checklist  
✅ Ready for pilot tenants

---

## Links

- [RENTAL_DOCS_INDEX.md](RENTAL_DOCS_INDEX.md) — documentation map
- [RENTAL_QUICK_REFERENCE.md](RENTAL_QUICK_REFERENCE.md) — team reference + pilot checklist
- [RENTAL_MODULE_PLAN.md](RENTAL_MODULE_PLAN.md) — architecture
- [RENTAL_ARCHITECTURE_DECISIONS.md](RENTAL_ARCHITECTURE_DECISIONS.md) — design rationale

**Last Updated:** 29 August 2026
