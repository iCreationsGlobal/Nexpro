const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { sequelize } = require('../config/database');

const createRentalModule = async () => {
  console.log('🚀 Starting rental module schema creation...');

  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS rentals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "customerId" UUID NOT NULL REFERENCES customers(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "branchId" UUID REFERENCES shops(id) ON UPDATE CASCADE ON DELETE SET NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        "startDate" DATE NOT NULL,
        "endDate" DATE NOT NULL,
        "actualReturnDate" DATE,
        "rentalDurationDays" INTEGER NOT NULL DEFAULT 0,
        "paymentMethod" VARCHAR(30) DEFAULT 'cash',
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "totalDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdBy" UUID REFERENCES users(id),
        "updatedBy" UUID REFERENCES users(id),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS rental_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "rentalId" UUID NOT NULL REFERENCES rentals(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "productId" UUID NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "branchId" UUID REFERENCES shops(id) ON UPDATE CASCADE ON DELETE SET NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        "rentalRatePerDay" DECIMAL(12,2) NOT NULL DEFAULT 0,
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS pre_bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "customerId" UUID NOT NULL REFERENCES customers(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "branchId" UUID REFERENCES shops(id) ON UPDATE CASCADE ON DELETE SET NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        "requestedStartDate" DATE NOT NULL,
        "requestedEndDate" DATE NOT NULL,
        "convertedToRentalId" UUID REFERENCES rentals(id),
        "proformaInvoiceId" UUID REFERENCES invoices(id),
        notes TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdBy" UUID REFERENCES users(id),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS pre_booking_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "preBookingId" UUID NOT NULL REFERENCES pre_bookings(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "productId" UUID NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "branchId" UUID REFERENCES shops(id) ON UPDATE CASCADE ON DELETE SET NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        "requestedRatePerDay" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS damage_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "rentalId" UUID NOT NULL REFERENCES rentals(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "rentalItemId" UUID NOT NULL REFERENCES rental_items(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "productId" UUID NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "damageType" VARCHAR(30) NOT NULL DEFAULT 'other',
        severity VARCHAR(20) NOT NULL DEFAULT 'minor',
        description TEXT,
        "estimatedRepairCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "actualRepairCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
        photos JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(30) NOT NULL DEFAULT 'pending_approval',
        "expenseId" UUID REFERENCES expenses(id),
        "inspectionDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "inspectionBy" UUID REFERENCES users(id),
        "approvalBy" UUID REFERENCES users(id),
        "repairNotes" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS rental_extensions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "rentalId" UUID NOT NULL REFERENCES rentals(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "previousEndDate" DATE NOT NULL,
        "newEndDate" DATE NOT NULL,
        "extensionDays" INTEGER NOT NULL DEFAULT 0,
        "additionalCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
        reason TEXT,
        "createdBy" UUID REFERENCES users(id),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS late_charges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "rentalId" UUID NOT NULL REFERENCES rentals(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "customerId" UUID NOT NULL REFERENCES customers(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "branchId" UUID REFERENCES shops(id) ON UPDATE CASCADE ON DELETE SET NULL,
        "daysLate" INTEGER NOT NULL DEFAULT 0,
        "chargePerDay" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "totalCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        "invoiceId" UUID REFERENCES invoices(id),
        notes TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'isRentable'
        ) THEN
          ALTER TABLE products ADD COLUMN "isRentable" BOOLEAN NOT NULL DEFAULT false;
        END IF;
      END $$;
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'isSalable'
        ) THEN
          ALTER TABLE products ADD COLUMN "isSalable" BOOLEAN NOT NULL DEFAULT true;
        END IF;
      END $$;
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'rentalRatePerDay'
        ) THEN
          ALTER TABLE products ADD COLUMN "rentalRatePerDay" DECIMAL(12,2) DEFAULT 0;
        END IF;
      END $$;
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'expenses' AND column_name = 'damageReportId'
        ) THEN
          ALTER TABLE expenses ADD COLUMN "damageReportId" UUID REFERENCES damage_reports(id) ON UPDATE CASCADE ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS rentals_tenant_status_idx ON rentals ("tenantId", status);
      CREATE INDEX IF NOT EXISTS rentals_customer_idx ON rentals ("customerId");
      CREATE INDEX IF NOT EXISTS rentals_branch_dates_idx ON rentals ("branchId", "startDate", "endDate");
      CREATE INDEX IF NOT EXISTS pre_bookings_tenant_status_idx ON pre_bookings ("tenantId", status);
      CREATE INDEX IF NOT EXISTS damage_reports_rental_idx ON damage_reports ("rentalId");
      CREATE INDEX IF NOT EXISTS rental_items_product_idx ON rental_items ("productId");
      CREATE INDEX IF NOT EXISTS late_charges_status_idx ON late_charges (status);
    `);

    console.log('✅ Rental module schema created successfully.');
  } catch (error) {
    console.error('💥 Rental module migration failed:', error);
    throw error;
  }
};

if (require.main === module) {
  createRentalModule()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createRentalModule;
