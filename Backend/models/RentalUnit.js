const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RentalUnit = sequelize.define('RentalUnit', {
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
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'products',
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
  serialNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Serial number, VIN, or other unique unit identifier'
  },
  status: {
    type: DataTypes.ENUM('available', 'rented', 'maintenance', 'retired'),
    allowNull: false,
    defaultValue: 'available'
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
  tableName: 'rental_units',
  indexes: [
    { fields: ['tenantId'] },
    { fields: ['productId'] },
    { fields: ['branchId'] },
    { fields: ['status'] },
    {
      unique: true,
      fields: ['tenantId', 'productId', 'serialNumber'],
      name: 'rental_units_tenant_product_serial_unique'
    }
  ]
});

module.exports = RentalUnit;
