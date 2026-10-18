# ABS (African Business Suite) - Business Management System - Backend API

A comprehensive backend API for managing studio operations including customers, jobs, services, vendors, payments, expenses, and pricing.

## 🚀 Features

- **Customer Management**: Track customer information, contact details, and balances
- **Job Management**: Create and manage jobs and services with detailed specifications
- **Vendor Management**: Manage suppliers and vendor relationships
- **Payment Tracking**: Record and track both income and expense payments
- **Expense Management**: Track business expenses with categorization
- **Pricing Templates**: Create pricing templates for different jobs and services
- **User Authentication**: JWT-based authentication with role-based access control
- **Statistics & Reports**: Get insights on jobs, payments, and expenses

## 📋 Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database
- npm or yarn

## 🔧 Installation

1. Clone the repository
```bash
git clone <repository-url>
cd Backend
```

2. Install dependencies
```bash
npm install
```

3. Create `.env` file from the example
```bash
cp env.example .env
```

4. Configure your environment variables in `.env`. Local development can use the demo database by copying the demo Backend `DATABASE_URL` value from Vercel/project secrets into `Backend/.env`; do not commit the real database URL.
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://username:password@demo-db-host/neondb?sslmode=require
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=7d
CORS_ORIGIN=http://localhost:3000
DEFAULT_PAGE_SIZE=10
MAX_PAGE_SIZE=100
```

### Platform Email Credential Encryption

Admin Settings can save Gmail or SendGrid platform email credentials for system emails. Before saving those secrets, configure a stable 64-character hex encryption key in the backend environment:

```bash
openssl rand -hex 32
```

You can also print a key from Node without writing files:

```bash
npm run generate:platform-email-key
```

Set the printed value as `PLATFORM_EMAIL_CREDENTIALS_ENCRYPTION_KEY`. Keep the same value across deploys and host restarts; changing or removing it means saved platform email credentials cannot be decrypted and must be re-entered.

5. Start the server
```bash
# Development
npm run dev

# Production
npm start
```

## 📚 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "admin"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

### Customers

#### Get All Customers
```http
GET /api/customers?page=1&limit=10&search=john
Authorization: Bearer <token>
```

#### Create Customer
```http
POST /api/customers
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Doe",
  "company": "ABC Company",
  "email": "john@abc.com",
  "phone": "123-456-7890",
  "address": "123 Main St",
  "city": "New York",
  "state": "NY",
  "zipCode": "10001"
}
```

### Jobs

#### Get All Jobs
```http
GET /api/jobs?page=1&limit=10&status=pending
Authorization: Bearer <token>
```

#### Create Job
```http
POST /api/jobs
Authorization: Bearer <token>
Content-Type: application/json

{
  "customerId": "uuid",
  "title": "Business Cards",
  "description": "1000 business cards",
  "quantity": 1000,
  "paperType": "Glossy",
  "paperSize": "3.5x2",
  "colorType": "color",
  "quotedPrice": 150.00,
  "dueDate": "2024-12-31"
}
```

### Payments

#### Create Payment
```http
POST /api/payments
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "income",
  "customerId": "uuid",
  "jobId": "uuid",
  "amount": 150.00,
  "paymentMethod": "credit_card",
  "paymentDate": "2024-01-15"
}
```

### Pricing

#### Calculate Job Price
```http
POST /api/pricing/calculate
Authorization: Bearer <token>
Content-Type: application/json

{
  "jobType": "business_cards",
  "paperType": "glossy",
  "paperSize": "3.5x2",
  "colorType": "color",
  "quantity": 1000,
  "additionalOptions": ["lamination"]
}
```

### Compliance reports (revenue center / tax submission)

Submission-ready financial statements (GET; query params: `startDate`, `endDate`; for financial-position only `endDate` as "as at" date). All require `Authorization: Bearer <token>` and tenant context.

| Endpoint | Description |
|----------|-------------|
| `GET /api/reports/income-expenditure` | Income (paid invoices) and expenditure by category |
| `GET /api/reports/profit-loss/compliance` | Profit & loss with expense breakdown by category |
| `GET /api/reports/financial-position` | Statement of financial position (IAS 1): debtors (trade receivables, 0 if none), inventory, equity |
| `GET /api/reports/cashflow` | Cash flow statement (simplified: operating activities only) |

Data sources: Invoice (revenue, debtors/trade receivables), Expense (by category), Product (inventory value). Reports are prepared in accordance with IAS and IFRS. Statement of financial position and cash flow use this operational data only (no double-entry/Accounting module required). Debtors show outstanding customer invoices (0 when none).

## 🔐 User Roles

- **admin**: Full access to all resources
- **manager**: Can create, read, update (limited delete)
- **staff**: Can read and update assigned jobs

## 📊 Database Models

### User
- id, name, email, password, role, isActive

### Customer
- id, name, company, email, phone, address, creditLimit, balance

### Vendor
- id, name, company, email, phone, address, category, balance

### Job
- id, jobNumber, customerId, title, status, priority, quantity, pricing details

### Payment
- id, paymentNumber, type, customerId, vendorId, jobId, amount, paymentMethod

### Expense
- id, expenseNumber, vendorId, jobId, category, amount, status

### PricingTemplate
- id, name, category, basePrice, pricePerUnit, discountTiers

## 🛡️ Security

- Helmet.js for security headers
- CORS configuration
- JWT token authentication
- Password hashing with bcrypt
- Role-based access control

## 🔄 API Response Format

Success Response:
```json
{
  "success": true,
  "data": {},
  "count": 10,
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

Error Response:
```json
{
  "success": false,
  "error": "Error message here"
}
```

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 5000 |
| NODE_ENV | Environment | development |
| DATABASE_URL | PostgreSQL connection string; use the demo DB secret locally when no local DB exists | - |
| JWT_SECRET | JWT secret key | - |
| JWT_EXPIRE | JWT expiration time | 7d |
| CORS_ORIGIN | Frontend URL | http://localhost:3000 |

## 🚦 Development

```bash
# Run in development mode with auto-reload
npm run dev

# Run in production mode
npm start
```

## 📦 Project Structure

```
Backend/
├── config/           # Configuration files
├── controllers/      # Route controllers
├── middleware/       # Custom middleware
├── models/          # Database models
├── routes/          # API routes
├── server.js        # Entry point
├── package.json     # Dependencies
└── README.md        # Documentation
```

## Data cleanup

To delete **all** users, tenants, and business/transaction data (e.g. for a fresh start), run:

```bash
CONFIRM_DELETE_ALL=yes node scripts/delete-all-app-data.js
```

Platform configuration (subscription plans, platform admin roles/permissions) is **not** deleted. After running, create a superadmin again with:

```bash
node scripts/create-superadmin.js
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the ISC License.


