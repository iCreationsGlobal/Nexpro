const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RentalItem = sequelize.define('RentalItem', {
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
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  rentalRatePerDay: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  subtotal: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  notes: {
    type: DataTypes.TEXT
  },
  rentalUnitId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'rental_units',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  tableName: 'rental_items',
  indexes: [
    { fields: ['rentalId'] },
    { fields: ['productId'] },
    { fields: ['branchId'] },
    { fields: ['rentalUnitId'] }
  ]
});

module.exports = RentalItem;
