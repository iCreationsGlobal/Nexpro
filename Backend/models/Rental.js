const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Rental = sequelize.define('Rental', {
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
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'active', 'returned', 'completed', 'overdue', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'Lifecycle: pending→confirmed/active→active→overdue→returned→completed; cancelled from pending/confirmed/active'
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  actualReturnDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  rentalDurationDays: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'mobile_money', 'card', 'bank_transfer', 'credit', 'other'),
    defaultValue: 'cash'
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  discountAmount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  amountPaid: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  totalDue: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  notes: {
    type: DataTypes.TEXT
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  tableName: 'rentals',
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['customerId'] },
    { fields: ['branchId'] },
    { fields: ['status'] },
    { fields: ['startDate', 'endDate'] }
  ]
});

module.exports = Rental;
