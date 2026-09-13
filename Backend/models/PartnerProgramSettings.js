const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Per-tenant Sabito Partner Program configuration.
 * Public on Sabito App only when enabled, listed, and moderationStatus is approved.
 */
const PartnerProgramSettings = sequelize.define(
  'PartnerProgramSettings',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenantId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'tenants', key: 'id' },
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    listed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'When true and enabled, visible on Sabito marketplace',
    },
    slug: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    displayName: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    pitch: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    logoUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    location: {
      type: DataTypes.STRING(160),
      allowNull: true,
    },
    firstClientRatePercent: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      defaultValue: 10,
    },
    returningClientRatePercent: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      defaultValue: 5,
    },
    attributionMonths: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 12,
    },
    maxMarketers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    payoutNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    setupCompletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    moderationStatus: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'draft',
      comment: 'draft | pending | approved | rejected | suspended',
    },
    moderationNote: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    moderatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    moderatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'partner_program_settings',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['slug'] },
      { fields: ['enabled', 'listed'] },
      { fields: ['category'] },
      { fields: ['moderationStatus', 'enabled', 'listed'] },
    ],
  }
);

module.exports = PartnerProgramSettings;
