const express = require('express');
const multer = require('multer');
const { getPublicPlans } = require('../controllers/publicPricingController');
const {
  getInvoiceByToken,
  processPublicPayment,
  initializePaystackForInvoice,
  verifyPaystackReturnForPublicInvoice,
  initiateMobileMoneyForPublicInvoice,
  pollMobileMoneyForPublicInvoice
} = require('../controllers/invoiceController');
const { getQuoteByViewToken, respondToQuoteByToken } = require('../controllers/quoteController');
const {
  submitDemoBooking,
  submitFeatureRequest,
  submitSalesAgentApplication,
  getJobTrackByToken,
  lookupPublicTracking,
  getPublicTrackBranding
} = require('../controllers/publicController');
const {
  getPublicFeedbackBranding,
  submitPublicFeedback
} = require('../controllers/publicFeedbackController');
const {
  getMarketplaceHome,
  getMarketplaceFoodHome,
  getMarketplaceProductsHome,
  getMarketplaceStores,
  getMarketplaceStoreHome,
  getMarketplaceProducts,
  getMarketplaceProduct,
  getMarketplaceCategories,
  getPublicStore,
  getPublicStoreProducts,
  resolveStoreByDomain,
  listPublicStoreTemplates,
  getPublicStoreTemplate,
} = require('../controllers/storeController');
const { submitPublicRentalBookingRequest, getPublicRentalAvailability } = require('../controllers/publicRentalBookingController');
const {
  getMarketplaceStudios,
  getMarketplaceServicesHome,
  getMarketplaceServices,
  getMarketplaceServiceCategories,
  getMarketplaceStudioHome,
  getPublicStudioService,
  submitServiceRequest,
  initializeServiceBookingPaystack,
  verifyServiceBookingPaystack,
  listStorefrontServiceBookings,
  getStorefrontServiceBooking,
  listPublicServiceReviewsHandler,
  getServiceReviewEligibilityHandler,
  createOrUpdateServiceReviewHandler,
} = require('../controllers/studioStoreController');
const {
  confirmStorefrontOrderReceived,
  contactStorefrontOrderSeller,
  addStorefrontWishlistItem,
  createOrUpdateProductReview,
  createOrUpdateStoreReview,
  createStorefrontDeliveryAddress,
  createStorefrontOrder,
  initializeStorefrontOrderPaystack,
  verifyStorefrontOrderPaystack,
  deleteStorefrontDeliveryAddress,
  getProductReviewEligibility,
  getStorefrontCustomerSession,
  getStorefrontCustomerOrder,
  getStorefrontGuestOrder,
  getStorefrontWishlistStatus,
  getStoreReviewEligibility,
  googleAuthStorefrontCustomer,
  listPublicProductReviews,
  listPublicStoreReviews,
  listStorefrontCustomerOrders,
  listStorefrontDeliveryAddresses,
  listStorefrontWishlist,
  loginStorefrontCustomer,
  openStorefrontOrderDispute,
  registerStorefrontCustomer,
  removeStorefrontWishlistItem,
  requestStorefrontPasswordReset,
  removeStorefrontCustomerAvatar,
  resendStorefrontCustomerVerification,
  resetStorefrontPassword,
  setDefaultStorefrontDeliveryAddress,
  sendStorefrontLoginOtp,
  toggleStorefrontWishlistItem,
  trackStorefrontOrder,
  uploadStorefrontCustomerAvatar,
  updateStorefrontReview,
  updateStorefrontDeliveryAddress,
  updateStorefrontCustomerProfile,
  verifyStorefrontLoginOtp,
  verifyStorefrontCustomerEmail,
  previewStorefrontCheckout,
  registerStorefrontPushToken,
  unregisterStorefrontPushToken,
  getStorefrontNotificationPreferences,
  updateStorefrontNotificationPreferences,
  listStorefrontCustomerDisputes,
  getStorefrontCustomerDispute,
} = require('../controllers/storefrontCustomerController');
const { requireStorefrontCustomer, optionalStorefrontCustomer } = require('../middleware/storefrontAuth');
const { cacheMiddleware, generatePublicCacheKey } = require('../middleware/cache');
const {
  authLimiter,
  passwordResetLimiter,
  publicTrackingLookupLimiter,
  publicTrackBrandingLimiter,
  publicFeedbackSubmitLimiter,
  publicRentalBookingSubmitLimiter,
  publicRentalAvailabilityLimiter,
  guestCheckoutLimiter,
  registrationLimiter,
  marketerWriteLimiter,
} = require('../middleware/rateLimiter');

const router = express.Router();
const publicMarketplaceHomeCache = cacheMiddleware(45, generatePublicCacheKey('public-marketplace'), {
  browserMaxAge: 45,
});
const publicStoreReadCache = cacheMiddleware(45, generatePublicCacheKey('public-store'), {
  browserMaxAge: 45,
});
const STOREFRONT_AVATAR_MAX_SIZE_MB = Math.max(1, parseInt(process.env.STOREFRONT_AVATAR_MAX_SIZE_MB || '2', 10) || 2);
const STOREFRONT_AVATAR_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const storefrontAvatarUploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: STOREFRONT_AVATAR_MAX_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = STOREFRONT_AVATAR_ALLOWED_MIME_TYPES.has(file.mimetype);
    cb(allowed ? null : new Error('Avatar must be a JPG, PNG, WebP, or GIF image.'), allowed);
  },
});
const uploadStorefrontAvatarFields = (req, res, next) => {
  storefrontAvatarUploader.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ])(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `Avatar image must be ${STOREFRONT_AVATAR_MAX_SIZE_MB}MB or smaller.`,
      });
    }
    if (error) {
      return res.status(400).json({ success: false, message: error.message || 'Invalid avatar upload.' });
    }
    return next();
  });
};

router.get('/pricing', getPublicPlans);

// Demo booking from marketing site → creates admin lead (control center)
router.post('/demo-booking', submitDemoBooking);
router.post('/feature-request', publicFeedbackSubmitLimiter, submitFeatureRequest);
router.post('/sales-agent-application', publicFeedbackSubmitLimiter, submitSalesAgentApplication);
router.get('/sales-agent-codes/:code/validate', async (req, res, next) => {
  try {
    const salesAgentService = require('../services/salesAgentService');
    const result = await salesAgentService.validateAgentCode(req.params.code);
    if (!result.valid) {
      return res.status(404).json({
        success: false,
        error: result.error,
        errorCode: result.errorCode || 'AGENT_CODE_NOT_FOUND',
      });
    }
    return res.json({
      success: true,
      data: {
        code: result.code,
        agentName: result.agentName,
        freeMonths: result.freeMonths,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Public invoice routes (no authentication required)
router.get('/invoices/:token', getInvoiceByToken);
router.post('/invoices/:token/pay', processPublicPayment);
router.post('/invoices/:token/initialize-paystack', initializePaystackForInvoice);
router.post('/invoices/:token/verify-paystack', verifyPaystackReturnForPublicInvoice);
router.post('/invoices/:token/mobile-money/initiate', initiateMobileMoneyForPublicInvoice);
router.post('/invoices/:token/mobile-money/poll', pollMobileMoneyForPublicInvoice);

// Public quote view (no login – for customer "View your quote" links)
router.get('/quotes/view/:token', getQuoteByViewToken);
router.post('/quotes/view/:token/respond', respondToQuoteByToken);

// Customer job tracking (no login)
router.get('/jobs/track/:token', getJobTrackByToken);
router.get('/track/:tenantSlug/branding', publicTrackBrandingLimiter, getPublicTrackBranding);
router.post('/track/:tenantSlug/lookup', publicTrackingLookupLimiter, lookupPublicTracking);

// End-customer feedback (no login)
router.get('/feedback/branding/:tenantSlug', publicTrackBrandingLimiter, getPublicFeedbackBranding);
router.post('/feedback', publicFeedbackSubmitLimiter, submitPublicFeedback);

// Public online store (MVP catalog only)
router.get('/marketplace/home', publicMarketplaceHomeCache, getMarketplaceHome);
router.get('/marketplace/food/home', publicMarketplaceHomeCache, getMarketplaceFoodHome);
router.get('/marketplace/products/home', publicMarketplaceHomeCache, getMarketplaceProductsHome);
router.get('/marketplace/stores', getMarketplaceStores);
router.get('/marketplace/stores/:slug', publicMarketplaceHomeCache, getMarketplaceStoreHome);
router.get('/marketplace/products', getMarketplaceProducts);
router.get('/marketplace/products/:idOrSlug', getMarketplaceProduct);
router.get('/marketplace/categories', getMarketplaceCategories);
router.get('/marketplace/studios', getMarketplaceStudios);
router.get('/marketplace/studios/:slug', publicMarketplaceHomeCache, getMarketplaceStudioHome);
router.get('/marketplace/services/home', publicMarketplaceHomeCache, getMarketplaceServicesHome);
router.get('/marketplace/services', getMarketplaceServices);
router.get('/marketplace/service-categories', getMarketplaceServiceCategories);
router.get('/marketplace/studios/:slug/services/:serviceSlug', getPublicStudioService);
router.post('/storefront/service-requests', submitServiceRequest);
router.post('/storefront/service-requests/:studioSlug', submitServiceRequest);
router.post('/storefront/auth/register', registrationLimiter, registerStorefrontCustomer);
router.post('/storefront/auth/login', authLimiter, loginStorefrontCustomer);
router.post('/storefront/auth/google', authLimiter, googleAuthStorefrontCustomer);
router.post('/storefront/auth/forgot-password', passwordResetLimiter, requestStorefrontPasswordReset);
router.post('/storefront/auth/reset-password', passwordResetLimiter, resetStorefrontPassword);
router.post('/storefront/auth/send-login-otp', authLimiter, sendStorefrontLoginOtp);
router.post('/storefront/auth/verify-login-otp', authLimiter, verifyStorefrontLoginOtp);
router.post('/storefront/auth/verify-email', passwordResetLimiter, verifyStorefrontCustomerEmail);
router.post('/storefront/auth/resend-verification', passwordResetLimiter, resendStorefrontCustomerVerification);
router.get('/storefront/auth/me', requireStorefrontCustomer, getStorefrontCustomerSession);
router.patch('/storefront/auth/profile', requireStorefrontCustomer, updateStorefrontCustomerProfile);
router.put('/storefront/auth/profile', requireStorefrontCustomer, updateStorefrontCustomerProfile);
router.post('/storefront/auth/profile/avatar', requireStorefrontCustomer, uploadStorefrontAvatarFields, uploadStorefrontCustomerAvatar);
router.delete('/storefront/auth/profile/avatar', requireStorefrontCustomer, removeStorefrontCustomerAvatar);
router.get('/storefront/orders/track', publicTrackingLookupLimiter, trackStorefrontOrder);
// Checkout accepts signed-in shoppers or guests (Online Store only; enforced in the controller).
router.post('/storefront/checkout/preview', optionalStorefrontCustomer, previewStorefrontCheckout);
router.post('/storefront/orders/initialize-paystack', guestCheckoutLimiter, optionalStorefrontCustomer, initializeStorefrontOrderPaystack);
router.post('/storefront/orders/verify-paystack', optionalStorefrontCustomer, verifyStorefrontOrderPaystack);
router.get('/storefront/guest-orders/:id', publicTrackingLookupLimiter, getStorefrontGuestOrder);
router.post('/storefront/orders', requireStorefrontCustomer, createStorefrontOrder);
router.post('/storefront/services/initialize-paystack', requireStorefrontCustomer, initializeServiceBookingPaystack);
router.post('/storefront/services/verify-paystack', requireStorefrontCustomer, verifyServiceBookingPaystack);
router.get('/storefront/services/bookings', requireStorefrontCustomer, listStorefrontServiceBookings);
router.get('/storefront/services/bookings/:id', requireStorefrontCustomer, getStorefrontServiceBooking);
router.get('/storefront/orders', requireStorefrontCustomer, listStorefrontCustomerOrders);
router.get('/storefront/orders/:id', requireStorefrontCustomer, getStorefrontCustomerOrder);
router.post('/storefront/orders/:id/confirm-received', requireStorefrontCustomer, confirmStorefrontOrderReceived);
router.post('/storefront/orders/:id/disputes', requireStorefrontCustomer, openStorefrontOrderDispute);
router.post('/storefront/orders/:id/contact-seller', requireStorefrontCustomer, contactStorefrontOrderSeller);
router.get('/storefront/reviews/products/:listingId', listPublicProductReviews);
router.get('/storefront/reviews/products/:listingId/eligibility', requireStorefrontCustomer, getProductReviewEligibility);
router.post('/storefront/reviews/products/:listingId', requireStorefrontCustomer, createOrUpdateProductReview);
router.get('/storefront/reviews/stores/:storeSlug', listPublicStoreReviews);
router.get('/storefront/reviews/stores/:storeSlug/eligibility', requireStorefrontCustomer, getStoreReviewEligibility);
router.post('/storefront/reviews/stores/:storeSlug', requireStorefrontCustomer, createOrUpdateStoreReview);
router.get('/storefront/reviews/services/:listingId', listPublicServiceReviewsHandler);
router.get('/storefront/reviews/services/:listingId/eligibility', requireStorefrontCustomer, getServiceReviewEligibilityHandler);
router.post('/storefront/reviews/services/:listingId', requireStorefrontCustomer, createOrUpdateServiceReviewHandler);
router.patch('/storefront/reviews/:id', requireStorefrontCustomer, updateStorefrontReview);
router.get('/storefront/wishlist', requireStorefrontCustomer, listStorefrontWishlist);
router.post('/storefront/wishlist', requireStorefrontCustomer, addStorefrontWishlistItem);
router.post('/storefront/wishlist/toggle', requireStorefrontCustomer, toggleStorefrontWishlistItem);
router.get('/storefront/wishlist/:listingId', requireStorefrontCustomer, getStorefrontWishlistStatus);
router.delete('/storefront/wishlist/:listingId', requireStorefrontCustomer, removeStorefrontWishlistItem);
router.get('/storefront/addresses', requireStorefrontCustomer, listStorefrontDeliveryAddresses);
router.post('/storefront/addresses', requireStorefrontCustomer, createStorefrontDeliveryAddress);
router.put('/storefront/addresses/:id', requireStorefrontCustomer, updateStorefrontDeliveryAddress);
router.delete('/storefront/addresses/:id', requireStorefrontCustomer, deleteStorefrontDeliveryAddress);
router.post('/storefront/addresses/:id/default', requireStorefrontCustomer, setDefaultStorefrontDeliveryAddress);
router.post('/storefront/notifications/register', requireStorefrontCustomer, registerStorefrontPushToken);
router.delete('/storefront/notifications/register', requireStorefrontCustomer, unregisterStorefrontPushToken);
router.get('/storefront/notifications/preferences', requireStorefrontCustomer, getStorefrontNotificationPreferences);
router.patch('/storefront/notifications/preferences', requireStorefrontCustomer, updateStorefrontNotificationPreferences);
router.get('/storefront/disputes', requireStorefrontCustomer, listStorefrontCustomerDisputes);
router.get('/storefront/disputes/:id', requireStorefrontCustomer, getStorefrontCustomerDispute);
router.get('/store/:slug', publicStoreReadCache, getPublicStore);
router.get('/store/:slug/products', publicStoreReadCache, getPublicStoreProducts);
router.get('/store/:slug/rental-availability', publicRentalAvailabilityLimiter, getPublicRentalAvailability);
router.post('/store/:slug/rental-booking-request', publicRentalBookingSubmitLimiter, submitPublicRentalBookingRequest);
router.get('/store-templates', listPublicStoreTemplates);
router.get('/store-templates/:templateId', getPublicStoreTemplate);

// Sabito App Partner Program marketplace + marketer auth
const {
  listPublicSabitoPartners,
  getPublicSabitoPartner,
  registerMarketer,
  loginMarketer,
  getMarketerSession,
  updateMarketerProfile,
  applyToPartner,
  listMyApplications,
  listMyPartnerships,
  listMyEarnings,
  getMarketerDashboard,
  createMarketerReferral,
  listMyReferrals,
  getMyReferral,
  createMarketerCashout,
  listMyCashouts,
  getMyCashout,
} = require('../controllers/partnerProgramController');
const { requireMarketer } = require('../middleware/marketerAuth');

const marketerAccount = require('../controllers/marketerAccountController');
router.post('/sabito-marketer/auth/forgot-password', authLimiter, marketerAccount.forgotPassword);
router.post('/sabito-marketer/auth/reset-password', authLimiter, marketerAccount.resetPassword);
router.post('/sabito-marketer/auth/change-password', requireMarketer, marketerWriteLimiter, marketerAccount.changePassword);
router.delete('/sabito-marketer/auth/account', requireMarketer, marketerWriteLimiter, marketerAccount.closeAccount);
router.get('/sabito-partners', listPublicSabitoPartners);
router.get('/sabito-partners/:slug', getPublicSabitoPartner);
router.post('/sabito-marketer/auth/register', registrationLimiter, registerMarketer);
router.post('/sabito-marketer/auth/login', authLimiter, loginMarketer);
router.get('/sabito-marketer/auth/me', requireMarketer, getMarketerSession);
router.patch('/sabito-marketer/auth/profile', requireMarketer, updateMarketerProfile);
router.post('/sabito-marketer/applications', requireMarketer, marketerWriteLimiter, applyToPartner);
router.get('/sabito-marketer/applications', requireMarketer, listMyApplications);
router.get('/sabito-marketer/partnerships', requireMarketer, listMyPartnerships);
router.get('/sabito-marketer/earnings', requireMarketer, listMyEarnings);
router.get('/sabito-marketer/dashboard', requireMarketer, getMarketerDashboard);
router.post('/sabito-marketer/referrals', requireMarketer, marketerWriteLimiter, createMarketerReferral);
router.get('/sabito-marketer/referrals', requireMarketer, listMyReferrals);
router.get('/sabito-marketer/referrals/:id', requireMarketer, getMyReferral);
router.post('/sabito-marketer/cashouts', requireMarketer, marketerWriteLimiter, createMarketerCashout);
router.get('/sabito-marketer/cashouts', requireMarketer, listMyCashouts);
router.get('/sabito-marketer/cashouts/:id', requireMarketer, getMyCashout);

// "Online Store" custom domain resolution: storefront app calls this on boot to check
// whether the current Host is a merchant's connected custom domain (single-store mode)
// or the shared marketplace domain.
router.get('/storefront/resolve-domain', resolveStoreByDomain);

module.exports = router;

