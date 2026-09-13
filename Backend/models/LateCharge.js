const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LateCharge = sequelize.define('LateCharge', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  rentalId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'rentals',
      key: 'id'
    }
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  branchId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'shops',
      key: 'id'
    }
  },
  daysLate: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  chargePerDay: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  totalCharge: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'waived', 'cancelled'),
    defaultValue: 'pending'
  },
  invoiceId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'invoices',
      key: 'id'
    }
  },
  notes: {
    type: DataTypes.TEXT
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  timestamps: true,
  tableName: 'late_charges',
  indexes: [
    { fields: ['rentalId'] },
    { fields: ['customerId'] },
    { fields: ['branchId'] },
    { fields: ['status'] }
  ]
});

module.exports = LateCharge;
