const { findUserWithLockout } = require('../utils/userLockout');

/** Validate ABS credentials without issuing a dashboard token or granting business access. */
const authenticateAbsShopper = async (email, password) => {
  const user = await findUserWithLockout({ email });
  if (!user) return { user: null };

  const locked = () => ({
    status: 423,
    errorCode: 'ABS_ACCOUNT_LOCKED',
    message: 'Your ABS account is temporarily locked. Please try again later.',
  });
  if (user.isLocked()) return locked();
  if (!(await user.comparePassword(password))) {
    // Use the same persisted lockout counter and defaults as ABS sign-in.
    await user.incrementFailedAttempts();
    return user.isLocked() ? locked() : { user: null };
  }
  if (user.isActive !== true) {
    return { status: 401, errorCode: 'ABS_ACCOUNT_INACTIVE', message: 'Your ABS account is inactive.' };
  }
  // Not resetFailedAttempts: shopping is not an ABS login, so lastLogin stays as it was.
  await user.clearLockout();
  return { user };
};

module.exports = { authenticateAbsShopper };
