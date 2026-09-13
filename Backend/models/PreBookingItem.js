const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PreBookingItem = sequelize.define('PreBookingItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  preBookingId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'pre_bookings',
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
  requestedRatePerDay: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  }
}, {
  timestamps: true,
  tableName: 'pre_booking_items',
  indexes: [
    { fields: ['preBookingId'] },
    { fields: ['productId'] },
    { fields: ['branchId'] }
  ]
});

module.exports = PreBookingItem;
