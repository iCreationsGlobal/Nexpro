const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const crypto = require('crypto');

const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  studioLocationId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'studio_locations',
      key: 'id'
    }
  },
  shopId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'shops',
      key: 'id'
    }
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: false
    // Unique per tenant via migration idx_invoices_tenant_invoice_number
  },
  jobId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'jobs',
      key: 'id'
    }
  },
  quoteId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'quotes',
      key: 'id'
    }
  },
  saleId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'sales',
      key: 'id'
    }
  },
  prescriptionId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'prescriptions',
      key: 'id'
    }
  },
  sourceType: {
    type: DataTypes.ENUM('job', 'sale', 'prescription', 'quote'),
    allowNull: false,
    defaultValue: 'job'
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  invoiceDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  taxRate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    comment: 'Tax rate in percentage (e.g., 12.5 for 12.5%)'
  },
  taxAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discountType: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    defaultValue: 'fixed'
  },
  discountValue: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discountAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discountReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Reason or description for the discount'
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  amountPaid: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  balance: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled'),
    defaultValue: 'draft'
  },
  paymentTerms: {
    type: DataTypes.STRING,
    defaultValue: 'Due on Receipt',
    comment: 'e.g., "Net 30", "Due on Receipt", "Net 15"'
  },
  items: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: 'Line items from the job'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  notes: {
    type: DataTypes.TEXT
  },
  termsAndConditions: {
    type: DataTypes.TEXT
  },
  sentDate: {
    type: DataTypes.DATE,
    comment: 'Date when invoice was sent to customer'
  },
  paidDate: {
    type: DataTypes.DATE,
    comment: 'Date when invoice was fully paid'
  },
  sabitoProjectId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'sabito_project_id'
  },
  sabitoSyncedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'sabito_synced_at'
  },
  sabitoSyncStatus: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'pending',
    field: 'sabito_sync_status'
    // Values: 'pending', 'synced', 'failed', 'skipped'
  },
  sabitoSyncError: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'sabito_sync_error'
  },
  paymentToken: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  }
}, {
  timestamps: true,
  tableName: 'invoices',
  hooks: {
    beforeCreate: (invoice) => {
      // Generate payment token if not provided
      if (!invoice.paymentToken) {
        invoice.paymentToken = crypto.randomBytes(32).toString('hex');
      }
    },
    beforeSave: (invoice) => {
      // Generate payment token if not provided (for existing invoices)
      if (!invoice.paymentToken) {
        invoice.paymentToken = crypto.randomBytes(32).toString('hex');
      }
      
      // Discount before tax: taxable base = subtotal - discount, then tax, then total
      if (invoice.discountType === 'percentage') {
        invoice.discountAmount = (parseFloat(invoice.subtotal) * parseFloat(invoice.discountValue || 0)) / 100;
      } else {
        invoice.discountAmount = parseFloat(invoice.discountValue || 0);
      }
      const taxableBase = Math.max(
        0,
        parseFloat(invoice.subtotal) - parseFloat(invoice.discountAmount || 0)
      );
      invoice.taxAmount = (taxableBase * parseFloat(invoice.taxRate || 0)) / 100;
      invoice.totalAmount = taxableBase + parseFloat(invoice.taxAmount);
      
      // Calculate balance
      const total = parseFloat(invoice.totalAmount) || 0;
      const paid = parseFloat(invoice.amountPaid) || 0;
      invoice.balance = Math.max(0, total - paid);

      // Tolerance for "fully paid" (rounding: totalAmount can differ slightly from sum of parts)
      const PAID_TOLERANCE = 0.01;
      const isFullyPaid = paid > 0 && (invoice.balance <= PAID_TOLERANCE || paid >= total - PAID_TOLERANCE);

      // Preserve cancelled as a terminal state; payment-derived status should not revive it.
      if (invoice.status === 'cancelled') {
        return;
      }

      // Update status based on payment
      if (isFullyPaid) {
        invoice.status = 'paid';
        invoice.balance = 0;
        if (!invoice.paidDate) {
          invoice.paidDate = new Date();
        }
      } else if (invoice.amountPaid > 0 && invoice.balance > 0) {
        invoice.status = 'partial';
      } else if (invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status !== 'paid' && invoice.status !== 'cancelled') {
        invoice.status = 'overdue';
      }
    }
  }
});

module.exports = Invoice;







