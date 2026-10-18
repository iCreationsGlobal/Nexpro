# African Business Suite User Acceptance Testing (UAT) Plan

Plan and checklist for end-to-end testing before release.

---

## Purpose

We are running user acceptance testing to validate African Business Suite end-to-end with real users before rollout. The goal is to confirm that login, onboarding, core workflows, and key modules work as expected across **Studio**, **Shop**, and **Pharmacy** workspaces, and to catch any issues early.

For **tenant-type-specific E2E paths** (retail shop vs restaurant, studio variants, pharmacy, deliveries, public tracking, role checks), see **[`E2E_TESTING_BY_TENANT_TYPE.md`](./E2E_TESTING_BY_TENANT_TYPE.md)**.

---

## Scope

We are testing:

- **Authentication:** login, logout, invalid login.
- **Signup and onboarding:** new user signup, business type, business info, contact details.
- **Dashboard and navigation:** stats, sidebar, Financial and Resources submenus.
- **Leads and customers:** list, search, create, view details.
- **Business-type-specific flows:** Studio (Jobs, Vendors), Shop (Sales, POS, Shops, Products, Foot Traffic, Vendors), Pharmacy (Sales, Prescriptions, Pharmacies, Drugs, Foot Traffic, Vendors).
- **Financial:** Quotes, Invoices, Expenses, Pricing (Studio), Payroll, Accounting.
- **Resources:** Inventory, Employees, Products (Shop) / Drugs (Pharmacy).
- **Reports:** Overview, Smart Report, Generated Reports.
- **Settings:** Profile, Organization, Notifications.
- **Users** (admin only): list, invite or create user.
- **Platform admin** (optional): admin overview, Tenants, Billing, Reports, Health, Settings.

---

## Audience

Internal users, beta testers, or designated testers. Use a **Studio**, **Shop**, or **Pharmacy** workspace depending on what you are testing. If you have **platform admin** access, you can optionally run the Platform Admin section.

---

## When

Complete testing by **[date TBD]** / during the UAT window. *(Update as needed.)*

---

## Environment

- **App URL:** Use the frontend URL provided (e.g. Vercel deployment or `http://localhost:5173`).
- **Browser:** Chrome, Firefox, Safari, or Edge.
- **Test account:** Use the credentials provided, or sign up as a new user. Pick a workspace type (**Studio**, **Shop**, or **Pharmacy**) that matches what you are testing; the sidebar and flows differ by type.

---

## How to use this plan

- Work through the **Execution checklist** below in order.
- Tick each item as you complete it (in an editor with checkboxes, or print/export to PDF).
- Use the **Studio**, **Shop**, or **Pharmacy** subsections only when they apply to your workspace.
- Skip **Users** if you are not an admin; skip **Platform Admin** unless you have platform admin access.

---

## Reporting bugs

- **What to include:** Short description, **page** (or URL), **steps to reproduce**.
- **Where to report:** *(e.g. [shared spreadsheet / doc / issue tracker]—update as needed.)*

---

## Execution checklist

### 1. Authentication

- [ ] **Login**: Open `/login`, enter email and password, click submit. You land on `/dashboard`.
- [ ] **Invalid login**: Enter wrong email or password, submit. An error appears; you remain on the login page.
- [ ] **Logout**: Open the user menu (avatar or name in the header), choose **Logout**. You land on `/login`.

### 2. Signup and onboarding (new users)

- [ ] **Signup**: Go to signup (with or without an invite token). Complete name, email, and password. Submit.
- [ ] **Onboarding – Business type**: Choose **Studio**, **Shop**, or **Pharmacy**. If **Shop**, also select a shop type.
- [ ] **Onboarding – Business info**: Enter company name, logo, and/or address as shown. Proceed.
- [ ] **Onboarding – Contact**: Enter phone (with country code) and optional email. Submit. You reach the **Dashboard**.

### 3. Dashboard and navigation

- [ ] **Dashboard**: Stats and main widgets load. No errors or blank sections.
- [ ] **Sidebar**: All menu items for your business type are visible and clickable.
- [ ] **Financial submenu**: Expand **Financial**. Open **Quotes**, **Invoices**, **Expenses**, **Payroll**, **Accounting**. If **Studio**, also open **Pricing**.
- [ ] **Resources submenu**: Expand **Resources**. Open **Inventory**, **Employees**. If **Shop**, open **Products**. If **Pharmacy**, open **Drugs**.

### 4. Leads and customers

- [ ] **Leads**: Open **Leads**. List loads. Use search. Click **New Lead** (or equivalent), create a lead, confirm it appears in the list.
- [ ] **Customers**: Open **Customers**. List loads. Use search. Create a new customer, confirm it appears. Open a customer to view details.

### 5. Business-type-specific flows

#### If your workspace is **Studio**

- [ ] Open **Jobs**. Page loads.
- [ ] Create a job: select a customer, add at least one job item, submit. Confirm the job appears.
- [ ] View job details (click a job or **View**).
- [ ] Open **Vendors**. List loads.

#### If your workspace is **Shop**

- [ ] Open **Sales**. List loads.
- [ ] Open **POS**. Complete a simple sale if applicable.
- [ ] Open **Shops**, **Products**, **Foot Traffic**. Each page loads.
- [ ] Open **Vendors**. List loads.

#### If your workspace is **Pharmacy**

- [ ] Open **Sales**. List loads.
- [ ] Open **Prescriptions**. List or detail view loads.
- [ ] Open **Pharmacies**, **Drugs**, **Foot Traffic**. Each page loads.
- [ ] Open **Vendors**. List loads.

### 6. Financial

- [ ] **Quotes** (Studio only): Go to **Financial** → **Quotes**. Create a quote. Confirm it appears.
- [ ] **Invoices**: Open **Financial** → **Invoices**. Create an invoice (link to a job or sale if applicable). View or print it.
- [ ] **Expenses**: Open **Financial** → **Expenses**. Create an expense. Confirm it appears.
- [ ] **Pricing** (Studio only): Open **Financial** → **Pricing**. Page loads.
- [ ] **Payroll**: Open **Financial** → **Payroll**. Page loads.
- [ ] **Accounting**: Open **Financial** → **Accounting**. Page loads.

### 7. Resources

- [ ] **Inventory**: Open **Resources** → **Inventory**. List loads. Add or edit an item if applicable.
- [ ] **Employees**: Open **Resources** → **Employees**. List loads. Add or edit an employee if applicable.
- [ ] **Products** (Shop) / **Drugs** (Pharmacy): List loads. Create or view at least one item.

### 8. Reports

- [ ] **Overview**: Open **Reports**, then **Overview**. Page loads. Change date range if available.
- [ ] **Smart Report**: Open **Smart Report**. The report's figures (sales, expenses, profit, trends) load for the selected period.
- [ ] **Generated Reports**: Open **Generated Reports**. List or empty state loads.

### 9. Settings

- [ ] **Profile**: Open **Settings**. Update name or profile picture, save. Confirm success.
- [ ] **Organization**: Update business details (e.g. name, address), save. Confirm success.
- [ ] **Notifications** (if present): Toggle a setting, save.

### 10. Users (admin only)

- [ ] Open **Users** (visible only if you are an admin). List loads.
- [ ] Invite or create a user. Confirm they appear in the list.

### 11. Wrap-up

- [ ] **Logout** again. Log back in and confirm the **Dashboard** loads.
- [ ] **Note any bugs**: For each issue, write a short description, the page, and steps to reproduce. Report using the process described above.

### 12. Platform admin (optional)

If you have **platform admin** access, you are redirected to `/admin` after login. Use this section to smoke-test admin-only flows.

- [ ] Log in as a platform admin. You land on **Admin** (e.g. Overview).
- [ ] Open **Tenants**, **Billing**, **Reports**, **Health**, or **Settings** from the admin sidebar. Each page loads without errors.
- [ ] Perform at least one admin action (e.g. view a tenant, change a setting) and confirm it succeeds.
