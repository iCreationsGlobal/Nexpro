# Rental Damage & Expense Workflow

## Overview

When a rental item is damaged during return:
1. **DamageReport** records *what happened* (condition, damage type, photos, estimate)
2. **Expense** records *the cost* (repair/replacement cost) using existing Expense model

This leverages the existing Expense infrastructure without creating a new expense table.

---

## Data Flow

```
Rental Return
    ↓
Staff records return condition
    ↓
Damage detected?
    ├─ YES: Record damage → DamageReport created
    │         ↓
    │       Estimate repair cost
    │         ↓
    │       Auto-create Expense with damageReportId FK
    │         ↓
    │       Expense awaits approval
    │         ↓
    │       Manager approves (or rejects/adjusts cost)
    │         ↓
    │       Expense status → paid (when repair invoice received)
    │         ↓
    │       Rental closes with damage liability settled
    │
    └─ NO: Rental completes without damage
            ↓
          Rental status → completed
```

---

## Table Schema Changes

### DamageReport Model (NEW)

```javascript
{
  id: UUID (PK),
  rentalId: UUID (FK → Rental),
  rentalItemId: UUID (FK → RentalItem), // Which item was damaged
  productId: UUID (FK → Product), // For quick lookup
  damageType: ENUM('scratch', 'dent', 'broken', 'lost', 'stained', 'other'),
  severity: ENUM('minor', 'moderate', 'severe'),
  description: TEXT, // Detailed notes by staff
  photos: TEXT[], // URLs to uploaded damage photos
  estimatedRepairCost: DECIMAL, // Cost to repair/replace
  expenseId: UUID (FK → Expense), // Link to created Expense
  status: ENUM('pending_approval', 'approved', 'rejected', 'completed'),
  inspectionDate: TIMESTAMP,
  inspectionBy: UUID (FK → User), // Staff who inspected
  approvalDate: TIMESTAMP (nullable),
  approvalBy: UUID (FK → User), // Manager who approved
  actualRepairCost: DECIMAL (nullable), // Final cost after repair done
  repairNotes: TEXT,
  createdAt, updatedAt
}
```

### Expense Model (EXISTING, ENHANCED)

Add optional field:
```javascript
{
  // ... existing fields ...
  damageReportId: UUID (FK → DamageReport), // NEW: Links back to damage record
  
  // Example for rental damage expense:
  category: 'Rental Damage', // or 'Rental Repair'
  description: 'Camera lens replacement - Rental #REN-2026-08-115',
  amount: 850.00,
  expenseDate: '2026-08-26',
  shopId: 'branch-uuid', // Branch where rental occurred
  status: 'pending', // → 'paid' when repair completed
  approvalStatus: 'pending_approval' // → 'approved' when manager reviews
}
```

---

## Workflow Steps

### Step 1: Return & Inspect (Staff)

```javascript
POST /api/rentals/:rentalId/return
Body: {
  actualReturnDate: "2026-08-26",
  items: [
    {
      rentalItemId: "item-uuid",
      condition: "damaged", // or 'good', 'worn'
      notes: "Lens has scratches, still functional"
    }
  ]
}

Response: Rental {
  status: 'returned',
  actualReturnDate: '2026-08-26',
  items: [...],
  hasUnreportedDamage: false // All items assessed
}
```

### Step 2: Record Damage (Staff)

```javascript
POST /api/rentals/:rentalId/damage
Body: {
  rentalItemId: "item-uuid",
  productId: "product-uuid",
  damageType: "scratch",
  severity: "minor",
  description: "Surface scratches on lens barrel, does not affect optical performance",
  photos: [
    "s3://abs-uploads/damage-2026-08-26-001.jpg",
    "s3://abs-uploads/damage-2026-08-26-002.jpg"
  ],
  estimatedRepairCost: 150.00,
  inspectionBy: "user-uuid"
}

Response: DamageReport {
  id: "damage-uuid",
  rentalId: "rental-uuid",
  rentalItemId: "item-uuid",
  status: 'pending_approval',
  estimatedRepairCost: 150.00,
  expenseId: null, // Not yet created
  createdAt: "2026-08-26T10:30:00Z"
}
```

### Step 3: Auto-Create Expense (Backend Service)

Triggered after DamageReport creation:

```javascript
async function createExpenseFromDamageReport(damageReportId) {
  const damageReport = await DamageReport.findByPk(damageReportId);
  const rental = await Rental.findByPk(damageReport.rentalId);
  const product = await Product.findByPk(damageReport.productId);

  // Auto-generate expense
  const expense = await Expense.create({
    tenantId: rental.tenantId,
    shopId: rental.branchId, // Expense tracked to branch
    damageReportId: damageReportId, // Link to damage record
    expenseNumber: generateExpenseNumber(),
    category: 'Rental Damage',
    description: `${damageReport.damageType} on ${product.name} - Rental #${rental.id}`,
    amount: damageReport.estimatedRepairCost,
    expenseDate: damageReport.inspectionDate,
    paymentMethod: 'pending', // To be determined
    status: 'pending',
    approvalStatus: 'pending_approval',
    notes: damageReport.description,
    createdBy: damageReport.inspectionBy
  });

  // Link expense back to damage report
  damageReport.expenseId = expense.id;
  damageReport.status = 'pending_approval';
  await damageReport.save();

  return expense;
}
```

### Step 4: Manager Approves Expense

```javascript
PATCH /api/expenses/:expenseId
Body: {
  approvalStatus: 'approved',
  // Optional: adjust cost if needed
  amount: 175.00 // Manager reviewed and adjusted
}

Response: Expense {
  id: 'expense-uuid',
  damageReportId: 'damage-uuid',
  amount: 175.00,
  approvalStatus: 'approved',
  status: 'pending' // Awaiting payment
}
```

Backend also updates DamageReport:
```javascript
// Triggered by expense approval
damageReport.status = 'approved';
damageReport.estimatedRepairCost = expense.amount; // Use approved amount
await damageReport.save();
```

### Step 5: Repair Completed & Expense Paid

```javascript
PATCH /api/expenses/:expenseId
Body: {
  status: 'paid',
  actualAmount: 175.00,
  paymentMethod: 'bank_transfer',
  paymentDate: '2026-09-05',
  notes: 'Repair completed by XYZ Camera Service'
}

Response: Expense {
  id: 'expense-uuid',
  status: 'paid',
  approvalStatus: 'approved'
}
```

Backend updates DamageReport:
```javascript
damageReport.status = 'completed';
damageReport.actualRepairCost = 175.00;
damageReport.repairNotes = 'Repair completed by XYZ Camera Service';
await damageReport.save();
```

### Step 6: Close Rental & Calculate Total Due

```javascript
// After all damage reports are completed and expenses paid:
async function closeRental(rentalId) {
  const rental = await Rental.findByPk(rentalId, {
    include: ['damageReports', 'lateCharges', 'extensions']
  });

  const totalDamageCost = rental.damageReports
    .filter(d => d.status === 'completed')
    .reduce((sum, d) => sum + d.actualRepairCost, 0);

  const totalLateCharges = rental.lateCharges
    .filter(lc => lc.status !== 'waived')
    .reduce((sum, lc) => sum + lc.totalCharge, 0);

  rental.totalDue = rental.amount + totalDamageCost + totalLateCharges - rental.discountAmount;
  rental.status = 'completed';
  await rental.save();

  // Create Invoice
  const invoice = await Invoice.create({
    tenantId: rental.tenantId,
    customerId: rental.customerId,
    invoiceNumber: generateInvoiceNumber(),
    type: 'rental',
    metadata: { rentalId: rental.id },
    lines: [
      { description: 'Rental - ' + items.map(i => i.product.name).join(', '), amount: rental.amount },
      { description: 'Late Charges', amount: totalLateCharges },
      { description: 'Damage Repair', amount: totalDamageCost },
      { description: 'Discount', amount: -rental.discountAmount }
    ],
    totalAmount: rental.totalDue,
    amountPaid: rental.amountPaid,
    amountDue: rental.totalDue - rental.amountPaid,
    status: 'issued',
    createdAt: new Date()
  });

  return { rental, invoice };
}
```

---

## API Endpoints

### Record Damage
```
POST /api/rentals/:rentalId/damage
Body: {
  rentalItemId, productId, damageType, severity, description, 
  photos[], estimatedRepairCost, inspectionBy
}
Returns: DamageReport
Status: 201 Created
```

### List Damage Reports
```
GET /api/damage-reports?rentalId=&status=&branchId=&approvalStatus=
Returns: Paginated damage reports
```

### Get Damage Report Details
```
GET /api/damage-reports/:damageReportId
Returns: DamageReport with linked Rental, RentalItem, Expense
```

### Approve Damage (Manager)
```
PATCH /api/damage-reports/:damageReportId
Body: { status: 'approved', estimatedRepairCost: 175.00 }
Returns: Updated DamageReport
Side Effect: Expense amount updated
```

### Mark Damage as Completed
```
PATCH /api/damage-reports/:damageReportId
Body: { status: 'completed', actualRepairCost: 175.00, repairNotes: '...' }
Returns: Updated DamageReport
Side Effect: Linked Expense marked as 'paid'
```

---

## Reporting & Queries

### Dashboard Widget: Damage by Product
```sql
SELECT 
  p.name AS product,
  COUNT(*) AS damage_count,
  SUM(dr.actualRepairCost) AS total_repair_cost
FROM damage_reports dr
JOIN rental_items ri ON dr.rentalItemId = ri.id
JOIN products p ON dr.productId = p.id
WHERE dr.status = 'completed'
  AND dr.inspectionDate >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.name
ORDER BY total_repair_cost DESC;
```

### Damage Trend Report
```sql
SELECT 
  DATE_TRUNC('month', dr.inspectionDate) AS month,
  COUNT(*) AS incidents,
  SUM(dr.actualRepairCost) AS total_cost,
  AVG(dr.actualRepairCost) AS avg_repair_cost
FROM damage_reports dr
WHERE dr.tenantId = $1 AND dr.status = 'completed'
GROUP BY month
ORDER BY month DESC;
```

### Customer Damage History
```sql
SELECT 
  dr.id,
  r.id AS rental_id,
  p.name AS product,
  dr.damageType,
  dr.severity,
  dr.actualRepairCost,
  dr.inspectionDate
FROM damage_reports dr
JOIN rentals r ON dr.rentalId = r.id
JOIN products p ON dr.productId = p.id
WHERE r.customerId = $1
ORDER BY dr.inspectionDate DESC;
```

### Expense Reconciliation: Rental vs Damage Costs
```sql
SELECT 
  COALESCE(DATE_TRUNC('day', r.startDate), DATE_TRUNC('day', e.expenseDate)) AS date,
  COUNT(DISTINCT r.id) AS total_rentals,
  SUM(r.amount) AS rental_revenue,
  COUNT(DISTINCT e.id) AS damage_expenses,
  SUM(e.amount) FILTER (WHERE e.damageReportId IS NOT NULL) AS damage_cost,
  (SUM(r.amount) - SUM(e.amount) FILTER (WHERE e.damageReportId IS NOT NULL)) AS net_revenue
FROM rentals r
FULL OUTER JOIN expenses e ON r.branchId = e.shopId 
  AND DATE_TRUNC('day', r.startDate) = DATE_TRUNC('day', e.expenseDate)
  AND e.damageReportId IS NOT NULL
WHERE r.tenantId = $1
GROUP BY date
ORDER BY date DESC;
```

---

## Error Handling

### Validation Rules

1. **Damage on Returned Rental Only:** Can only record damage if Rental.status = 'returned'
2. **Item Must Exist:** rentalItemId must belong to the rental
3. **Cost Must be Positive:** estimatedRepairCost > 0
4. **Expense FK Required:** After DamageReport creation, expenseId must be populated
5. **Photos Validation:** At least 1 photo for moderate/severe damage

### Error Responses

```json
// Damage on non-returned rental
{
  "error": "RENTAL_NOT_RETURNED",
  "message": "Can only record damage on returned rentals",
  "rentalId": "rental-uuid",
  "rentalStatus": "active"
}

// Invalid cost
{
  "error": "INVALID_REPAIR_COST",
  "message": "Repair cost must be positive",
  "received": -50
}

// Expense creation failed
{
  "error": "EXPENSE_CREATION_FAILED",
  "message": "Could not auto-create expense for damage report",
  "damageReportId": "damage-uuid",
  "details": "Shop branch not found"
}
```

---

## Notification Triggers

- **Damage Recorded:** Manager notified of pending damage approval
- **Damage Approved:** Staff notified for repair coordination
- **Repair Completed:** Finance notified of completed expense
- **High Damage Cost:** Finance/Admin alerted if cost > threshold (e.g., > 1000)

---

## Summary

| Component | Model | Purpose |
|-----------|-------|---------|
| **Damage Record** | DamageReport | Records condition, type, severity, estimated cost, photos |
| **Financial Impact** | Expense | Auto-created, tracks actual repair/replacement cost |
| **Audit Trail** | DamageReport.expenseId | Links damage to expense for reconciliation |
| **Workflow** | Pending → Approved → Completed | Manager approval gate before paying repair costs |
| **Reporting** | Damage + Expense join | Dashboard, trends, customer history, cost analysis |
