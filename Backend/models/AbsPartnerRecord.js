const {
  DataTypes
} = require('sequelize');
const {
  sequelize
} = require('../config/database');
// Partner-owned leads, support conversations and payout requests share a scoped workflow ledger.
module.exports = sequelize.define('AbsPartnerRecord', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  partnerId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  kind: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false
  },
  details: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  history: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  }
}, {
  tableName: 'abs_partner_records',
  timestamps: true
});
