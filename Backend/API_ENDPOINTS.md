# API Endpoints Reference

## Authentication Endpoints

### Register
```
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "Test User",
  "email": "test@example.com",
  "password": "password123",
  "role": "admin"
}
```

### Login
```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "admin@printingpress.com",
  "password": "admin123"
}
```

### Get Current User
```
GET http://localhost:5000/api/auth/me
Authorization: Bearer YOUR_TOKEN_HERE
```

### Update User Details
```
PUT http://localhost:5000/api/auth/updatedetails
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "name": "Updated Name",
  "email": "updated@example.com"
}
```

### Update Password
```
PUT http://localhost:5000/api/auth/updatepassword
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword"
}
```

## Customer Endpoints

### Get All Customers
```
GET http://localhost:5000/api/customers?page=1&limit=10&search=john
Authorization: Bearer YOUR_TOKEN_HERE
```

### Get Single Customer
```
GET http://localhost:5000/api/customers/:id
Authorization: Bearer YOUR_TOKEN_HERE
```

### Create Customer
```
POST http://localhost:5000/api/customers
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "name": "John Doe",
  "company": "ABC Company",
  "email": "john@abc.com",
  "phone": "123-456-7890",
  "address": "123 Main St",
  "city": "New York",
  "state": "NY",
  "zipCode": "10001",
  "creditLimit": 5000
}
```

### Update Customer
```
PUT http://localhost:5000/api/customers/:id
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "name": "John Doe Updated",
  "creditLimit": 10000
}
```

### Delete Customer
```
DELETE http://localhost:5000/api/customers/:id
Authorization: Bearer YOUR_TOKEN_HERE
```

## Vendor Endpoints

### Get All Vendors
```
GET http://localhost:5000/api/vendors?page=1&limit=10
Authorization: Bearer YOUR_TOKEN_HERE
```

### Create Vendor
```
POST http://localhost:5000/api/vendors
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "name": "Paper Supply Co",
  "company": "Paper Supply Co",
  "email": "info@papersupply.com",
  "phone": "555-1234",
  "website": "https://www.papersupply.com",
  "address": "789 Supply Lane",
  "city": "Chicago",
  "state": "IL",
  "zipCode": "60601",
  "category": "Paper Supplier"
}
```

**Available Categories:**
- Paper Supplier
- Ink Supplier
- Equipment Supplier
- Printing Equipment
- Printing Services
- Binding & Finishing
- Design Services
- Pre-Press Services
- Packaging Materials
- Specialty Papers
- Maintenance & Repair
- Shipping & Logistics
- Software & Technology
- Other

## Vendor Price List Endpoints

### Get Vendor Price List
```
GET http://localhost:5000/api/vendors/:vendorId/price-list
Authorization: Bearer YOUR_TOKEN_HERE
```

### Create Price List Item
```
POST http://localhost:5000/api/vendors/:vendorId/price-list
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "itemType": "service",
  "name": "Business Card Printing",
  "description": "Premium business card printing service",
  "price": 49.99,
  "unit": "500 cards",
  "imageUrl": "https://example.com/image.jpg"
}
```

### Update Price List Item
```
PUT http://localhost:5000/api/vendors/:vendorId/price-list/:id
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "name": "Updated Service Name",
  "price": 59.99
}
```

### Delete Price List Item
```
DELETE http://localhost:5000/api/vendors/:vendorId/price-list/:id
Authorization: Bearer YOUR_TOKEN_HERE
```

## Job Endpoints

### Get All Jobs
```
GET http://localhost:5000/api/jobs?page=1&limit=10&status=pending
Authorization: Bearer YOUR_TOKEN_HERE
```

### Get Single Job
```
GET http://localhost:5000/api/jobs/:id
Authorization: Bearer YOUR_TOKEN_HERE
```

### Get Job Statistics
```
GET http://localhost:5000/api/jobs/stats/overview
Authorization: Bearer YOUR_TOKEN_HERE
```

### Create Job (with Job Items)
```
POST http://localhost:5000/api/jobs
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "customerId": "CUSTOMER_UUID_HERE",
  "title": "Business Cards for ABC Company",
  "description": "Premium business cards",
  "jobType": "Business Cards",
  "status": "pending",
  "priority": "medium",
  "startDate": "2024-01-15",
  "dueDate": "2024-01-25",
  "finalPrice": 150.00,
  "notes": "Customer wants matte finish",
  "items": [
    {
      "category": "Business Cards",
      "paperSize": "A4",
      "description": "Standard business cards",
      "quantity": 500,
      "unitPrice": 0.30
    }
  ]
}
```

**Note:** If status is "completed", an invoice will be automatically generated.

Response when status is "completed":
```json
{
  "success": true,
  "data": { /* job data */ },
  "invoice": {
    "id": "uuid",
    "invoiceNumber": "INV-202410-0001",
    "message": "Invoice automatically generated"
  }
}
```

### Update Job
```
PUT http://localhost:5000/api/jobs/:id
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "status": "completed"
}
```

**Auto-Invoice Generation:**
- When a job status changes to "completed", an invoice is automatically created
- Completion date is automatically set to current timestamp
- Invoice includes all job items and customer information
- Default invoice settings: Net 30 payment terms, 0% tax, no discount
- If invoice already exists for the job, no duplicate is created

Response when changing to "completed":
```json
{
  "success": true,
  "data": { /* updated job data */ },
  "invoice": {
    "id": "uuid",
    "invoiceNumber": "INV-202410-0001",
    "message": "Invoice automatically generated"
  }
}
```

### Delete Job
```
DELETE http://localhost:5000/api/jobs/:id
Authorization: Bearer YOUR_TOKEN_HERE
```

## Invoice Endpoints

### Get All Invoices
```
GET http://localhost:5000/api/invoices?page=1&limit=10&status=draft
Authorization: Bearer YOUR_TOKEN_HERE
```

### Get Single Invoice
```
GET http://localhost:5000/api/invoices/:id
Authorization: Bearer YOUR_TOKEN_HERE
```

### Create Invoice (Manual)
```
POST http://localhost:5000/api/invoices
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "jobId": "JOB_UUID_HERE",
  "dueDate": "2024-02-15",
  "paymentTerms": "Net 30",
  "taxRate": 12.5,
  "discountType": "percentage",
  "discountValue": 10,
  "notes": "Thank you for your business",
  "termsAndConditions": "Payment is due within 30 days"
}
```

**Note:** Most invoices are auto-generated when jobs are completed. Manual creation is available as a fallback.

### Update Invoice
```
PUT http://localhost:5000/api/invoices/:id
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "status": "sent",
  "notes": "Updated notes"
}
```

### Record Payment on Invoice
```
POST http://localhost:5000/api/invoices/:id/payment
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "amount": 150.00,
  "paymentMethod": "credit_card",
  "referenceNumber": "REF-12345",
  "paymentDate": "2024-01-20"
}
```

### Send Invoice
```
POST http://localhost:5000/api/invoices/:id/send
Authorization: Bearer YOUR_TOKEN_HERE
```

### Cancel Invoice
```
POST http://localhost:5000/api/invoices/:id/cancel
Authorization: Bearer YOUR_TOKEN_HERE
```

### Get Invoice Statistics
```
GET http://localhost:5000/api/invoices/stats/summary
Authorization: Bearer YOUR_TOKEN_HERE
```

### Delete Invoice
```
DELETE http://localhost:5000/api/invoices/:id
Authorization: Bearer YOUR_TOKEN_HERE
```

## Payment Endpoints

### Get All Payments
```
GET http://localhost:5000/api/payments?page=1&type=income&status=completed
Authorization: Bearer YOUR_TOKEN_HERE
```

### Get Payment Statistics
```
GET http://localhost:5000/api/payments/stats/overview
Authorization: Bearer YOUR_TOKEN_HERE
```

### Create Payment (Income)
```
POST http://localhost:5000/api/payments
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "type": "income",
  "customerId": "CUSTOMER_UUID_HERE",
  "jobId": "JOB_UUID_HERE",
  "amount": 150.00,
  "paymentMethod": "credit_card",
  "paymentDate": "2024-01-15",
  "status": "completed"
}
```

### Create Payment (Expense)
```
POST http://localhost:5000/api/payments
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "type": "expense",
  "vendorId": "VENDOR_UUID_HERE",
  "amount": 75.00,
  "paymentMethod": "bank_transfer",
  "paymentDate": "2024-01-15",
  "status": "completed"
}
```

## Expense Endpoints

### Get All Expenses
```
GET http://localhost:5000/api/expenses?page=1&category=Materials&status=pending
Authorization: Bearer YOUR_TOKEN_HERE
```

### Get Expense Statistics
```
GET http://localhost:5000/api/expenses/stats/overview
Authorization: Bearer YOUR_TOKEN_HERE
```

### Create Expense
```
POST http://localhost:5000/api/expenses
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "vendorId": "VENDOR_UUID_HERE",
  "jobId": "JOB_UUID_HERE",
  "category": "Materials",
  "description": "Paper and ink supplies",
  "amount": 150.00,
  "expenseDate": "2024-01-15",
  "paymentMethod": "credit_card",
  "status": "pending"
}
```

## Pricing Endpoints

### Get All Pricing Templates
```
GET http://localhost:5000/api/pricing?page=1&category=Business Cards&isActive=true
Authorization: Bearer YOUR_TOKEN_HERE
```

### Create Pricing Template
```
POST http://localhost:5000/api/pricing
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "name": "Standard Business Cards",
  "category": "Business Cards",
  "jobType": "business_cards",
  "paperType": "Standard",
  "paperSize": "3.5x2",
  "colorType": "color",
  "basePrice": 50.00,
  "pricePerUnit": 0.10,
  "setupFee": 25.00,
  "minimumQuantity": 100,
  "discountTiers": [
    {
      "minQuantity": 500,
      "maxQuantity": 999,
      "discountPercent": 5
    },
    {
      "minQuantity": 1000,
      "maxQuantity": null,
      "discountPercent": 10
    }
  ]
}
```

### Calculate Price
```
POST http://localhost:5000/api/pricing/calculate
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "jobType": "business_cards",
  "paperType": "Standard",
  "paperSize": "3.5x2",
  "colorType": "color",
  "quantity": 1000,
  "additionalOptions": []
}
```

## Messaging Settings Endpoints

### Get Notification Channels
```
GET /api/settings/notification-channels
Headers: Authorization: Bearer <token>
```
Returns which channels are configured (`email`, `sms`, `whatsapp`) and the customer message switches.
`autoSendReceiptToCustomer` is `true` unless the workspace turned it off (POS `auto_send` mode also sends receipts).

### Update Customer Notification Preferences
```
PUT /api/settings/customer-notification-preferences
Headers: Authorization: Bearer <token>
```
Body (any subset):
```json
{
  "autoSendInvoiceToCustomer": true,
  "autoSendReceiptToCustomer": true,
  "sendPaymentReminderEmail": false,
  "sendInvoicePaidConfirmationToCustomer": true
}
```

## Removed Endpoints

AI, advanced automations and ABS Watch moved to Lynk. These routes no longer exist:
`/api/analysis/*`, `/api/automations/*`, `/api/watch/*`, `/api/watch-agent/*`, `POST /api/reports/ai-analysis`,
`/api/settings/ai`, `POST /api/store/banner/generate`, `POST /api/messages/birthday-setup`,
`GET /api/admin/automations/overview`.

`POST /api/assistant/chat` stays only for older app builds and always answers `410`:
```json
{ "success": false, "code": "ASSISTANT_REMOVED", "message": "Ask Ayebia is no longer available in ABS." }
```

## Query Parameters

### Common Query Parameters
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `search`: Search term for filtering
- `status`: Filter by status
- `type`: Filter by type
- `category`: Filter by category

### Response Format

Success Response:
```json
{
  "success": true,
  "count": 10,
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalPages": 5
  },
  "data": []
}
```

Error Response:
```json
{
  "success": false,
  "error": "Error message"
}
```

## Status Codes

- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error


