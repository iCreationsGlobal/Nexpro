const express = require('express');
const {
  getProducts,
  getProductStats,
  getProduct,
  getProductSales,
  adjustProductStock,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductByBarcode,
  getProductVariants,
  createProductVariant,
  updateProductVariant,
  deleteProductVariant,
  bulkCreateProducts,
  bulkUpdateProducts,
  bulkDeleteProducts,
  bulkUpdateStock,
  exportProducts,
  getProductImportTemplate,
  importProducts,
  uploadProductImage,
  getProductCategories,
  createProductCategory,
  deleteProductCategory
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { shopContext } = require('../middleware/shopContext');
const { cacheMiddleware, generateProductListKey } = require('../middleware/cache');
const { bulkOperationLimiter, exportLimiter } = require('../middleware/rateLimiter');
const { productImageUploader, importFileUploader, checkStorageLimit } = require('../middleware/upload');
const { createOrUpdateListingFromProduct } = require('../controllers/storeController');
const { timeCrudAction } = require('../middleware/crudTiming');
const {
  listProductRentalUnits,
  createProductRentalUnit,
  updateProductRentalUnit,
  deleteProductRentalUnit,
} = require('../controllers/rentalUnitController');
const { requireFeature } = require('../middleware/featureAccess');

const router = express.Router();

router.use(protect);
router.use(tenantContext);
router.use(shopContext);

// Product routes - cache list for 90s to reduce repeated heavy queries
router.route('/')
  .get(timeCrudAction('products.list'), cacheMiddleware(90, generateProductListKey), getProducts)
  .post(authorize('admin', 'manager', 'staff'), timeCrudAction('products.create'), createProduct);

router.route('/stats')
  .get(getProductStats);

// Export endpoint - must be before /:id to avoid conflict
router.route('/export')
  .get(exportLimiter, authorize('admin', 'manager'), exportProducts);

// Import template and import - must be before /:id
router.get('/import/template', exportLimiter, authorize('admin', 'manager'), getProductImportTemplate);
router.post('/import', bulkOperationLimiter, authorize('admin', 'manager'), importFileUploader.single('file'), importProducts);

// Bulk operations - must be before /:id to avoid conflict
router.route('/bulk')
  .post(bulkOperationLimiter, authorize('admin', 'manager'), timeCrudAction('products.bulk_create'), bulkCreateProducts)
  .put(bulkOperationLimiter, authorize('admin', 'manager'), timeCrudAction('products.bulk_update'), bulkUpdateProducts)
  .delete(bulkOperationLimiter, authorize('admin'), timeCrudAction('products.bulk_delete'), bulkDeleteProducts);

router.route('/bulk/stock')
  .put(bulkOperationLimiter, authorize('admin', 'manager', 'staff'), timeCrudAction('products.bulk_update_stock'), bulkUpdateStock);

router.route('/barcode/:barcode')
  .get(getProductByBarcode);

router.route('/upload-image')
  .post(
    authorize('admin', 'manager', 'staff'),
    checkStorageLimit,
    productImageUploader.single('file'),
    uploadProductImage
  );

router.route('/categories')
  .get(getProductCategories)
  .post(authorize('admin', 'manager', 'staff'), timeCrudAction('products.categories.create'), createProductCategory);

router.route('/categories/:id')
  .delete(authorize('admin', 'manager', 'staff'), timeCrudAction('products.categories.delete'), deleteProductCategory);

// Variant routes (must be before /:id to avoid conflict)
router.route('/variants/:variantId')
  .put(authorize('admin', 'manager', 'staff'), timeCrudAction('products.variants.update'), updateProductVariant)
  .delete(authorize('admin', 'manager', 'staff'), timeCrudAction('products.variants.delete'), deleteProductVariant);

// Product-specific variant routes
router.route('/:id/variants')
  .get(getProductVariants)
  .post(authorize('admin', 'manager', 'staff'), timeCrudAction('products.variants.create'), createProductVariant);

router.route('/:id/sales')
  .get(getProductSales);

router.route('/:id/adjust-stock')
  .post(authorize('admin', 'manager', 'staff'), timeCrudAction('products.adjust_stock'), adjustProductStock);

router.route('/:id/store-listing')
  .post(authorize('admin', 'manager', 'staff'), timeCrudAction('products.store_listing.upsert'), createOrUpdateListingFromProduct);

router.route('/:productId/rental-units')
  .get(requireFeature('rentals'), listProductRentalUnits)
  .post(requireFeature('rentals'), authorize('admin', 'manager', 'staff'), timeCrudAction('products.rental_units.create'), createProductRentalUnit);

router.route('/:productId/rental-units/:unitId')
  .put(requireFeature('rentals'), authorize('admin', 'manager', 'staff'), timeCrudAction('products.rental_units.update'), updateProductRentalUnit)
  .delete(requireFeature('rentals'), authorize('admin', 'manager'), timeCrudAction('products.rental_units.delete'), deleteProductRentalUnit);

router.route('/:id')
  .get(timeCrudAction('products.read'), getProduct)
  .put(authorize('admin', 'manager', 'staff'), timeCrudAction('products.update'), updateProduct)
  .delete(authorize('admin', 'manager', 'staff'), timeCrudAction('products.delete'), deleteProduct);

module.exports = router;
