# API Endpoints Summary

This document provides a comprehensive list of all API endpoints available for each business type (Printing Press, Shop, and Pharmacy).

## Common Endpoints (All Business Types)

### Authentication & User Management
- `POST /api/auth/signup` - User signup
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/update` - Update user profile
- `POST /api/auth/logout` - Logout

### Tenant Management
- `POST /api/tenants/signup` - Tenant signup (includes business type selection)
- `GET /api/tenants/me` - Get current tenant info
- `PUT /api/tenants/me` - Update tenant info

### Customer Management (CRM)
- `GET /api/customers` - List all customers (with pagination, search)
- `GET /api/customers/:id` - Get customer details
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer
- `GET /api/customers/:id/balance` - Get customer balance

### Vendor Management (CRM)
- `GET /api/vendors` - List all vendors
- `GET /api/vendors/:id` - Get vendor details
- `POST /api/vendors` - Create vendor
- `PUT /api/vendors/:id` - Update vendor
- `DELETE /api/vendors/:id` - Delete vendor

### Inventory Management
- `GET /api/inventory` - List inventory items
- `GET /api/inventory/:id` - Get inventory item
- `POST /api/inventory` - Create inventory item
- `PUT /api/inventory/:id` - Update inventory item
- `DELETE /api/inventory/:id` - Delete inventory item
- `GET /api/inventory/categories` - List categories
- `POST /api/inventory/categories` - Create category
- `PUT /api/inventory/categories/:id` - Update category
- `DELETE /api/inventory/categories/:id` - Delete category

### Invoice Management
- `GET /api/invoices` - List invoices (filterable by sourceType: job, sale, prescription)
- `GET /api/invoices/:id` - Get invoice details
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete invoice
- `POST /api/invoices/:id/send` - Send invoice (generates payment link, sends WhatsApp)
- `POST /api/invoices/:id/mark-paid` - Mark invoice as paid
- `GET /api/invoices/:id/pdf` - Generate PDF

### Public Invoice Endpoints (No Authentication Required)
- `GET /api/public/invoices/:token` - View invoice by payment token
- `POST /api/public/invoices/:token/initialize-paystack` - Start a Paystack payment for the invoice
- `POST /api/public/invoices/:token/verify-paystack` - Record a Paystack payment after Paystack confirms it
- `POST /api/public/invoices/:token/mobile-money/initiate` - Start a mobile money payment
- `POST /api/public/invoices/:token/mobile-money/poll` - Record a mobile money payment after the provider confirms it

### Payments & Expenses
- `GET /api/payments` - List payments
- `GET /api/payments/:id` - Get payment details
- `POST /api/payments` - Create payment
- `PUT /api/payments/:id` - Update payment
- `DELETE /api/payments/:id` - Delete payment
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Create expense

### Reports
- `GET /api/reports/sales` - Sales reports
- `GET /api/reports/profit-loss` - Profit & Loss reports
- `GET /api/reports/accounts-receivable` - AR reports
- `GET /api/reports/inventory` - Inventory reports

### Settings
- `GET /api/settings/profile` - Get profile settings
- `PUT /api/settings/profile` - Update profile settings
- `GET /api/settings/organization` - Get organization settings
- `PUT /api/settings/organization` - Update organization settings
- `GET /api/settings/subscription` - Get subscription info
- `GET /api/settings/whatsapp` - Get WhatsApp settings
- `PUT /api/settings/whatsapp` - Update WhatsApp settings
- `POST /api/settings/whatsapp/test-connection` - Test WhatsApp connection

### Webhooks
- `GET /api/webhooks/whatsapp` - WhatsApp webhook verification
- `POST /api/webhooks/whatsapp` - WhatsApp webhook events
- `POST /api/webhooks/sabito/customer` - Sabito customer webhook

---

## Printing Press Specific Endpoints

### Quotes
- `GET /api/quotes` - List quotes
- `GET /api/quotes/:id` - Get quote details
- `POST /api/quotes` - Create quote
- `PUT /api/quotes/:id` - Update quote
- `DELETE /api/quotes/:id` - Delete quote
- `POST /api/quotes/:id/send` - Send quote (sends WhatsApp)
- `POST /api/quotes/:id/convert-to-job` - Convert quote to job
- `GET /api/quotes/:id/pdf` - Generate PDF

### Jobs (Operations)
- `GET /api/jobs` - List jobs
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs` - Create job
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job
- `PUT /api/jobs/:id/status` - Update job status (triggers WhatsApp order confirmation)
- `POST /api/jobs/:id/generate-invoice` - Generate invoice from job
- `GET /api/jobs/:id/timeline` - Get job timeline

---

## Shop Management Endpoints

### Shops (Locations)
- `GET /api/shops` - List all shops
- `GET /api/shops/:id` - Get shop details
- `POST /api/shops` - Create shop
- `PUT /api/shops/:id` - Update shop
- `DELETE /api/shops/:id` - Delete shop

### Products (Shop Catalog)
- `GET /api/products` - List products (with pagination, search, filters)
- `GET /api/products/:id` - Get product details
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product (triggers WhatsApp low stock alerts)
- `DELETE /api/products/:id` - Delete product
- `GET /api/products/barcode/:barcode` - Get product by barcode

### Product Variants
- `GET /api/products/:id/variants` - List product variants
- `POST /api/products/:id/variants` - Create variant
- `PUT /api/products/:id/variants/:variantId` - Update variant
- `DELETE /api/products/:id/variants/:variantId` - Delete variant

### Barcodes
- `GET /api/products/:id/barcodes` - List barcodes for product
- `POST /api/products/:id/barcodes` - Create barcode
- `DELETE /api/barcodes/:id` - Delete barcode

### Sales (POS)
- `GET /api/sales` - List sales (with pagination, filters)
- `GET /api/sales/:id` - Get sale details
- `POST /api/sales` - Create sale (POS transaction)
- `PUT /api/sales/:id` - Update sale
- `POST /api/sales/:id/cancel` - Cancel sale
- `POST /api/sales/:id/generate-invoice` - Generate invoice from sale
- `GET /api/sales/:id/receipt` - Get receipt data for printing

---

## Pharmacy Management Endpoints

### Pharmacies (Locations)
- `GET /api/pharmacies` - List all pharmacies
- `GET /api/pharmacies/:id` - Get pharmacy details
- `POST /api/pharmacies` - Create pharmacy
- `PUT /api/pharmacies/:id` - Update pharmacy
- `DELETE /api/pharmacies/:id` - Delete pharmacy

### Drugs (Drug Catalog)
- `GET /api/drugs` - List drugs (with pagination, search, filters)
- `GET /api/drugs/:id` - Get drug details
- `POST /api/drugs` - Create drug
- `PUT /api/drugs/:id` - Update drug
- `DELETE /api/drugs/:id` - Delete drug
- `GET /api/drugs/expiring` - Get expiring drugs (query param: `days`, default 90)

### Prescriptions
- `GET /api/prescriptions` - List prescriptions (with pagination, filters)
- `GET /api/prescriptions/:id` - Get prescription details
- `POST /api/prescriptions` - Create prescription
- `PUT /api/prescriptions/:id` - Update prescription
- `POST /api/prescriptions/:id/fill` - Fill prescription (dispense drugs)
- `POST /api/prescriptions/check-interactions` - Check drug interactions
- `POST /api/prescriptions/:id/generate-invoice` - Generate invoice from prescription
- `GET /api/prescriptions/:id/label` - Get prescription label data for printing

### Drug Interactions
- `GET /api/drugs/:id/interactions` - Get interactions for a drug
- `POST /api/drug-interactions` - Create interaction record
- `DELETE /api/drug-interactions/:id` - Delete interaction record

### Expiry Alerts
- `GET /api/drugs/expiring` - Get expiring drugs (already listed above)
- `GET /api/expiry-alerts` - List expiry alerts
- `PUT /api/expiry-alerts/:id` - Update alert status

---

## Endpoint Status Summary

### ✅ Fully Implemented

**Printing Press:**
- ✅ Quotes (CRUD + send + convert to job)
- ✅ Jobs (CRUD + status updates + invoice generation)
- ✅ Invoices (from jobs)
- ✅ WhatsApp notifications (quote delivery, order confirmation, invoice notifications)

**Shop:**
- ✅ Shops (CRUD)
- ✅ Products (CRUD + barcode lookup)
- ✅ Product Variants (CRUD)
- ✅ Barcodes (CRUD)
- ✅ Sales/POS (CRUD + cancel + invoice generation + receipt printing)
- ✅ Invoices (from sales)
- ✅ WhatsApp notifications (low stock alerts, invoice notifications)

**Pharmacy:**
- ✅ Pharmacies (CRUD)
- ✅ Drugs (CRUD + expiring drugs query)
- ✅ Prescriptions (CRUD + fill + interaction check + invoice generation + label printing)
- ✅ Invoices (from prescriptions)
- ✅ WhatsApp notifications (invoice notifications)

**Common:**
- ✅ Customers (CRUD + balance)
- ✅ Vendors (CRUD)
- ✅ Inventory (CRUD + categories)
- ✅ Invoices (multi-source: job, sale, prescription)
- ✅ Payments & Expenses (CRUD)
- ✅ Public invoice viewing and payment
- ✅ WhatsApp integration (settings, webhooks, templates)
- ✅ Payment reminders (scheduled daily)

### ⚠️ Partially Implemented / Needs Enhancement

**Drug Interactions:**
- ⚠️ Interaction checking endpoint exists (`POST /api/prescriptions/check-interactions`)
- ⚠️ Full CRUD for interaction database may need dedicated endpoints
- ⚠️ Integration with external drug interaction APIs could be added

**Expiry Alerts:**
- ⚠️ Query endpoint exists (`GET /api/drugs/expiring`)
- ⚠️ Automated alert generation cron job could be added
- ⚠️ Alert management endpoints could be expanded

**Reports:**
- ⚠️ Basic report endpoints exist
- ⚠️ Business-type-specific reports could be enhanced
- ⚠️ Dashboard analytics endpoints could be added

### 📋 Not Yet Implemented (Future Enhancements)

**Shop:**
- 📋 Return/Refund management endpoints
- 📋 Multi-shop inventory transfers
- 📋 Advanced POS features (split payments, discounts, etc.)
- 📋 Sales analytics endpoints

**Pharmacy:**
- 📋 Prescription refill management endpoints
- 📋 Drug substitution endpoints
- 📋 Prescription expiry tracking
- 📋 Automated expiry alert generation

**Common:**
- 📋 Advanced reporting endpoints (custom date ranges, exports)
- 📋 Bulk operations endpoints
- 📋 Data import/export endpoints
- 📋 Advanced search/filtering endpoints

---

## Authentication & Authorization

All endpoints (except public invoice endpoints) require:
1. **Authentication**: Valid JWT token in `Authorization: Bearer <token>` header
2. **Tenant Context**: Automatically applied via `tenantContext` middleware
3. **Authorization**: Role-based access control (admin, manager, staff)

### Public Endpoints (No Authentication)
- `GET /api/public/invoices/:token` - View invoice
- `POST /api/public/invoices/:token/initialize-paystack` - Pay invoice (Paystack; mobile money via `/mobile-money/initiate`)
- `GET /api/public/pricing` - View pricing plans

---

## Notes

1. **Multi-tenancy**: All endpoints automatically filter data by `tenantId` from the authenticated user's context.

2. **WhatsApp Integration**: 
   - Requires tenant-specific configuration in Settings
   - Uses Meta WhatsApp Business API
   - Requires pre-approved message templates
   - Supports: invoice notifications, quote delivery, order confirmations, payment reminders, low stock alerts

3. **Payment Links**: 
   - Generated automatically when sending invoices
   - Uses secure tokens (`paymentToken` field)
   - Public endpoints allow viewing and payment without authentication

4. **Business Type Filtering**: 
   - Some endpoints are only available for specific business types (e.g., `/api/jobs` for printing press)
   - Frontend should handle routing based on tenant's `businessType`

5. **Field Naming Consistency**:
   - Shop: Uses `quantityOnHand` for product stock
   - Pharmacy: Uses `quantity` for drug stock
   - Both use `reorderLevel` for low stock thresholds

---

## Testing Recommendations

1. **Unit Tests**: Test each controller function with mock data
2. **Integration Tests**: Test full workflows (e.g., create sale → generate invoice → send → pay)
3. **WhatsApp Tests**: Test with Meta's test phone numbers
4. **Public Endpoints**: Test payment flow without authentication
5. **Multi-tenancy**: Verify data isolation between tenants

---

## API Versioning

Currently, all endpoints are under `/api/` prefix. Future versions could use `/api/v1/`, `/api/v2/`, etc.

---

*Last Updated: Based on current implementation as of the latest code review*
