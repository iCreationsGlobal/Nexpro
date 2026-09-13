# Rental Customer Metadata — Implementation Guide

## Overview

Rental-specific customer data is stored in the **existing `Customer.metadata` JSONB field**. This approach:
- ✅ Reuses existing infrastructure (no new table)
- ✅ Keeps Customer model clean (no extra columns)
- ✅ Allows flexible, extensible schema for future rental fields
- ✅ Follows ABS pattern (Sabito integration uses same approach)

---

## Metadata Structure

### Full Schema

```json
{
  "rental": {
    "guarantor": {
      "name": "John Doe",
      "phone": "+233201234567",
      "idType": "ghanaCard|passport|drivingLicense|nid",
      "idNumber": "GHA-XXXX-XXXX-XXXX-XXXX",
      "idExpiry": "2027-06-15"
    },
    "emergencyContact": {
      "name": "Jane Doe",
      "phone": "+233209876543",
      "relationship": "Sister|Spouse|Parent|Friend|Other"
    },
    "riskProfile": {
      "riskRating": "low|medium|high",
      "riskNotes": "Previous late return in Q2 2026",
      "creditLimitForRentals": 5000.00,
      "creditUtilized": 1200.00,
      "credibilityScore": 85
    },
    "verification": {
      "idVerificationDate": "2026-08-26",
      "idVerificationBy": "user-uuid", // Staff member who verified
      "idProofUrl": "s3://abs-uploads/customer-id-proof-2026-08.jpg",
      "addressVerificationDate": "2026-08-26",
      "addressVerificationMethod": "field_visit|document|self_declaration"
    },
    "preferences": {
      "preferredPaymentMethod": "mobile_money|cash|card|bank_transfer",
      "autoExtendNotification": true,
      "damageWaiverConsent": false
    },
    "history": {
      "totalRentals": 12,
      "totalRentalDays": 156,
      "totalRentalRevenue": 8400.00,
      "totalLateCharges": 250.00,
      "totalDamageIncidents": 2,
      "totalDamageCost": 1100.00,
      "lastRentalDate": "2026-08-20",
      "lastRentalId": "rental-uuid"
    }
  }
}
```

---

## Field Definitions

### Guarantor (Optional)
**When:** High-value rentals or first-time customers with no credit history  
**Fields:**
- `name` (string): Guarantor's full name
- `phone` (string, E.164): Guarantor's contact number
- `idType` (enum): Document type used for guarantor verification
- `idNumber` (string): ID/passport number
- `idExpiry` (ISO date): Expiry date of guarantor's ID

### Emergency Contact (Recommended)
**When:** All rental customers  
**Fields:**
- `name` (string): Emergency contact's full name
- `phone` (string, E.164): Contact's phone number
- `relationship` (string): Relationship to customer

### Risk Profile (Auto-updated)
**When:** Rental scoring and credit decisions  
**Fields:**
- `riskRating` (enum): **low** (no late charges/damage), **medium** (minor incidents), **high** (repeated issues)
- `riskNotes` (string): Notes on why medium/high rating
- `creditLimitForRentals` (decimal): Max value customer can rent at once
- `creditUtilized` (decimal): Current rental value outstanding
- `credibilityScore` (0-100): Auto-calculated based on rental history

### Verification (Auto-populated)
**When:** ID check performed; address confirmed  
**Fields:**
- `idVerificationDate` (ISO datetime): When ID was verified
- `idVerificationBy` (UUID): User who performed verification
- `idProofUrl` (string, URL): Link to uploaded ID photo/document
- `addressVerificationDate` (ISO datetime): When address was verified
- `addressVerificationMethod` (enum): How address was verified

### Preferences (Editable by customer/staff)
**When:** Rental management and notifications  
**Fields:**
- `preferredPaymentMethod` (enum): Customer's usual payment method
- `autoExtendNotification` (boolean): Send reminder before return date?
- `damageWaiverConsent` (boolean): Customer agrees to damage liability terms?

### History (Auto-updated on each rental)
**When:** Dashboard, customer profile, risk scoring  
**Fields:**
- `totalRentals` (integer): Count of all rentals
- `totalRentalDays` (integer): Sum of all rental durations
- `totalRentalRevenue` (decimal): Total rental fees paid
- `totalLateCharges` (decimal): Sum of all late charges incurred
- `totalDamageIncidents` (integer): Count of damage reports
- `totalDamageCost` (decimal): Sum of all damage repair costs
- `lastRentalDate` (ISO date): Most recent rental date
- `lastRentalId` (UUID): Link to most recent rental

---

## Usage in Code

### Reading Rental Metadata

```javascript
const customer = await Customer.findByPk(customerId);

// Access guarantor info
const guarantor = customer.metadata?.rental?.guarantor;
if (guarantor?.idExpiry) {
  console.log(`Guarantor ID expires: ${guarantor.idExpiry}`);
}

// Get risk rating
const riskRating = customer.metadata?.rental?.riskProfile?.riskRating;

// Check history
const totalLateCharges = customer.metadata?.rental?.history?.totalLateCharges || 0;
```

### Creating/Updating Rental Metadata

```javascript
// When customer first used for rental
const customer = await Customer.findByPk(customerId);
customer.metadata = customer.metadata || {};
customer.metadata.rental = {
  guarantor: {
    name: "John Doe",
    phone: "+233201234567",
    idType: "ghanaCard",
    idNumber: "GHA-1234-5678-9012-XXXX",
    idExpiry: "2027-06-15"
  },
  emergencyContact: {
    name: "Jane Doe",
    phone: "+233209876543",
    relationship: "Sister"
  },
  riskProfile: {
    riskRating: "low",
    creditLimitForRentals: 5000.00
  },
  verification: {
    idVerificationDate: new Date(),
    idVerificationBy: verifyingUserId,
    idProofUrl: "s3://bucket/proof.jpg"
  },
  preferences: {
    preferredPaymentMethod: "mobile_money"
  },
  history: {
    totalRentals: 0,
    totalRentalDays: 0,
    totalRentalRevenue: 0,
    totalLateCharges: 0,
    totalDamageIncidents: 0,
    totalDamageCost: 0
  }
};

await customer.save();
```

### Auto-updating History After Rental

```javascript
// After rental is completed
async function updateRentalCustomerHistory(customerId, rentalData) {
  const customer = await Customer.findByPk(customerId);
  
  if (!customer.metadata?.rental) {
    return; // Customer has no rental metadata yet
  }

  const history = customer.metadata.rental.history;
  const duration = rentalData.rentalDuration; // days
  const amount = rentalData.amount;
  const lateCharges = rentalData.lateCharges || 0;
  const damageIncidents = rentalData.damageReports?.length || 0;
  const damageCost = rentalData.totalDamageCharges || 0;

  // Update history
  history.totalRentals = (history.totalRentals || 0) + 1;
  history.totalRentalDays = (history.totalRentalDays || 0) + duration;
  history.totalRentalRevenue = (history.totalRentalRevenue || 0) + amount;
  history.totalLateCharges = (history.totalLateCharges || 0) + lateCharges;
  history.totalDamageIncidents = (history.totalDamageIncidents || 0) + damageIncidents;
  history.totalDamageCost = (history.totalDamageCost || 0) + damageCost;
  history.lastRentalDate = new Date().toISOString().split('T')[0];
  history.lastRentalId = rentalData.id;

  // Auto-update risk rating based on history
  if (damageIncidents > 0 || lateCharges > 500) {
    customer.metadata.rental.riskProfile.riskRating = 'high';
  } else if (lateCharges > 0) {
    customer.metadata.rental.riskProfile.riskRating = 'medium';
  }

  await customer.save();
}
```

### Querying by Metadata (PostgreSQL)

```javascript
// Find customers with high risk rating
const highRiskCustomers = await Customer.findAll({
  where: sequelize.where(
    sequelize.fn('jsonb_extract_path_text', sequelize.col('metadata'), 'rental', 'riskProfile', 'riskRating'),
    Op.eq,
    'high'
  )
});

// Find customers who have done at least 5 rentals
const activeRentalCustomers = await Customer.findAll({
  where: sequelize.where(
    sequelize.fn('jsonb_extract_path_text', sequelize.col('metadata'), 'rental', 'history', 'totalRentals')::integer,
    Op.gte,
    5
  )
});
```

---

## API Endpoints

### GET /api/customers/:id
Returns full customer with rental metadata embedded.

### PATCH /api/customers/:id/rental-metadata
Update rental-specific metadata.

**Request:**
```json
{
  "guarantor": {
    "name": "Updated Name",
    "phone": "+233201234567",
    "idType": "passport",
    "idNumber": "P1234567",
    "idExpiry": "2028-12-31"
  },
  "emergencyContact": {
    "name": "New Emergency Contact",
    "phone": "+233209999999",
    "relationship": "Brother"
  },
  "riskProfile": {
    "creditLimitForRentals": 10000.00,
    "riskNotes": "Updated after additional verification"
  },
  "preferences": {
    "preferredPaymentMethod": "card",
    "autoExtendNotification": true
  }
}
```

**Response:** Updated Customer object

---

## Validation

When creating/updating rental metadata:

```javascript
const validateRentalMetadata = (metadata) => {
  const rental = metadata?.rental;
  if (!rental) return true; // Optional

  // Phone validation
  if (rental.guarantor?.phone) {
    if (!/^\+233\d{9}$/.test(rental.guarantor.phone)) {
      throw new Error('Invalid guarantor phone format');
    }
  }

  // ID expiry date must be in future
  if (rental.guarantor?.idExpiry) {
    if (new Date(rental.guarantor.idExpiry) <= new Date()) {
      throw new Error('Guarantor ID is expired');
    }
  }

  // Credit limit must be positive
  if (rental.riskProfile?.creditLimitForRentals < 0) {
    throw new Error('Credit limit must be positive');
  }

  // Risk rating must be valid enum
  if (rental.riskProfile?.riskRating && !['low', 'medium', 'high'].includes(rental.riskProfile.riskRating)) {
    throw new Error('Invalid risk rating');
  }

  return true;
};
```

---

## Migration from Old Customer Model (If Needed)

If previously rental data was stored on Customer table directly, migrate to metadata:

```javascript
// Migration script: move old fields to metadata
async function migrateRentalDataToMetadata() {
  const customersWithRentalData = await Customer.findAll({
    where: {
      [Op.or]: [
        { guarantorName: { [Op.ne]: null } },
        { guarantorPhone: { [Op.ne]: null } }
        // Add other rental-specific fields if they exist
      ]
    }
  });

  for (const customer of customersWithRentalData) {
    customer.metadata = customer.metadata || {};
    customer.metadata.rental = {
      guarantor: {
        name: customer.guarantorName,
        phone: customer.guarantorPhone,
        idType: customer.guarantorIdType,
        idNumber: customer.guarantorIdNumber
      },
      history: customer.metadata.rental?.history || { totalRentals: 0 }
    };

    await customer.save();
  }

  console.log(`Migrated ${customersWithRentalData.length} customers`);
}
```

---

## Best Practices

1. **Initialize on First Use:** When customer is first linked to a rental, initialize `metadata.rental` structure
2. **Auto-Update History:** After each rental completes, recalculate history fields
3. **Risk Scoring:** Periodically recalculate risk rating based on history
4. **Archival:** Old guarantor/verification info can be kept in history or audit log
5. **Validation:** Always validate phone numbers, ID expiry dates, credit limits before save
6. **Documentation:** Document any custom fields added to `metadata.rental` for team reference
