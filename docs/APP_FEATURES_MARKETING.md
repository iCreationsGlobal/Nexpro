# African Business Suite App Features – Marketing Reference

This document lists **every feature** in the African Business Suite web app (frontend and backend), what each does, how it works, and which business types it applies to. Use it to keep marketing copy, sales materials, and help docs accurate and complete.

**Related docs:**
- [POS_FEATURES.md](./POS_FEATURES.md) – Detailed POS flow, payments, receipts, offline, scan mode.
- [Backend/API_ENDPOINTS_SUMMARY.md](../Backend/API_ENDPOINTS_SUMMARY.md) – Technical API endpoint list.

---

## Business types

African Business Suite supports multiple business types. Some features are available to **all** tenants; others only to specific types:

- **Shop** – Retail (e.g. supermarket, kiosk). Sub-types include restaurant (kitchen orders).
- **Pharmacy** – Drug dispensing, prescriptions, drug catalog.
- **Studio-like** – Printing press, mechanic, barber, salon, studio. Use jobs, quotes, and pricing templates.

The app shows or hides menu items and pages based on the tenant’s `businessType` (and for shops, `shopType`). The sections below state **Who it’s for** for each feature.

---

## 1. Introduction

This doc is the single source of truth for “what’s in the app” from a user and marketing perspective. Each section describes a feature area, who it’s for, how it works in plain language, and a short **marketing one-liner** you can use in campaigns, website copy, or sales conversations.

---

## 2. Account and onboarding

**Signup / Login** – Users sign up with email and password. Google sign-in is available where configured. Session is maintained with a JWT; the app sends the token on API requests. Login and signup pages support redirects (e.g. after payment or to a specific plan).

**Onboarding** – After first signup, users go through a one-time onboarding wizard. They choose a business group and sub-type (e.g. Retail > Shop, Professional services > Printing press, Health > Pharmacy) from a predefined list, then enter company name, logo (optional), address, email, **phone (required)**, and website. Data is saved via `POST /tenants/onboarding`, which sets the tenant’s `businessType` and for shops optionally `shopType` (e.g. restaurant). Once completed, the user is redirected to the dashboard and onboarding is not shown again.

**Forgot password / Reset password / Verify email** – Standard flows: request reset link, set new password, verify email when required.

**Pay invoice (public)** – A public page (`/pay-invoice/:token`) lets anyone with the link view an invoice and pay online (e.g. via Paystack) without logging in. Used when sending invoice payment links to customers.

**Marketing one-liner:** “Sign up, set your business type and details once, and start; customers can pay invoices with a link—no login required.”

---

## 3. Dashboard

**What it is** – A single dashboard for all business types. It shows a date range (e.g. this month), overview stats (revenue, expenses, profit, etc.), and charts. Content adapts to business type: e.g. product sales for shop/pharmacy, job or service performance for studio-like. A setup checklist can appear when the business is not fully configured. Recent jobs (for studios) or other widgets may be shown. On mobile, pull-to-refresh reloads the data.

**Who it’s for** – All tenants.

**How it works** – The frontend calls the dashboard API with the selected date range and filter type. The backend aggregates sales, expenses, jobs, and other metrics for the tenant and returns totals and breakdowns. The UI renders cards and charts (e.g. line chart for revenue over time).

**Marketing one-liner:** “See your sales, revenue, and key numbers in one place.”

---

## 4. Sales and POS (shop only)

**What it is** – A digital point-of-sale that runs in the browser on **phone, tablet, or laptop**. Users search or browse products, add items to a cart, optionally attach a customer, then choose a payment method and complete the sale. Barcode and QR scanning (camera or external scanner) add products to the cart. Receipts can be sent via SMS, WhatsApp, email, or print. Sales can be queued when offline and synced when back online. A dedicated “Scan Mode” provides a full-screen, mobile-first flow: scan multiple items, review cart, add customer, pay, and optionally auto-send receipt by SMS.

**Who it’s for** – Shop business type only. Payment collection (e.g. Paystack) must be configured in Settings before the POS is usable; otherwise a setup prompt is shown.

**How it works** – See **[POS_FEATURES.md](./POS_FEATURES.md)** for full detail: product search and cache, cart, payment methods (cash, card, mobile money, credit), receipt channels, offline queue, and scan mode flow.

**Marketing one-liner:** “Sell from your phone or laptop; accept cash, card, and mobile money; send receipts by SMS or WhatsApp.”

---

## 5. Sales list and Orders (shop only)

**Sales** – A list of all sales (POS transactions) for the tenant. Users can filter and open a sale to see details and linked invoice. Shop-only.

**Orders** – For tenants with `shopType === 'restaurant'`, an Orders page shows kitchen/order view. Each order (sale) has an order status (e.g. received, preparing, ready, completed). Staff can update status; this supports kitchen workflow and customer communication (e.g. WhatsApp order confirmation when status changes).

**Who it’s for** – Shop only; Orders only when the shop is a restaurant.

**Marketing one-liner:** “See all sales and, for restaurants, manage kitchen orders.”

---

## 6. Products and inventory (shop only)

**What it is** – Product catalog management: create, edit, and delete products. Each product can have a name, SKU, barcode(s), image, selling price, cost, and stock settings (quantity on hand, reorder level, track stock on/off). Products can have **variants** (e.g. size, color) and multiple barcodes. Categories organize the catalog. When “track stock” is on, sales and adjustments update quantity; low-stock alerts can be sent (e.g. via WhatsApp when configured). For items without a barcode, the app can generate a **product QR code** so they can still be scanned at POS.

**Who it’s for** – Shop only. Products are the catalog used by the POS.

**How it works** – Full CRUD via products API. Barcode lookup is used at POS to add items. Stock is decremented on sale (and optionally on job/purchase flows where applicable). Low-stock logic uses reorder level; alerts are sent via configured channels.

**Marketing one-liner:** “Manage your product catalog, stock levels, and barcodes.”

---

## 7. Shops (locations) (shop only)

**What it is** – Multi-location management for retail. Tenants can create and edit multiple **shops** (e.g. branch A, branch B). Shops can be linked to sales and POS context so the business knows which location a sale came from.

**Who it’s for** – Shop only. The Shops menu and page are shown when the feature flag `SHOW_SHOPS` is enabled.

**Marketing one-liner:** “Manage multiple shop locations.”

---

## 8. Jobs and project management (studio-like only)

**What it is** – Job (order/project) management for service businesses. Each job has a status workflow: e.g. New → In progress → Ready → Delivered. Jobs can be created from a quote (convert quote to job) and linked to a customer. When a job is completed, an invoice can be generated from it. A timeline view shows updates and history. Updating job status can trigger notifications (e.g. WhatsApp order confirmation to the customer).

**Who it’s for** – Studio-like types only: printing press, mechanic, barber, salon, studio.

**How it works** – Jobs CRUD via jobs API. Quote conversion copies line items and customer to the job. Status updates and invoice generation are explicit actions. Backend can trigger WhatsApp when status changes, if configured.

**Marketing one-liner:** “Track jobs from quote to delivery with status updates and invoices.”

---

## 9. Quotes (studio-like, pharmacy; shop when enabled)

**What it is** – Create and send **quotes** to customers. A quote lists items (services or products), quantities, and prices. It can be sent (e.g. via WhatsApp) and generated as PDF. For studio-like tenants, a quote can be **converted to a job** so the same items and customer move into job tracking. For shop (when quotes are enabled in config) or pharmacy, quote can convert to a sale. Visibility and “convert to job/sale” depend on business type and tenant config (`isQuotesEnabledForTenant`: studio and pharmacy always; shop when enabled).

**Who it’s for** – Studio-like and pharmacy by default; shop when the tenant has quotes enabled.

**Marketing one-liner:** “Send professional quotes and turn them into jobs or sales.”

---

## 10. Pricing (studio-like only)

**What it is** – **Pricing templates** for services and packages. Users define reusable prices (e.g. “Passport photo – GH₵20”, “A3 print – GH₵5 per sheet”). These are used when creating quotes and jobs so pricing is consistent and quick to apply. Update once, use everywhere.

**Who it’s for** – Studio-like only (printing press, mechanic, barber, salon, studio).

**Marketing one-liner:** “Set reusable prices for services and packages.”

---

## 11. Invoices

**What it is** – Invoices can be created from **jobs**, **sales** (POS), or **prescriptions**. The invoice list can be filtered by source and status. Users can **send** an invoice (generates a payment link and can send via WhatsApp or other channels), **mark paid**, or record **partial payments**. For completed POS sales, the backend can **auto-create** an invoice. Invoices can be exported as PDF. Customers can pay via the **public pay link** (PayInvoice page) without logging in.

**Who it’s for** – All tenants; the sources (job vs sale vs prescription) depend on business type.

**Marketing one-liner:** “Create and send invoices; get paid via link or record payments.”

---

## 12. Customers

**What it is** – Customer (CRM) list: name, phone, email, address, credit limit, notes. The app tracks **balance** and outstanding amounts per customer. Customers can be selected or created from POS and scan mode (find-or-create by phone/name). Customers are linked to sales, jobs, quotes, and invoices.

**Who it’s for** – All tenants.

**Marketing one-liner:** “Keep customer details, credit limits, and payment history in one place.”

---

## 13. Vendors

**What it is** – Supplier/vendor list: contact and basic info. Used when recording expenses or materials (e.g. “purchased from Vendor X”). List and CRUD only; no full procurement module.

**Who it’s for** – All tenants (menu: Advanced → Vendors).

**Marketing one-liner:** “Manage your suppliers and vendors.”

---

## 14. Expenses

**What it is** – Record **expenses** with amount, category, date, optional vendor, and notes. List and filter by date range and category. Expense data feeds into reports and profit & loss.

**Who it’s for** – All tenants.

**Marketing one-liner:** “Track business expenses by category and time.”

---

## 15. Pharmacies (locations) (pharmacy only)

**What it is** – Multi-pharmacy management. Tenants can create and edit multiple **pharmacies** (branches). Used for context on prescriptions and dispensing.

**Who it’s for** – Pharmacy business type only.

**Marketing one-liner:** “Manage multiple pharmacy branches.”

---

## 16. Drugs (pharmacy only)

**What it is** – **Drug catalog**: add, edit, delete drugs with name, quantity in stock, reorder level, and **expiry**. The app supports an “expiring drugs” query (e.g. within 30, 60, or 90 days) so staff can see what’s about to expire. Drugs are used when creating and filling prescriptions.

**Who it’s for** – Pharmacy only.

**Marketing one-liner:** “Drug catalog with stock and expiry tracking.”

---

## 17. Prescriptions (pharmacy only)

**What it is** – **Prescription** management: create a prescription, add drugs (with quantity), optionally **check interactions**, then **fill** (dispense) which deducts stock. From a prescription, an **invoice** can be generated for the patient. **Label** data can be used for printing (e.g. dispensing label).

**Who it’s for** – Pharmacy only.

**Marketing one-liner:** “Manage prescriptions from receipt to dispensing and invoicing.”

---

## 18. Materials and equipment (company assets)

**What it is** – Two menu items under **Company assets**: **Materials** and **Equipment**. These are inventory-style records for things the business *uses* (e.g. ink, paper, tools, vehicles), not products for sale. Track quantity, reorder, and where relevant link to vendors.

**Who it’s for** – All tenants.

**Marketing one-liner:** “Track materials and equipment your business uses.”

---

## 19. Leads

**What it is** – **Lead** pipeline: add leads with status such as New, Contacted, Qualified, Lost, Converted. List and filter. Lead counts feed into **Reports** pipeline summary (e.g. open leads, converted).

**Who it’s for** – All tenants (menu: Advanced → Leads).

**Marketing one-liner:** “Track potential customers from first contact to conversion.”

---

## 20. Employees

**What it is** – **Employee** list: staff names and basic info. Used as the basis for **Payroll** (salary runs, pay records). No full HR module—focused on “who works here” and link to pay.

**Who it’s for** – All tenants (Advanced → Employees).

**Marketing one-liner:** “Manage staff and link to payroll.”

---

## 21. Payroll

**What it is** – **Payroll** runs and employee pay records. Depends on employees and tenant payroll settings. Used to record salaries and payments to staff.

**Who it’s for** – All tenants (Advanced → Payroll).

**Marketing one-liner:** “Process staff salaries and payroll.”

---

## 22. Accounting

**What it is** – **Chart of accounts**, **journal entries**, and **trial balance**. Double-entry style bookkeeping. Sales and expenses can post to the ledger; reports and P&L use this data. Suited for businesses that want a proper books view.

**Who it’s for** – All tenants (Advanced → Accounting).

**Marketing one-liner:** “Chart of accounts, journals, and trial balance for your books.”

---

## 23. Reports

**What it is** – Three report views under the Reports menu:

- **Overview** – Revenue, expenses, profit, product or service performance, expense breakdown, and pipeline (e.g. active jobs, open leads, pending invoices). Date range and filters. Content is business-type-specific (e.g. product sales for shop/pharmacy, job/service for studio).
- **Smart Report** – A detailed report for a chosen period, built from the same report data: executive summary, sales, financial overview and profit & loss, expenses, cash flow, inventory, and (for rental businesses) rentals, with charts and comparisons. It shows the business's own figures only and can be exported as PDF.
- **Compliance** – Reports formatted for submission to tax or revenue authorities.

**Who it’s for** – All tenants.

**Marketing one-liner:** “Clear reports on revenue, expenses, profit, and performance.”

---

## 24. Users and permissions

**What it is** – **Invite** users by email; assign **roles** (admin, manager, staff) per tenant. Roles control what each user can do (e.g. admins manage organization and integrations; staff may be limited to POS and sales). Invite flow: send invite, user signs up or logs in and joins the tenant.

**Who it’s for** – All tenants; the Users page is typically admin-only in the sidebar.

**Marketing one-liner:** “Invite team members and control who can do what.”

---

## 25. Settings

**What it is** – Central **Settings** with tabs:

- **Profile** – Logged-in user’s name, email, password change.
- **Appearance** – Theme (e.g. light/dark).
- **Organization** – Business name, logo, address, email, phone, website. Used on invoices and receipts.
- **Subscription** – Plan and billing (Starter, Professional, Enterprise); upgrade/downgrade and payment method.
- **Configurations** – POS and checkout: receipt mode (ask vs auto), receipt channels (SMS, WhatsApp, email, print), print format (A4 vs thermal), and whether customer phone/name is required at checkout.
- **Integration** – **WhatsApp**, **SMS**, **Email** (channels for receipts and notifications), and **Payments** (e.g. Paystack for card and mobile money). Configuration here drives what’s available in POS and invoice payment links.

**Who it’s for** – All users; organization and integration tabs are usually admin/manager.

**Marketing one-liner:** “Set your business details, POS and receipt options, and connect WhatsApp, SMS, email, and payments.”

---

## 26. Notifications and tours

**What it is** – **Notifications**: in-app notification list (bell icon); backend sends notifications for events (e.g. payment received, low stock). **Tours**: guided product tours (tooltips and steps) to onboard new users; content is configurable via the tours API.

**Who it’s for** – All tenants.

**Marketing one-liner:** “In-app notifications and guided product tours.”

---

## 27. Payments and integrations (summary)

**Paystack** – Configured under Settings → Integration → Payments. Used for **card** and **mobile money** (MTN MoMo, AirtelTigo, Telecel) in POS and for **invoice payment links**. Customers pay via link or in-person (MoMo from POS when online).

**WhatsApp** – Configured under Settings → Integration → WhatsApp. Used to send quotes, invoices, order confirmations, payment reminders, and low-stock alerts. Template-based (Meta WhatsApp Business API).

**SMS / Email** – When configured, used for receipts and other notifications (e.g. invoice sent, receipt after sale).

**Marketing one-liner:** “Accept card and mobile money, and send receipts and reminders via WhatsApp, SMS, or email.”

---

## 28. Platform admin (internal)

**What it is** – A separate **admin** area for **platform administrators** (not end-business users). Includes: overview (tenants, users, trials), tenant list, users, leads, jobs, expenses, billing, reports, system health, workspace (personal tasks/notes for admins), and platform settings. Used for operations and support.

**Who it’s for** – Platform admins only. Not visible to regular tenants.

**Marketing one-liner:** “Platform operations and tenant management (internal).”

---

## 29. Other / edge

**Checkout** – The `/checkout` route is the **subscription checkout** page: user selects a plan (Starter, Professional, Enterprise) and billing period (monthly/yearly), then completes payment. Used after login/signup when upgrading or when directed from pricing. Not the same as POS “checkout” (payment modal).

**Foot traffic** – Backend has foot-traffic routes; the feature is **not** in the main sidebar currently. Omit from customer-facing marketing unless re-enabled.

**Variance detection** – Backend has a variance detection service (e.g. for stock or data variance). It is **not** exposed as a dedicated UI in the main app pages; any use would be in reports or background jobs. No need to mention in marketing unless a dedicated UI is added.

**User workspace** – Under **admin**, Workspace is for platform admins’ personal tasks/notes. The main app’s “Workspace” route redirects to the dashboard; there is no separate tenant “workspace” page for end users.

**PWA** – The web app can be installed as a **Progressive Web App** (install banner and update prompt). Users can add it to the home screen and use it like an app on phone or tablet.

**Marketing one-liner (overall edge):** “Subscribe via in-app checkout; use the app as an installable PWA on any device.”

---

## Business-type feature matrix

| Feature | Shop | Pharmacy | Studio-like |
|--------|------|----------|-------------|
| Dashboard | Yes | Yes | Yes |
| POS | Yes | No | No |
| Sales list | Yes | No | No |
| Orders (kitchen) | Yes (restaurant only) | No | No |
| Products | Yes | No | No |
| Shops (locations) | Yes (if SHOW_SHOPS) | No | No |
| Jobs | No | No | Yes |
| Quotes | Yes (if enabled) | Yes | Yes |
| Pricing | No | No | Yes |
| Invoices | Yes | Yes | Yes |
| Customers | Yes | Yes | Yes |
| Vendors | Yes | Yes | Yes |
| Expenses | Yes | Yes | Yes |
| Pharmacies (locations) | No | Yes | No |
| Drugs | No | Yes | No |
| Prescriptions | No | Yes | No |
| Materials & equipment | Yes | Yes | Yes |
| Leads | Yes | Yes | Yes |
| Employees | Yes | Yes | Yes |
| Payroll | Yes | Yes | Yes |
| Accounting | Yes | Yes | Yes |
| Reports (incl. Smart Report) | Yes | Yes | Yes |
| Users & permissions | Yes | Yes | Yes |
| Settings | Yes | Yes | Yes |
| Notifications & tours | Yes | Yes | Yes |

---

*Last updated to match app routes, sidebar, and backend as of implementation. For technical API details see [Backend/API_ENDPOINTS_SUMMARY.md](../Backend/API_ENDPOINTS_SUMMARY.md).*
