const express = require('express');
const {
  getSettings,
  upsertSettings,
  getSetupStatus,
  checkSlugAvailability,
  getDomainSettings,
  updateDomain,
  getListings,
  createListing,
  updateListing,
  deleteListing,
  publishListing,
  unpublishListing,
  uploadListingImages,
  getStoreOrders,
  getStoreOrderStats,
  getStoreOrder,
  updateStoreOrderStatus,
  exportStoreOrders,
  getTradeAssuranceDashboard,
  getTradeAssurancePayments,
  getTradeAssuranceDisputes,
  getTradeAssurancePayouts,
  refundTradeAssuranceOrder,
} = require('../controllers/storeController');
const {
  getServiceListings,
  createServiceListing,
  updateServiceListing,
  deleteServiceListing,
  publishServiceListing,
  unpublishServiceListing,
  importServiceListingFromPricingTemplate,
  uploadServiceListingImages,
} = require('../controllers/studioStoreController');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { shopContext } = require('../middleware/shopContext');
const { studioLocationContext } = require('../middleware/studioLocationContext');
const { productImageUploader, checkStorageLimit, imageOnlyMulter } = require('../middleware/upload');
const { timeCrudAction } = require('../middleware/crudTiming');
const { listHeroLibrary } = require('../controllers/onlineStoreHeroController');

const router = express.Router();
const merchantHeroUploader = imageOnlyMulter();

router.use(protect);
router.use(tenantContext);
router.use(shopContext);
router.use(studioLocationContext);

router.route('/settings')
  .get(getSettings)
  .put(authorize('admin', 'manager'), timeCrudAction('store.settings.upsert'), upsertSettings);

router.get('/setup-status', getSetupStatus);
router.get('/slug-availability', checkSlugAvailability);
router.get('/heroes/library', listHeroLibrary);
router.post(
  '/heroes/upload',
  authorize('admin', 'manager'),
  checkStorageLimit,
  merchantHeroUploader.array('files', 5),
  async (req, res, next) => {
    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ success: false, message: 'No files uploaded' });
      }
      const path = require('path');
      const fs = require('fs');
      const { baseUploadDir, ensureDirExists } = require('../middleware/upload');
      const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
      const imageUrls = files.map((file) => {
        if (isServerless) {
          const mime = file.mimetype || 'image/jpeg';
          return `data:${mime};base64,${file.buffer.toString('base64')}`;
        }
        const tenantId = req.tenantId;
        const subDir = path.join('online-store-heroes', 'tenant-uploads', tenantId);
        const uploadPath = path.join(baseUploadDir, subDir);
        ensureDirExists(uploadPath);
        const ext = path.extname(file.originalname) || '.jpg';
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/\.[^.]+$/, '') || 'hero';
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitized}${ext}`;
        fs.writeFileSync(path.join(uploadPath, filename), file.buffer);
        return `/uploads/online-store-heroes/tenant-uploads/${tenantId}/${filename}`;
      });
      res.status(200).json({ success: true, data: { imageUrls } });
    } catch (error) {
      next(error);
    }
  }
);

// "Online Store" custom domain (customer-owned domain, independent of Sabito marketplace)
router.route('/domain')
  .get(getDomainSettings)
  .put(authorize('admin', 'manager'), updateDomain);

router.get('/orders/stats', getStoreOrderStats);
router.get('/orders/export', authorize('admin', 'manager', 'staff'), exportStoreOrders);
router.get('/trade-assurance/dashboard', authorize('admin', 'manager', 'staff'), getTradeAssuranceDashboard);
router.get('/trade-assurance/payments', authorize('admin', 'manager'), getTradeAssurancePayments);
router.get('/trade-assurance/disputes', authorize('admin', 'manager'), getTradeAssuranceDisputes);
router.get('/trade-assurance/payouts', authorize('admin', 'manager'), getTradeAssurancePayouts);
router.post('/trade-assurance/orders/:id/refund', authorize('admin', 'manager'), refundTradeAssuranceOrder);
router.route('/orders')
  .get(timeCrudAction('store.orders.list'), getStoreOrders);
router.route('/orders/:id')
  .get(timeCrudAction('store.orders.read'), getStoreOrder);
router.patch('/orders/:id/status', authorize('admin', 'manager', 'staff'), timeCrudAction('store.orders.update_status'), updateStoreOrderStatus);

router.post(
  '/listings/upload-images',
  authorize('admin', 'manager', 'staff'),
  checkStorageLimit,
  productImageUploader.array('files', 5),
  uploadListingImages
);

router.route('/listings')
  .get(timeCrudAction('store.listings.list'), getListings)
  .post(authorize('admin', 'manager', 'staff'), timeCrudAction('store.listings.create'), createListing);

router.route('/listings/:id')
  .patch(authorize('admin', 'manager', 'staff'), timeCrudAction('store.listings.update'), updateListing)
  .delete(authorize('admin', 'manager'), timeCrudAction('store.listings.delete'), deleteListing);

router.patch('/listings/:id/publish', authorize('admin', 'manager', 'staff'), timeCrudAction('store.listings.publish'), publishListing);
router.patch('/listings/:id/unpublish', authorize('admin', 'manager', 'staff'), timeCrudAction('store.listings.unpublish'), unpublishListing);

router.post(
  '/service-listings/upload-images',
  authorize('admin', 'manager', 'staff'),
  checkStorageLimit,
  productImageUploader.array('files', 5),
  uploadServiceListingImages
);

router.route('/service-listings')
  .get(timeCrudAction('store.service_listings.list'), getServiceListings)
  .post(authorize('admin', 'manager', 'staff'), timeCrudAction('store.service_listings.create'), createServiceListing);

router.route('/service-listings/:id')
  .patch(authorize('admin', 'manager', 'staff'), timeCrudAction('store.service_listings.update'), updateServiceListing)
  .delete(authorize('admin', 'manager'), timeCrudAction('store.service_listings.delete'), deleteServiceListing);

router.patch('/service-listings/:id/publish', authorize('admin', 'manager', 'staff'), timeCrudAction('store.service_listings.publish'), publishServiceListing);
router.patch('/service-listings/:id/unpublish', authorize('admin', 'manager', 'staff'), timeCrudAction('store.service_listings.unpublish'), unpublishServiceListing);
router.post(
  '/service-listings/import/pricing-template/:templateId',
  authorize('admin', 'manager', 'staff'),
  timeCrudAction('store.service_listings.import_pricing_template'),
  importServiceListingFromPricingTemplate
);

module.exports = router;
