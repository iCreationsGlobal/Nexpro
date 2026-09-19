const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  shopId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'shops',
      key: 'id'
    }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sku: {
    type: DataTypes.STRING
  },
  barcode: {
    type: DataTypes.STRING
  },
  description: {
    type: DataTypes.TEXT
  },
  categoryId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'product_categories',
      key: 'id'
    }
  },
  // Pricing
  costPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  sellingPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  /** Optional dealer/wholesale unit price; used when dealersAccount price resolve has no dealer/tier override. */
  wholesalePrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
    defaultValue: null
  },
  rentalRatePerDay: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
    defaultValue: null
  },
  isRentable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  isSalable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  // Stock management
  quantityOnHand: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  reorderLevel: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  reorderQuantity: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  unit: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pcs'
  },
  // Product details
  brand: {
    type: DataTypes.STRING
  },
  supplier: {
    type: DataTypes.STRING
  },
  hasVariants: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  trackStock: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Optional — only products that actually expire (food, cosmetics, pharma-like goods) set this.
  // Mirrors Drug.expiryDate/batchNumber so expiry tracking works the same way for any shop, not
  // just pharmacies.
  expiryDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  batchNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  imageUrl: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'products',
  timestamps: true,
  indexes: [
    {
      fields: ['tenantId']
    },
    {
      fields: ['shopId']
    },
    {
      fields: ['categoryId']
    },
    {
      unique: true,
      fields: ['tenantId', 'sku'],
      where: {
        sku: { [require('sequelize').Op.ne]: null }
      }
    },
    {
      fields: ['barcode']
    }
  ]
});

module.exports = Product;
