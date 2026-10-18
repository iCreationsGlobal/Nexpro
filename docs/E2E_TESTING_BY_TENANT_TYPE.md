# End-to-end testing guide by tenant type (ABS)

Use this document to **smoke-test and regression-test** African Business Suite across workspace types. It complements [`UAT_CHECKLIST.md`](./UAT_CHECKLIST.md) with **tenant-specific paths** and **newer modules** (deliveries, public tracking, feature flags).

---

## 1. Before you start

### Environment

| Item | Notes |
|------|--------|
| **Web app URL** | Production URL, staging, or `http://localhost:5173` |
| **API** | `VITE_API_URL` must point at the matching backend; CORS configured |
| **Browser** | Chrome, Firefox, Safari, or Edge (latest) |
| **Plans** | Use a plan that includes the modules you need (e.g. **Starter+** for orders, **Professional** for shops where enabled). Trial may omit some features. |

### Accounts to prepare

| Role | Purpose |
|------|---------|
| **Owner / Admin** | Full workspace: Users, invites, expense approval, deletes, Settings |
| **Manager** | Reports, Export data, Settings, Payroll/Accounting nav (see [`TENANT_ROLE_ACCESS_MATRIX.md`](./TENANT_ROLE_ACCESS_MATRIX.md)) |
| **Staff** | Operational pages only; confirm restricted routes redirect or 403 |

### Internal model (how “tenant type” works)

- **Resolved type** drives features: **`shop`**, **`studio`**, **`pharmacy`**.
- **Legacy studio labels** on a tenant (`printing_press`, `mechanic`, `barber`, `salon`) behave as **studio** for features.
- **Shop subtype** is `metadata.shopType` (e.g. `restaurant` → **Orders**; quotes hidden for restaurant).

---

## 2. Baseline — every workspace

Run these once per test tenant (any type).

### Authentication

- [ ] **Login** (`/login`) → lands on `/dashboard`.
- [ ] **Bad password** → error, stay on login.
- [ ] **Logout** (header menu) → `/login`.
- [ ] **Session** → refresh dashboard; still logged in.

### Onboarding (new signup)

- [ ] **Signup** → email verification if required by env.
- [ ] **Business type** matches test case (Shop / Studio / Pharmacy).
- [ ] **Shop only:** shop type (e.g. supermarket vs restaurant) saved; sidebar matches expectations.
- [ ] **Onboarding completes** → dashboard; no stuck spinner.

### Dashboard & shell

- [ ] **Dashboard** loads without blank critical widgets.
- [ ] **Sidebar** items match **business type + plan** (no broken links).
- [ ] **Header:** notifications bell, user menu, **global search** (placeholder changes on some pages, e.g. Jobs, Deliveries).
- [ ] **Mobile width:** menu/sheet opens; main flows still usable.

### Customers (if CRM on plan)

- [ ] **Customers** list loads.
- [ ] **Create customer** → appears in list.
- [ ] **Search / open detail** (header search on Customers page if registered).

### Financial (when on plan)

- [ ] **Invoices** — list loads; create or open one; print/PDF if used.
- [ ] **Expenses** — list loads; create expense; **approve/reject** as **admin** if workflow exists.

### Data & Reports (manager+)

- [ ] **Reports → Overview** loads; date filters work.
- [ ] **Smart report / Compliance** (as applicable) load; Smart report shows the selected period's figures.
- [ ] **Export data** — manager+ only; staff blocked.

### Settings (manager+)

- [ ] **Settings** opens; **Organization**, **notifications**, payment collection (if shown) save without error.
- [ ] **Customer job/order tracking** — if enabled, **shareable tracking URL** visible where documented.

### Users (admin)

- [ ] **Users** — list; **invite** or create user; manager sees list but not destructive actions per matrix.

### Deliveries feature (if `deliveries` on plan)

- [ ] **Advanced → Deliveries** visible.
- [ ] **To deliver** tab lists completed jobs (studio) or sales/orders (shop/pharmacy) when data exists; delivery status filters work.
- [ ] **Header search** filters the list on Deliveries page.
- [ ] Change **delivery status** on a row; refresh; persists.
- [ ] **Mark ready for delivery** (multi-select) works.

---

## 3. Shop — retail (not restaurant)

**Expect:** Dashboard, **Sales**, **Products** (if on plan), **Customers**, **Invoices** / **Expenses**, **Company assets** (materials/equipment if on plan), **Advanced** (e.g. Deliveries, Tasks, Marketing, Vendors, Quotes if not hidden), **Data & Reports**.

**Do not expect:** **Jobs**, **Orders** (unless you use a non-restaurant shop type—Orders are for **restaurant** shop type).

### Products & inventory

- [ ] **Products** — list, create product, optional image/SKU.
- [ ] **POS** (from dashboard or Sales) — add line items, complete sale; sale appears under **Sales**.
- [ ] **Sales** — list, filters, open sale detail; **delivery status** on sale if you use deliveries.

### Quotes (non-restaurant shops)

- [ ] If **Quotes** appear under Advanced: create quote; status transitions sane.

### Optional modules

- [ ] **Shops** — only if multi-shop feature and UI flag allow; list/load.
- [ ] **Marketing** — manager+; draft or send test campaign per your policy.
- [ ] **Built-in messages** (Settings → Delivery rules) — manager+; turn a message (e.g. sale receipt) on/off and change its SMS / WhatsApp / email switches; saves and persists after refresh.

### Public / customer (optional)

- [ ] **Pay invoice** link (if used) opens `/pay-invoice/:token`.
- [ ] **Tenant tracking** `/track/:tenantSlug` — lookup by ID + phone when tracking enabled in settings.

---

## 4. Shop — restaurant (`shopType: restaurant`)

**Expect:** **Sales**, **Orders**, **Products** (typical), **Customers**, financials as on plan. **Quotes** are **hidden** for restaurant in the app.

### Orders & kitchen

- [ ] **Orders** — board/list loads; create or receive order (POS or flow you use).
- [ ] **Order status** transitions (e.g. received → preparing → ready → completed) as designed.
- [ ] **Delivery status** on orders/sales if you use dispatch.

### Sales

- [ ] **Sales** list includes restaurant orders linked correctly.

### No quotes

- [ ] **Quotes** not in sidebar (restaurant).

---

## 5. Studio (`printing_press`, `mechanic`, `barber`, `salon`, or `studio`)

**Expect:** **Jobs** (not Orders), **Customers**, **Invoices** / **Expenses**, **Company assets**, **Advanced** (Deliveries, Tasks, **Quotes**, **Pricing**, Vendors, Leads, etc. per plan), **Data & Reports**.

### Jobs lifecycle

- [ ] **Jobs** — list loads; **create job** (customer, items, dates as required).
- [ ] **Status:** new → in_progress → completed (or your standard path).
- [ ] **Job detail / drawer** — edit, attachments if used.
- [ ] **Invoice** auto or manual from job (per your configuration).

### Quotes & pricing

- [ ] **Quotes** — create, send or convert if applicable.
- [ ] **Pricing** (Advanced) — templates load.

### Vendors & leads (plan)

- [ ] **Vendors** — list CRUD smoke.
- [ ] **Leads** — list; new lead.

### Tasks

- [ ] **Tasks** — create task linked to workflow if applicable.

### Public tracking

- [ ] **Track job** link with token (`/track-job/:token`) shows timeline.
- [ ] **Tenant slug lookup** `/track/:tenantSlug` — job/sale ID + phone when enabled.

### Deliveries

- [ ] Completed **jobs** appear on **Deliveries**; status updates sync with public **delivery** timeline when `deliveryStatus` is set.

---

## 6. Pharmacy

**Expect:** **Sales**, **Customers**, **Invoices** / **Expenses**, **Company assets**, **Advanced** (Deliveries, Tasks, **Pharmacies**, **Prescriptions**, **Drugs**, Vendors, etc. per plan). **No Jobs**.

### Pharmacy entities

- [ ] **Pharmacies** — list; create/open location.
- [ ] **Drugs** — catalog list; add drug.
- [ ] **Prescriptions** — list/detail; create or dispense flow per your SOP.

### Sales & compliance

- [ ] **POS / Sales** with drug-linked lines if applicable.
- [ ] **Reports** — manager+; no staff access to restricted exports.

### Deliveries

- [ ] Completed **sales** on Deliveries page; delivery status + customer tracking.

---

## 7. Cross-tenant deep checks

### Roles (repeat critical paths as **staff**)

- [ ] Staff: **Sales** or **Jobs** OK; **Settings** / **Reports** / **Export** blocked.
- [ ] Manager: **Settings**, **Reports**, **Export** OK.
- [ ] Admin: **Users** invites, **expense approval**, **delete sale** (if applicable).

### Payments & billing

- [ ] **Checkout / subscription** (manager+) if workspace on trial or upgrade path.
- [ ] **Mobile money / Paystack** flows per env (sandbox keys): invoice payment, POS payment if configured.

### Notifications

- [ ] In-app **notification** bell; mark read.

### Error handling

- [ ] **Offline / API down** — user sees toast or message, not white screen.
- [ ] **403** on direct URL to forbidden route for staff.

---

## 8. Platform admin (separate login)

Use a **platform admin** account (lands on `/admin`).

- [ ] **Tenants** — search, open tenant, feature/plan fields if used.
- [ ] **Billing / Health / Reports** — pages load.
- [ ] **Settings** — plan catalog includes features (e.g. **deliveries** toggle for plans).
- [ ] Impersonation or support tools — only if your deployment uses them.

---

## 9. Mobile app (Expo)

Web E2E above does **not** replace mobile. Follow [`MOBILE_APP_BUILD_GUIDE.md`](./MOBILE_APP_BUILD_GUIDE.md) and `.cursor/plans/mobile_app_implementation_strategy.plan.md` for **scoped** mobile tests; several web-only modules are intentionally absent on mobile.

---

## 10. Bug report template

```
Title: [Studio/Shop/Pharmacy] Short description
Tenant: businessType + shopType if shop
Role: admin / manager / staff
URL:
Steps:
1.
2.
Expected:
Actual:
Screenshot / requestId (if API error):
```

---

## 11. Maintenance

When you add a **new feature** or **nav item**:

1. Register it in `Backend/config/features.js` if plan-gated.
2. Add a row under the right **tenant section** in this guide.
3. Update [`TENANT_ROLE_ACCESS_MATRIX.md`](./TENANT_ROLE_ACCESS_MATRIX.md) if RBAC changes.

---

*Last aligned with app structure: studio / shop / pharmacy resolution, Deliveries under Advanced, restaurant vs retail shop, and public tracking routes.*
