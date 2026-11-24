const { User } = require('../models');

/**
 * Find a user with the lockout fields, which User's default scope leaves out.
 * Password sign-in must load the user this way, or a lock is never seen and attempts never add up.
 */
const findUserWithLockout = async (where) => {
  try {
    return await User.findOne({ where, attributes: { include: ['failedLoginAttempts', 'lockoutUntil'] } });
  } catch (error) {
    // Same allowance as User.incrementFailedAttempts: some demo databases lack the lockout columns.
    if (error?.original?.code !== '42703') throw error;
    return User.findOne({ where });
  }
};

module.exports = { findUserWithLockout };
