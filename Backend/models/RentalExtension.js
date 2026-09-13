const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RentalExtension = sequelize.define('RentalExtension', {
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
  previousEndDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  newEndDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  extensionDays: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  additionalCharge: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  reason: {
    type: DataTypes.TEXT
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
  tableName: 'rental_extensions',
  indexes: [
    { fields: ['rentalId'] }
  ]
});

module.exports = RentalExtension;
