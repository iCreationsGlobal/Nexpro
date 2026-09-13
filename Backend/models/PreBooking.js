const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PreBooking = sequelize.define('PreBooking', {
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
    type: DataTypes.ENUM('pending', 'confirmed', 'converted', 'expired', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending'
  },
  requestedStartDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  requestedEndDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  convertedToRentalId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'rentals',
      key: 'id'
    }
  },
  proformaInvoiceId: {
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
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  tableName: 'pre_bookings',
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['customerId'] },
    { fields: ['branchId'] },
    { fields: ['status'] },
    { fields: ['requestedStartDate', 'requestedEndDate'] }
  ]
});

module.exports = PreBooking;
