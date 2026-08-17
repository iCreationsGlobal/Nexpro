const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Customer = sequelize.define('Customer', {
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
  studioLocationId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'studio_locations',
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
  company: {
    type: DataTypes.STRING
  },
  email: {
    type: DataTypes.STRING,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING
  },
  dateOfBirth: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  whatsappConsent: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  smsConsent: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  marketingConsent: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT
  },
  city: {
    type: DataTypes.STRING
  },
  state: {
    type: DataTypes.STRING
  },
  zipCode: {
    type: DataTypes.STRING
  },
  country: {
    type: DataTypes.STRING,
    defaultValue: 'USA'
  },
  taxId: {
    type: DataTypes.STRING
  },
  ghanaCardPin: {
    type: DataTypes.STRING,
    allowNull: true
  },
  creditLimit: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  howDidYouHear: {
    type: DataTypes.STRING,
    // Removed strict validation to allow custom values from CustomDropdownOption
    // Default/common values: 'Signboard', 'Referral', 'Social Media', 'Market Outreach'
  },
  referralName: {
    type: DataTypes.STRING
  },
  sabitoCustomerId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'sabito_customer_id'
  },
  sabitoSourceReferralId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'sabito_source_referral_id'
  },
  sabitoSourceType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'standalone',
    field: 'sabito_source_type'
    // Values: 'referral', 'direct', 'standalone'
  },
  sabitoBusinessId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'sabito_business_id'
  },
  partnerMarketerId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'marketers', key: 'id' },
  },
  partnershipId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'partnerships', key: 'id' },
  },
  balance: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  notes: {
    type: DataTypes.TEXT
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  tableName: 'customers',
  indexes: [{ fields: ['tenantId'] }],
  hooks: {
    beforeCreate: (customer) => {
      if (customer.email && typeof customer.email === 'string') {
        customer.email = customer.email.trim().toLowerCase();
      }
      if (customer.phone && typeof customer.phone === 'string') {
        try {
          const { formatToE164 } = require('../utils/phoneUtils');
          const e164 = formatToE164(customer.phone.trim());
          if (e164) customer.phone = e164;
          else customer.phone = customer.phone.trim();
        } catch { customer.phone = customer.phone.trim(); }
      }
    },
    beforeUpdate: (customer) => {
      if (customer.changed('email') && customer.email && typeof customer.email === 'string') {
        customer.email = customer.email.trim().toLowerCase();
      }
      if (customer.changed('phone') && customer.phone && typeof customer.phone === 'string') {
        try {
          const { formatToE164 } = require('../utils/phoneUtils');
          const e164 = formatToE164(customer.phone.trim());
          if (e164) customer.phone = e164;
          else customer.phone = customer.phone.trim();
        } catch { customer.phone = customer.phone.trim(); }
      }
    }
  }
});

module.exports = Customer;


