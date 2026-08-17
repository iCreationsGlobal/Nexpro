const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Per-shop stock balance for a shared catalog product (or variant).
 * Source of truth for quantity at a location; products.quantityOnHand remains a denormalized cache.
 */
const ProductShopStock = sequelize.define('ProductShopStock', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id',
    },
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id',
    },
  },
  productVariantId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'product_variants',
      key: 'id',
    },
  },
  shopId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'shops',
      key: 'id',
    },
  },
  quantityOnHand: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'product_shop_stocks',
  timestamps: true,
  indexes: [
    { fields: ['tenantId', 'shopId'] },
    { fields: ['productId'] },
    { fields: ['productVariantId'] },
  ],
});

module.exports = ProductShopStock;
