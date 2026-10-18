# App Tour Targets - Detailed Element Mapping

This document outlines all specific UI elements and sections that will be targeted in the app tour system, organized by business type.

## Universal Tour Elements (All Business Types)

### 1. Dashboard Page (`/dashboard`)

#### Welcome Section
- **Selector**: `[data-tour="welcome-section"]`
- **Element**: `WelcomeSection` component
- **Content**: "This is your dashboard - your command center for managing your business"

#### Date Filter Buttons
- **Selector**: `[data-tour="date-filters"]`
- **Element**: `DateFilterButtons` component container
- **Content**: "Filter your dashboard data by date range - Today, This Week, This Month, or custom ranges"

#### Dashboard Stats Cards (KPI Cards)
- **Selector**: `[data-tour="dashboard-stats"]`
- **Element**: `DashboardStatsCards` container
- **Cards to highlight**:
  1. **Revenue/Sales Card**: `[data-tour="stat-revenue"]`
     - Shop/Pharmacy: "Total Sales"
     - Studio: "Total Revenue"
  2. **Expenses Card**: `[data-tour="stat-expenses"]`
  3. **Profit Card**: `[data-tour="stat-profit"]`
  4. **New Customers Card**: `[data-tour="stat-customers"]`
- **Content**: "These cards show your key business metrics. Click any card to see detailed breakdowns"

#### Recent Activity Table
- **Selector**: `[data-tour="recent-activity"]`
- **Element**: `DashboardJobsTable` or Recent Sales table
- **Content**: 
  - Shop/Pharmacy: "View your recent sales transactions here"
  - Studio: "Track your jobs in progress and their status"

#### Notice Board (Notifications Panel)
- **Selector**: `[data-tour="notice-board"]`
- **Element**: Notice board card on dashboard
- **Content**: "Important updates and notifications appear here"

### 2. Navigation Sidebar

#### Sidebar Container
- **Selector**: `[data-tour="sidebar"]`
- **Element**: `Sidebar` component
- **Content**: "Use the sidebar to navigate between different sections of your app"

#### Main Menu Items
- **Dashboard**: `[data-tour="nav-dashboard"]`
- **Customers**: `[data-tour="nav-customers"]`
- **Invoices**: `[data-tour="nav-invoices"]`
- **Expenses**: `[data-tour="nav-expenses"]`

#### Quick Actions Section
- **Selector**: `[data-tour="quick-actions"]`
- **Element**: Quick actions container in sidebar
- **Content**: "Quick actions let you perform common tasks faster - like creating a new sale or adding a customer"

#### Collapse/Expand Button
- **Selector**: `[data-tour="sidebar-collapse"]`
- **Content**: "Click here to collapse or expand the sidebar to save space"

### 3. Header Component

#### Search Bar
- **Selector**: `[data-tour="header-search"]`
- **Element**: Search input in Header
- **Content**: "Search across your entire database - customers, products, jobs, invoices, and more"

#### Notification Bell
- **Selector**: `[data-tour="header-notifications"]`
- **Element**: `NotificationBell` component
- **Content**: "Click here to see important notifications and updates"

#### User Profile Dropdown
- **Selector**: `[data-tour="header-profile"]`
- **Element**: User avatar/dropdown button
- **Content**: "Access your profile, settings, and account options here"

#### Upgrade Button (if applicable)
- **Selector**: `[data-tour="header-upgrade"]`
- **Content**: "Upgrade to Pro for advanced features"

---

## Shop-Specific Tour Elements

### 4. Sales Page (`/sales`)

#### Sales List/Table
- **Selector**: `[data-tour="sales-list"]`
- **Content**: "View all your sales transactions. Filter by date, customer, or payment method"

#### Add Sale Button
- **Selector**: `[data-tour="sales-add-button"]`
- **Content**: "Click here to record a new sale"

#### POS (Point of Sale) Button
- **Selector**: `[data-tour="pos-button"]`
- **Content**: "Open the Point of Sale system for quick checkout"

#### Sales Filters
- **Selector**: `[data-tour="sales-filters"]`
- **Content**: "Filter sales by status, customer, payment method, or date range"

### 5. Products Page (`/products`)

#### Products Grid/List
- **Selector**: `[data-tour="products-list"]`
- **Content**: "Manage your product catalog here. Add products, set prices, and track inventory"

#### Add Product Button
- **Selector**: `[data-tour="products-add"]`
- **Content**: "Add new products to your inventory"

#### Product Categories
- **Selector**: `[data-tour="product-categories"]`
- **Content**: "Organize products by categories for easier management"

#### Quick Sale Section (Staff View)
- **Selector**: `[data-tour="quick-sale-products"]`
- **Element**: Product cards on dashboard for staff
- **Content**: "Tap any product to quickly add it to a sale"

### 6. Inventory Page (`/inventory`)

#### Inventory Items Table
- **Selector**: `[data-tour="inventory-items"]`
- **Content**: "Track stock levels, set reorder points, and manage inventory"

#### Restock Button
- **Selector**: `[data-tour="inventory-restock"]`
- **Content**: "Restock items when you receive new inventory"

#### Stock Status Indicators
- **Selector**: `[data-tour="stock-status"]`
- **Content**: "Color-coded indicators show stock levels - green (in stock), yellow (low stock), red (out of stock)"

---

## Studio-Specific Tour Elements (Printing Press, Mechanic, Barber, Salon)

### 7. Jobs Page (`/jobs`)

#### Jobs Table
- **Selector**: `[data-tour="jobs-list"]`
- **Content**: "Manage all your jobs here. Track status, deadlines, and assignments"

#### Add Job Button
- **Selector**: `[data-tour="jobs-add"]`
- **Content**: "Create a new job for a customer"

#### Job Status Filters
- **Selector**: `[data-tour="jobs-filters"]`
- **Content**: "Filter jobs by status (New, In Progress, Completed, On Hold, Cancelled)"

#### Job Priority Indicators
- **Selector**: `[data-tour="job-priority"]`
- **Content**: "Set priority levels to manage urgent jobs"

#### Job Items Section
- **Selector**: `[data-tour="job-items"]`
- **Content**: "Add items, services, or products to each job with pricing"

### 8. Quotes Page (`/quotes`) - Printing Press Only

#### Quotes List
- **Selector**: `[data-tour="quotes-list"]`
- **Content**: "Create and manage quotes for potential customers"

#### Create Quote Button
- **Selector**: `[data-tour="quotes-create"]`
- **Content**: "Generate a quote that can be converted to a job later"

#### Quote to Job Conversion
- **Selector**: `[data-tour="quote-convert"]`
- **Content**: "Convert approved quotes directly into jobs"

### 9. Pricing Page (`/pricing`) - Printing Press Only

#### Pricing Templates
- **Selector**: `[data-tour="pricing-templates"]`
- **Content**: "Create reusable pricing templates for common jobs"

#### Add Template Button
- **Selector**: `[data-tour="pricing-add"]`
- **Content**: "Create new pricing templates to speed up job creation"

---

## Pharmacy-Specific Tour Elements

### 10. Prescriptions Page (`/prescriptions`)

#### Prescriptions List
- **Selector**: `[data-tour="prescriptions-list"]`
- **Content**: "Manage customer prescriptions and track medication dispensing"

#### New Prescription Button
- **Selector**: `[data-tour="prescriptions-add"]`
- **Content**: "Create a new prescription for a customer"

### 11. Drugs Page (`/drugs`)

#### Drugs Catalog
- **Selector**: `[data-tour="drugs-list"]`
- **Content**: "Manage your pharmaceutical inventory and drug catalog"

#### Drug Information
- **Selector**: `[data-tour="drug-details"]`
- **Content**: "View detailed information about each drug including dosage and interactions"

---

## Common Features Across All Types

### 12. Customers Page (`/customers`)

#### Customers Table
- **Selector**: `[data-tour="customers-list"]`
- **Content**: "Manage your customer database. Add, edit, and view customer information"

#### Add Customer Button
- **Selector**: `[data-tour="customers-add"]`
- **Content**: "Add a new customer to your database"

#### Customer Details Drawer
- **Selector**: `[data-tour="customer-details"]`
- **Content**: "Click any customer to view detailed information, history, and transactions"

### 13. Invoices Page (`/invoices`)

#### Invoices List
- **Selector**: `[data-tour="invoices-list"]`
- **Content**: "View and manage all invoices. Generate invoices from jobs or sales"

#### Create Invoice Button
- **Selector**: `[data-tour="invoices-create"]`
- **Content**: "Create a new invoice manually or from a completed job/sale"

#### Invoice Status
- **Selector**: `[data-tour="invoice-status"]`
- **Content**: "Track invoice status - Draft, Sent, Paid, Overdue"

### 14. Expenses Page (`/expenses`)

#### Expenses List
- **Selector**: `[data-tour="expenses-list"]`
- **Content**: "Track all business expenses to monitor your spending"

#### Add Expense Button
- **Selector**: `[data-tour="expenses-add"]`
- **Content**: "Record a new business expense"

#### Expense Categories
- **Selector**: `[data-tour="expense-categories"]`
- **Content**: "Categorize expenses for better reporting and analysis"

### 15. Reports Page (`/reports`)

#### Reports Overview
- **Selector**: `[data-tour="reports-overview"]`
- **Content**: "View comprehensive reports and analytics about your business"

#### Smart Report
- **Selector**: `[data-tour="reports-smart"]`
- **Content**: "Get a detailed report of your sales, expenses, profit and trends for any period"

### 16. Settings Page (`/settings`)

#### Organization Settings
- **Selector**: `[data-tour="settings-organization"]`
- **Content**: "Configure your business information, logo, and contact details"

#### User Management
- **Selector**: `[data-tour="settings-users"]`
- **Content**: "Manage team members and their access levels"

---

## Tour Flow Structure

### Main Tour (Post-Onboarding)

**Order of Steps:**
1. Welcome Section (Dashboard)
2. Dashboard Stats Cards
3. Date Filters
4. Navigation Sidebar
5. Quick Actions (if applicable)
6. Header Search
7. Header Notifications
8. Recent Activity Table
9. Notice Board

**Business-Type-Specific Continuations:**

**Shop:**
10. Sales Page Overview
11. Products Page Overview
12. Inventory Overview

**Studio (Printing Press, etc.):**
10. Jobs Page Overview
11. Quotes Page Overview (Printing Press only)
12. Pricing Templates (Printing Press only)

**Pharmacy:**
10. Prescriptions Overview
11. Drugs Catalog Overview
12. Sales/POS Overview

### Feature-Specific Mini Tours

**Customers Tour:**
- Customer list
- Add customer button
- Customer details drawer

**Invoices Tour:**
- Invoice list
- Create invoice
- Invoice status tracking

**Expenses Tour:**
- Expense list
- Add expense
- Expense categories

---

## Implementation Notes

### Data Attributes to Add

Each target element should have:
- `data-tour="[unique-id]"` - Primary selector
- `data-tour-step="[step-number]"` - Step order (optional)
- `data-tour-group="[group-name]"` - Group for conditional display

### Mobile Considerations

- On mobile, some elements may be in different locations (e.g., sidebar becomes hamburger menu)
- Tour should adapt to mobile layout
- Touch targets should be at least 44x44px
- Consider bottom sheets and modals on mobile

### Conditional Display

- Some tours should only show for specific business types
- Some steps should skip if feature is not enabled
- Admin-only features should be skipped for non-admin users

### Selector Strategy

Use data attributes (`data-tour`) instead of CSS classes or IDs because:
- More semantic and maintainable
- Less likely to conflict with styling
- Easier to identify tour targets
- Can be added without affecting existing functionality
