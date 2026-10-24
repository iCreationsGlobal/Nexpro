const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * One "Bring in with Lynk AI" import (services/lynkImport.js): made when an owner or manager starts it, finished
 * when Lynk sends the products. ABS only takes products for imports it started, once each, and never again after
 * Undo. Status flow: started → saving (while its products go in) → finished → undone.
 */
const LynkImport = sequelize.define('LynkImport', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  /** Lynk's id for the import. */
  importId: {
    type: DataTypes.STRING(80),
    allowNull: false,
    unique: true
  },
  /** Who started it (their stock changes are recorded as theirs). */
  startedBy: {
    type: DataTypes.UUID,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'started'
  },
  /** product.metadata.importBatchId of what it added (and lastImportUpdate.batchId of what it updated). */
  batchId: {
    type: DataTypes.STRING(80),
    allowNull: false
  },
  addedCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  updatedCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  /** What happened to the rest: { leftOut, skipped, failed, newCategories }. */
  result: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  finishedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  undoneAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'lynk_imports',
  timestamps: true,
  indexes: [
    { fields: ['tenantId', 'createdAt'] },
    { fields: ['tenantId', 'batchId'] }
  ]
});

module.exports = LynkImport;
