const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DamageReport = sequelize.define('DamageReport', {
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
  rentalItemId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'rental_items',
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
  damageType: {
    type: DataTypes.ENUM('scratch', 'dent', 'broken', 'lost', 'stained', 'other'),
    allowNull: false,
    defaultValue: 'other'
  },
  severity: {
    type: DataTypes.ENUM('minor', 'moderate', 'severe'),
    allowNull: false,
    defaultValue: 'minor'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  estimatedRepairCost: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  actualRepairCost: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  photos: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM('pending_approval', 'approved', 'rejected', 'completed'),
    allowNull: false,
    defaultValue: 'pending_approval'
  },
  expenseId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'expenses',
      key: 'id'
    }
  },
  inspectionDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  inspectionBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  approvalBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  repairNotes: {
    type: DataTypes.TEXT
  }
}, {
  timestamps: true,
  tableName: 'damage_reports',
  indexes: [
    { fields: ['rentalId'] },
    { fields: ['rentalItemId'] },
    { fields: ['productId'] },
    { fields: ['status'] }
  ]
});

module.exports = DamageReport;
