const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const OPTIONAL_USER_COLUMNS = {
  profilePicture: 'profilePicture',
  isFirstLogin: 'isFirstLogin',
  lastLogin: 'lastLogin',
  sabitoUserId: 'sabito_user_id',
  googleId: 'google_id',
  appleId: 'apple_id',
  failedLoginAttempts: 'failed_login_attempts',
  lockoutUntil: 'lockout_until',
  emailVerifiedAt: 'email_verified_at',
  notificationPreferences: 'notificationPreferences',
};

let existingUserColumnsPromise;
const getExistingUserColumns = async () => {
  if (!existingUserColumnsPromise) {
    existingUserColumnsPromise = sequelize
      .getQueryInterface()
      .describeTable('users')
      .then((columns) => new Set(Object.keys(columns || {})))
      .catch((error) => {
        console.warn('[User] Unable to describe users table; assuming all columns exist:', error?.message || error);
        return null;
      });
  }
  return existingUserColumnsPromise;
};

const stripMissingOptionalColumns = async (user) => {
  const existingColumns = await getExistingUserColumns();
  if (!existingColumns) return;

  for (const [attribute, columnName] of Object.entries(OPTIONAL_USER_COLUMNS)) {
    if (!existingColumns.has(columnName) && Object.prototype.hasOwnProperty.call(user.dataValues, attribute)) {
      delete user.dataValues[attribute];
    }
  }
};

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'manager', 'staff', 'driver'),
    defaultValue: 'staff'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  profilePicture: {
    type: DataTypes.TEXT, // TEXT for base64 image data
    allowNull: true
  },
  isFirstLogin: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isPlatformAdmin: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  sabitoUserId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    field: 'sabito_user_id'
  },
  googleId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    field: 'google_id'
  },
  appleId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    field: 'apple_id'
  },
  failedLoginAttempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'failed_login_attempts'
  },
  lockoutUntil: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'lockout_until'
  },
  emailVerifiedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'email_verified_at'
  },
  notificationPreferences: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null
  }
}, {
  timestamps: true,
  tableName: 'users',
  defaultScope: {
    attributes: {
      exclude: Object.keys(OPTIONAL_USER_COLUMNS),
    },
  },
  scopes: {
    withGoogleId: {
      attributes: { include: ['googleId'] },
    },
    withSecurityFields: {
      attributes: { include: ['failedLoginAttempts', 'lockoutUntil'] },
    },
    withEmailVerification: {
      attributes: { include: ['emailVerifiedAt'] },
    },
  },
  hooks: {
    beforeCreate: async (user) => {
      await stripMissingOptionalColumns(user);
      if (user.email && typeof user.email === 'string') {
        user.email = user.email.trim().toLowerCase();
      }
      if (user.password) {
        const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
        const salt = await bcrypt.genSalt(rounds);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      await stripMissingOptionalColumns(user);
      if (user.changed('email') && user.email && typeof user.email === 'string') {
        user.email = user.email.trim().toLowerCase();
      }
      if (user.changed('password') && user.password) {
        const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
        const salt = await bcrypt.genSalt(rounds);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Check if the account is currently locked
 * @returns {boolean}
 */
User.prototype.isLocked = function() {
  if (!this.lockoutUntil) return false;
  return new Date(this.lockoutUntil) > new Date();
};

/**
 * Get remaining lockout time in seconds
 * @returns {number}
 */
User.prototype.getLockoutRemainingSeconds = function() {
  if (!this.lockoutUntil) return 0;
  const remaining = new Date(this.lockoutUntil) - new Date();
  return Math.max(0, Math.ceil(remaining / 1000));
};

/**
 * Increment failed login attempts and lock account if threshold reached
 * @param {number} maxAttempts - Maximum attempts before lockout (default: 5)
 * @param {number} lockoutMinutes - Lockout duration in minutes (default: 15)
 */
User.prototype.incrementFailedAttempts = async function(maxAttempts = 5, lockoutMinutes = 15) {
  const attempts = (this.failedLoginAttempts || 0) + 1;
  
  const updates = {
    failedLoginAttempts: attempts,
  };
  
  // Lock account if threshold reached
  if (attempts >= maxAttempts) {
    updates.lockoutUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
  }
  
  try {
    await this.update(updates);
    return attempts;
  } catch (error) {
    // Backward compatibility: some demo databases may not have lockout columns yet.
    if (error?.original?.code === '42703' || /failed_login_attempts|lockout_until/i.test(error?.message || '')) {
      console.warn('[User] Lockout columns missing; skipping failed-attempt persistence');
      return 0;
    }
    throw error;
  }
};

/**
 * Reset failed login attempts after successful login
 */
User.prototype.resetFailedAttempts = async function() {
  try {
    await this.update({
      failedLoginAttempts: 0,
      lockoutUntil: null,
      lastLogin: new Date(),
    });
  } catch (error) {
    if (error?.original?.code === '42703' || /failed_login_attempts|lockout_until/i.test(error?.message || '')) {
      console.warn('[User] Lockout columns missing; updating lastLogin only');
      try {
        await this.update({ lastLogin: new Date() });
      } catch (innerError) {
        console.warn('[User] lastLogin update skipped:', innerError?.message || innerError);
      }
      return;
    }
    throw error;
  }
};

User.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  // Also hide lockout info from JSON output
  delete values.failedLoginAttempts;
  delete values.lockoutUntil;
  return values;
};

module.exports = User;


