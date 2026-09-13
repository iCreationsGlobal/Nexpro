const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Business remittance of the full marketer commission pool to ABS.
 * ABS keeps platformFeeAmount and pays marketerShareAmount to marketers.
 */
const PartnerRemittance = sequelize.define(
  'PartnerRemittance',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenantId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      comment: 'Full marketer commission remitted to ABS',
    },
    platformFeeAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    marketerShareAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'GHS',
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'paid',
      comment: 'pending | paid',
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    paidByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    recordedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    payoutReference: {
      type: DataTypes.STRING(160),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'partner_remittances',
    timestamps: true,
    indexes: [
      { fields: ['tenantId', 'status'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = PartnerRemittance;
