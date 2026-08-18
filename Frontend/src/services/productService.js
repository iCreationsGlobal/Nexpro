/**
 * Product Service
 * 
 * API service for product operations in the POS system.
 * Provides product listing, search, barcode lookup, and variant management.
 */

import api, { postFormDataWithProgress } from './api';
import { buildScopedQueryString, withActiveShopScope } from '../utils/shopScope';

const productService = {
  // =============================================
  // CORE PRODUCT OPERATIONS
  // =============================================

  /**
   * Get all products with optional filters
   * @param {Object} params - Query parameters
   * @param {number} [params.page] - Page number
   * @param {number} [params.limit] - Items per page
   * @param {string} [params.search] - Search query
   * @param {string} [params.categoryId] - Filter by category
   * @param {boolean} [params.isActive] - Filter by active status
   * @param {string} [params.shopId] - Filter by shop
   * @param {string} [params.sort] - Sort key: name_asc | created_desc | updated_desc | stock_desc | stock_asc | price_asc | price_desc
   * @returns {Promise<Object>} - { products, pagination }
   */
  getProducts: async (params = {}) => {
    const scopedParams = withActiveShopScope(params);
    const searchParams = new URLSearchParams();
    Object.entries(scopedParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      searchParams.append(key, value);
    });
    const query = searchParams.toString();
    return api.get(query ? `/products?${query}` : '/products');
  },

  /**
   * Get aggregate product catalog stats for the active tenant/shop.
   * @param {Object} params - Query parameters
   * @param {string} [params.shopId] - Optional shop filter
   * @returns {Promise<Object>} - { total, lowStock, outOfStock, totalValue }
   */
  getProductStats: async (params = {}) => {
    const scopedParams = withActiveShopScope(params);
    const searchParams = new URLSearchParams();
    Object.entries(scopedParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      searchParams.append(key, value);
    });
    const query = searchParams.toString();
    return api.get(query ? `/products/stats?${query}` : '/products/stats');
  },

  /**
   * Get a single product by ID
   * @param {string} id - Product ID
   * @returns {Promise<Object>} - Product object
   */
  getProductById: async (id) => {
    return api.get(`/products/${id}`);
  },

  /**
   * Get sales/movement history for a product
   * @param {string} productId - Product ID
   * @param {Object} params - { page, limit }
   * @returns {Promise<Object>} - { data: saleItems[], count, pagination }
   */
  getProductSales: async (productId, params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      searchParams.append(key, value);
    });
    const query = searchParams.toString();
    return api.get(`/products/${productId}/sales${query ? `?${query}` : ''}`);
  },

  /**
   * Get product by barcode
   * @param {string} barcode - Barcode string
   * @returns {Promise<Object>} - Product object
   */
  getProductByBarcode: async (barcode) => {
    return api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
  },

  /**
   * Resolve product from parsed QR payload (product QR code JSON).
   * Tries id first (from our generated QR), then barcode, then SKU, then name.
   * @param {Object} qrData - Parsed QR data { id?, name, sku?, barcode? }
   * @returns {Promise<Object|null>} - Product or null
   */
  resolveProductFromQRPayload: async (qrData) => {
    if (!qrData || typeof qrData !== 'object') return null;
    const id = (qrData.id || '').trim();
    const barcode = (qrData.barcode || '').trim();
    const sku = (qrData.sku || '').trim();
    const name = (qrData.name || '').trim();

    if (id) {
      try {
        const res = await api.get(`/products/${encodeURIComponent(id)}`);
        const product = res?.data?.data ?? res?.data?.product ?? res?.product ?? res?.data;
        if (product?.id) return product;
      } catch (_) {}
    }

    if (barcode) {
      try {
        const res = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
        const product = res?.data?.data ?? res?.data?.product ?? res?.product ?? res?.data;
        if (product?.id) return product;
      } catch (_) {}
    }

    if (sku) {
      try {
        const res = await api.get(`/products?search=${encodeURIComponent(sku)}&limit=50`);
        const list = Array.isArray(res?.data?.data) ? res.data.data : (res?.data?.products ?? res?.products ?? []);
        const exact = list.find((p) => (p.sku || '').trim() === sku);
        if (exact?.id) return exact;
      } catch (_) {}
    }

    if (name) {
      try {
        const res = await api.get(`/products?search=${encodeURIComponent(name)}&limit=50`);
        const list = Array.isArray(res?.data?.data) ? res.data.data : (res?.data?.products ?? res?.products ?? []);
        const exact = list.find((p) => (p.name || '').trim().toLowerCase() === name.toLowerCase());
        if (exact?.id) return exact;
      } catch (_) {}
    }

    return null;
  },

  /**
   * Search products by name, SKU, or barcode
   * @param {string} query - Search query
   * @param {Object} [options] - Additional options
   * @param {number} [options.limit] - Max results (default 50)
   * @returns {Promise<Object>} - { products }
   */
  searchProducts: async (query, options = {}) => {
    const params = new URLSearchParams();
    const scoped = withActiveShopScope({
      search: query,
      limit: options.limit || 50,
      isActive: options.isActive ?? true,
      ...(options.includeVariants ? { includeVariants: true } : {}),
      ...(options.shopId ? { shopId: options.shopId } : {}),
    });
    Object.entries(scoped).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      params.append(key, value);
    });
    return api.get(`/products?${params.toString()}`);
  },

  /**
   * Get all active products for POS.
   * Do not send includeVariants/forPOS: the API then attaches variants:[] on
   * simple SKUs and older overlay code sums that to 0 (every tile Out of Stock)
   * while the Products table, which omits variants, still shows real qty.
   * Load variants on click for hasVariants products.
   * @returns {Promise<Array>} - Array of products
   */
  getAllActiveProducts: async () => {
    const params = new URLSearchParams();
    const scoped = withActiveShopScope({ isActive: true, limit: 1000 });
    Object.entries(scoped).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      params.append(key, value);
    });
    const response = await api.get(`/products?${params.toString()}`);
    // API response interceptor returns response.data, so response is already { success, data, pagination }
    const body = response && typeof response === 'object' ? response : {};
    const list = Array.isArray(body.data) ? body.data : (Array.isArray(body.products) ? body.products : []);
    return list;
  },

  /**
   * Create a new product
   * @param {Object} payload - Product data
   * @returns {Promise<Object>} - Created product
   */
  createProduct: async (payload) => {
    return api.post('/products', payload);
  },

  /**
   * Update a product
   * @param {string} id - Product ID
   * @param {Object} payload - Updated product data
   * @returns {Promise<Object>} - Updated product
   */
  updateProduct: async (id, payload) => {
    return api.put(`/products/${id}`, payload);
  },

  /**
   * Delete a product
   * @param {string} id - Product ID
   * @returns {Promise<void>}
   */
  deleteProduct: async (id) => {
    return api.delete(`/products/${id}`);
  },

  /**
   * Export products (CSV or Excel). Admin/manager only.
   * @param {Object} [params] - { format: 'csv'|'excel', categoryId, isActive }
   * @returns {Promise<Blob>} - File blob for download
   */
  exportProducts: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.format) searchParams.append('format', params.format);
    if (params.categoryId) searchParams.append('categoryId', params.categoryId);
    if (params.isActive !== undefined) searchParams.append('isActive', params.isActive);
    const query = searchParams.toString();
    const response = await api.get(`/products/export${query ? `?${query}` : ''}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Download CSV template for bulk product import (no images).
   * @returns {Promise<Blob>}
   */
  getProductImportTemplate: async () => {
    const response = await api.get('/products/import/template', { responseType: 'blob' });
    return response.data;
  },

  /**
   * Bulk import products from CSV/Excel file (no images).
   * @param {File} file - CSV or XLSX file
   * @returns {Promise<{ successCount, errorCount, errors, created }>}
   */
  importProducts: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const query = buildScopedQueryString();
    const response = await api.post(`/products/import${query ? `?${query}` : ''}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response?.data ?? response;
  },

  /**
   * Duplicate a product
   * @param {string} id - Product ID to duplicate
   * @param {Object} [overrides] - Fields to override in the duplicate
   * @returns {Promise<Object>} - Created product
   */
  duplicateProduct: async (id, overrides = {}) => {
    const response = await productService.getProductById(id);
    const original = response.data || response;
    
    // Create duplicate with overrides (imageUrl not copied; user can add new image)
    const duplicate = {
      name: `${original.name} (Copy)`,
      sku: original.sku ? `${original.sku}-COPY` : undefined,
      barcode: undefined, // Don't duplicate barcode
      description: original.description,
      categoryId: original.categoryId,
      costPrice: original.costPrice,
      sellingPrice: original.sellingPrice,
      quantityOnHand: 0, // Start with zero stock
      reorderLevel: original.reorderLevel,
      reorderQuantity: original.reorderQuantity,
      unit: original.unit,
      brand: original.brand,
      supplier: original.supplier,
      hasVariants: false, // Don't duplicate variants initially
      isActive: true,
      metadata: { ...original.metadata },
      ...overrides,
    };
    
    return productService.createProduct(duplicate);
  },

  /**
   * Upload product image
   * @param {File} file - Image file
   * @param {{ onUploadProgress?: (percent: number) => void }} [options] - 0–100 while uploading
   * @returns {Promise<{ imageUrl: string }>}
   */
  uploadProductImage: async (file, options = {}) => {
    const { onUploadProgress } = options;
    const formData = new FormData();
    formData.append('file', file);
    // XHR upload: reliable progress + correct multipart boundary (axios default JSON Content-Type breaks both).
    return postFormDataWithProgress('/products/upload-image', formData, {
      onUploadProgress,
      timeout: 120000,
    });
  },

  /**
   * Get product categories (from product_categories table, NOT inventory_categories)
   * @returns {Promise<Array>} - Array of categories
   */
  getCategories: async () => {
    const res = await api.get('/products/categories');
    console.log('[productService.getCategories] GET /products/categories (product_categories)');
    return res;
  },

  /**
   * Create a new product category
   * @param {Object} payload - Category data
   * @param {string} payload.name - Category name
   * @param {string} [payload.description] - Category description
   * @returns {Promise<Object>} - Created category
   */
  createCategory: async (payload) => {
    return api.post('/products/categories', payload);
  },

  /**
   * Delete a product category (fails if any products use it)
   * @param {string} id - Category id
   * @returns {Promise<void>}
   */
  deleteCategory: async (id) => {
    return api.delete(`/products/categories/${id}`);
  },

  // =============================================
  // PRODUCT VARIANT OPERATIONS
  // =============================================

  /**
   * Get variants for a product
   * @param {string} productId - Product ID
   * @returns {Promise<Array>} - Array of variants
   */
  getProductVariants: async (productId) => {
    return api.get(`/products/${productId}/variants`);
  },

  /**
   * Create a product variant
   * @param {string} productId - Product ID
   * @param {Object} payload - Variant data
   * @param {string} payload.name - Variant name (e.g., "Red - Large")
   * @param {string} [payload.sku] - Variant SKU
   * @param {string} [payload.barcode] - Variant barcode
   * @param {number} [payload.costPrice] - Override cost price
   * @param {number} [payload.sellingPrice] - Override selling price
   * @param {number} [payload.quantityOnHand] - Initial quantity
   * @param {Object} [payload.attributes] - Variant attributes (size, color, etc.)
   * @returns {Promise<Object>} - Created variant
   */
  createProductVariant: async (productId, payload) => {
    return api.post(`/products/${productId}/variants`, payload);
  },

  /**
   * Update a product variant
   * @param {string} variantId - Variant ID
   * @param {Object} payload - Updated variant data
   * @returns {Promise<Object>} - Updated variant
   */
  updateProductVariant: async (variantId, payload) => {
    return api.put(`/products/variants/${variantId}`, payload);
  },

  /**
   * Delete a product variant
   * @param {string} variantId - Variant ID
   * @returns {Promise<void>}
   */
  deleteProductVariant: async (variantId) => {
    return api.delete(`/products/variants/${variantId}`);
  },

  /**
   * Bulk create variants for a product (e.g., for size/color combinations)
   * @param {string} productId - Product ID
   * @param {Array} variants - Array of variant data
   * @returns {Promise<Array>} - Array of created variants
   */
  bulkCreateVariants: async (productId, variants) => {
    const results = [];
    for (const variant of variants) {
      const result = await productService.createProductVariant(productId, variant);
      results.push(result);
    }
    return results;
  },

  // =============================================
  // STOCK OPERATIONS
  // =============================================

  /**
   * Adjust product stock
   * @param {string} id - Product ID
   * @param {number} quantity - New quantity (for set) or delta (for adjust)
   * @param {string} [mode='set'] - 'set' to set exact quantity, 'delta' to add/subtract
   * @param {string} [reason] - Reason for adjustment
   * @returns {Promise<Object>} - Updated product
   */
  /**
   * Adjust stock for a product (delta or set) and record a stock movement.
   * @param {string} id
   * @param {number} quantity - Delta or absolute depending on mode
   * @param {'set'|'delta'} [mode='set']
   * @param {string} [reason='']
   * @param {Object} [options]
   * @param {string} [options.type] - receive | adjustment | …
   * @param {string} [options.variantId]
   * @returns {Promise<Object>}
   */
  adjustStock: async (id, quantity, mode = 'set', reason = '', options = {}) => {
    const { type, variantId } = options;
    const inferredType = type
      || (String(reason || '').toLowerCase().includes('receive') ? 'receive' : undefined);
    return api.post(`/products/${id}/adjust-stock`, {
      quantity,
      mode,
      reason: reason || '',
      ...(inferredType ? { type: inferredType } : {}),
      ...(variantId ? { variantId } : {}),
    });
  },

  /**
   * Adjust stock for a product variant (delta or set) and record a stock movement.
   * Parent product quantity is synced by the API.
   * @param {string} variantId
   * @param {number} quantity - Delta or absolute depending on mode
   * @param {'set'|'delta'} [mode='delta']
   * @param {Object} [currentVariant] - Optional known variant (productId used when present)
   * @param {Object} [options]
   * @param {string} [options.productId] - Required if currentVariant has no productId
   * @param {string} [options.reason]
   * @param {string} [options.type]
   * @returns {Promise<Object>}
   */
  adjustVariantStock: async (variantId, quantity, mode = 'delta', currentVariant = null, options = {}) => {
    const productId = options.productId
      || currentVariant?.productId
      || currentVariant?.product?.id;
    if (!productId) {
      throw new Error('productId is required to adjust variant stock');
    }
    const reason = options.reason ?? 'Receive stock';
    return productService.adjustStock(productId, quantity, mode, reason, {
      type: options.type || (String(reason).toLowerCase().includes('receive') ? 'receive' : undefined),
      variantId,
    });
  },

  /**
   * Create a stock transfer between two shops.
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  createStockTransfer: async (payload) => {
    return api.post('/stock-transfers', payload);
  },

  /**
   * Create bulk stock transfers for selected/all products.
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  createBulkStockTransfer: async (payload) => {
    return api.post('/stock-transfers/bulk', payload);
  },

  /**
   * List stock transfers.
   * @param {Object} [params]
   * @returns {Promise<Object>}
   */
  getStockTransfers: async (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      searchParams.append(key, value);
    });
    const query = searchParams.toString();
    return api.get(query ? `/stock-transfers?${query}` : '/stock-transfers');
  },

  // =============================================
  // BULK PRICING OPERATIONS
  // =============================================

  /**
   * Set bulk pricing tiers for a product
   * @param {string} id - Product ID
   * @param {Array} tiers - Array of pricing tiers
   * @param {number} tiers[].minQuantity - Minimum quantity for tier
   * @param {number} tiers[].maxQuantity - Maximum quantity for tier (use null for unlimited)
   * @param {number} tiers[].price - Price for this tier
   * @returns {Promise<Object>} - Updated product
   */
  setBulkPricing: async (id, tiers) => {
    const response = await productService.getProductById(id);
    const product = response.data || response;
    
    return productService.updateProduct(id, {
      metadata: {
        ...product.metadata,
        bulkPricing: tiers.sort((a, b) => a.minQuantity - b.minQuantity),
      },
    });
  },

  /**
   * Get price for a quantity (considering bulk pricing)
   * @param {Object} product - Product object
   * @param {number} quantity - Quantity to price
   * @returns {number} - Price per unit
   */
  getPriceForQuantity: (product, quantity) => {
    const bulkPricing = product.metadata?.bulkPricing;
    
    if (!bulkPricing || !Array.isArray(bulkPricing) || bulkPricing.length === 0) {
      return parseFloat(product.sellingPrice) || 0;
    }
    
    // Find applicable tier
    const tier = bulkPricing.find(t => 
      quantity >= t.minQuantity && 
      (t.maxQuantity === null || quantity <= t.maxQuantity)
    );
    
    return tier ? tier.price : (parseFloat(product.sellingPrice) || 0);
  },
};

export default productService;
