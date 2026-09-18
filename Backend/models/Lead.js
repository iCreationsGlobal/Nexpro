const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Lead = sequelize.define('Lead', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: true, // Allow NULL for admin leads
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
  source: {
    type: DataTypes.STRING,
    defaultValue: 'unknown'
  },
  status: {
    type: DataTypes.ENUM('new', 'contacted', 'qualified', 'lost', 'converted'),
    defaultValue: 'new'
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    defaultValue: 'medium'
  },
  assignedTo: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  createdBy: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  nextFollowUp: {
    type: DataTypes.DATE
  },
  lastContactedAt: {
    type: DataTypes.DATE
  },
  notes: {
    type: DataTypes.TEXT
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  convertedCustomerId: {
    type: DataTypes.UUID,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  convertedJobId: {
    type: DataTypes.UUID,
    references: {
      model: 'jobs',
      key: 'id'
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  doNotContact: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'leads',
  timestamps: true,
  hooks: {
    beforeValidate: (lead) => {
      if (lead.email === '' || (typeof lead.email === 'string' && !lead.email.trim())) {
        lead.email = null;
      }
    },
    beforeCreate: (lead) => {
      if (lead.email && typeof lead.email === 'string') {
        lead.email = lead.email.trim().toLowerCase();
      }
      if (lead.phone && typeof lead.phone === 'string') {
        try {
          const { formatToE164 } = require('../utils/phoneUtils');
          const e164 = formatToE164(lead.phone.trim());
          if (e164) lead.phone = e164;
          else lead.phone = lead.phone.trim();
        } catch { lead.phone = lead.phone.trim(); }
      }
    },
    beforeUpdate: (lead) => {
      if (lead.changed('email') && lead.email && typeof lead.email === 'string') {
        lead.email = lead.email.trim().toLowerCase();
      }
      if (lead.changed('phone') && lead.phone && typeof lead.phone === 'string') {
        try {
          const { formatToE164 } = require('../utils/phoneUtils');
          const e164 = formatToE164(lead.phone.trim());
          if (e164) lead.phone = e164;
          else lead.phone = lead.phone.trim();
        } catch { lead.phone = lead.phone.trim(); }
      }
    }
  }
});

module.exports = Lead;






