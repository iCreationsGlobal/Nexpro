const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const OPTIONAL_TENANT_COLUMNS = {
  trialEndsAt: 'trialEndsAt',
  billingCustomerId: 'billingCustomerId',
  paystackSubaccountCode: 'paystackSubaccountCode',
  categoriesSeeded: 'categoriesSeeded',
  accountsSeeded: 'accountsSeeded',
  equipmentCategoriesSeeded: 'equipmentCategoriesSeeded',
};

let existingTenantColumnsPromise;
const getExistingTenantColumns = async () => {
  if (!existingTenantColumnsPromise) {
    existingTenantColumnsPromise = sequelize
      .getQueryInterface()
      .describeTable('tenants')
      .then((columns) => new Set(Object.keys(columns || {})))
      .catch((error) => {
        console.warn('[Tenant] Unable to describe tenants table; assuming all columns exist:', error?.message || error);
        return null;
      });
  }
  return existingTenantColumnsPromise;
};

const stripMissingOptionalTenantColumns = async (tenant) => {
  const existingColumns = await getExistingTenantColumns();
  if (!existingColumns) return;

  for (const [attribute, columnName] of Object.entries(OPTIONAL_TENANT_COLUMNS)) {
    if (!existingColumns.has(columnName) && Object.prototype.hasOwnProperty.call(tenant.dataValues, attribute)) {
      delete tenant.dataValues[attribute];
    }
  }
};

const Tenant = sequelize.define('Tenant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING(150),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'active'
  },
  plan: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'trial'
  },
  businessType: {
    type: DataTypes.ENUM('shop', 'studio', 'pharmacy', 'printing_press', 'mechanic', 'barber', 'salon', 'rental'),
    allowNull: true,
    defaultValue: null
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  trialEndsAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  billingCustomerId: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  paystackSubaccountCode: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Paystack subaccount code (ACCT_xxx) for POS payment splits'
  },
  categoriesSeeded: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether default categories have been seeded for this tenant'
  },
  accountsSeeded: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether default chart of accounts has been seeded for this tenant'
  },
  equipmentCategoriesSeeded: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether default equipment categories have been seeded for this tenant'
  },
  referredByAgentId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Sales agent who referred this tenant (growth attribution)'
  },
  referredByAgentCode: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'Agent code used at signup for attribution audit'
  },
  agentAttributedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'tenants',
  timestamps: true,
  defaultScope: {
    attributes: {
      exclude: Object.keys(OPTIONAL_TENANT_COLUMNS),
    },
  },
  scopes: {
    withOptionalColumns: {
      attributes: { include: Object.keys(OPTIONAL_TENANT_COLUMNS) },
    },
  },
  hooks: {
    beforeCreate: async (tenant) => {
      await stripMissingOptionalTenantColumns(tenant);
    },
    beforeUpdate: async (tenant) => {
      await stripMissingOptionalTenantColumns(tenant);
    },
  },
});

module.exports = Tenant;


