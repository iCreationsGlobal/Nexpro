const express = require('express');
const {
  register,
  login,
  getMe,
  getPublicConfig,
  googleAuth,
  appleAuth,
  updateDetails,
  updatePassword,
  setInitialPassword,
  getBootstrap,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  resendVerification,
  sabitoSSO,
  verifyNexproToken,
  checkEmailAvailability,
  updateNotificationPreferences,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter, registrationLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Apply stricter rate limiting to auth endpoints
router.post('/register', registrationLimiter, register);
router.post('/check-email', registrationLimiter, checkEmailAvailability);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleAuth);
router.post('/apple', authLimiter, appleAuth);
router.post('/sso/sabito', authLimiter, sabitoSSO);
console.log('[AUTH ROUTES] ✅ POST /api/auth/sso/sabito route registered');
// Endpoint for Sabito to verify ABS tokens (for reverse SSO)
router.get('/verify-token', verifyNexproToken);
// Public config (Google client ID etc.) – no auth
router.get('/config', getPublicConfig);
console.log('[AUTH ROUTES] ✅ GET /api/auth/config registered');
console.log('[AUTH ROUTES] ✅ POST /api/auth/check-email registered');
router.get('/bootstrap', protect, getBootstrap);
router.get('/me', protect, getMe);
router.patch('/notification-preferences', protect, updateNotificationPreferences);
router.put('/updatedetails', protect, updateDetails);
router.put('/updatepassword', protect, updatePassword);
router.put('/set-initial-password', protect, setInitialPassword);
router.post('/forgot-password', passwordResetLimiter, requestPasswordReset);
router.post('/reset-password', passwordResetLimiter, resetPassword);
router.get('/verify-email', passwordResetLimiter, verifyEmail);
router.post('/resend-verification', passwordResetLimiter, protect, resendVerification);

module.exports = router;


