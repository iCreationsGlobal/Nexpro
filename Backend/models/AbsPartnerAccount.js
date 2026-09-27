const {
  DataTypes
} = require('sequelize');
const {
  sequelize
} = require('../config/database');
module.exports = sequelize.define('AbsPartnerAccount', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  salesAgentId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  role: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'reseller'
  },
  distributorId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  passwordHash: DataTypes.TEXT,
  inviteHash: DataTypes.STRING(64),
  inviteExpiresAt: DataTypes.DATE,
  tokenVersion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  payoutDetails: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  }
}, {
  tableName: 'abs_partner_accounts',
  timestamps: true
});
