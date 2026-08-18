import { api } from './api';
import { buildScopedQueryString, withActiveShopScope } from '@/utils/shopScope';
import { MAX_INLINE_IMAGE_DATA_URL_LENGTH } from '@/utils/fileUtils';

type ProductParams = {
  page?: number;
  limit?: number;
  search?: string;
  barcode?: string;
  isActive?: boolean;
  shopId?: string;
};

export type CreateProductPayload = {
  name: string;
  sku?: string;
  barcode?: string;
  barcodeAliases?: string[];
  description?: string;
  sellingPrice: number;
  costPrice?: number;
  quantityOnHand?: number;
  reorderLevel?: number;
  unit?: string;
  isActive?: boolean;
  trackStock?: boolean;
  hasVariants?: boolean;
  shopId?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
};

const isNotFoundError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'response' in error &&
  (error as { response?: { status?: number } }).response?.status === 404;

function sanitizeProductImageUrl(imageUrl: unknown): unknown {
  if (typeof imageUrl !== 'string') return imageUrl;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:') || trimmed.length > MAX_INLINE_IMAGE_DATA_URL_LENGTH) {
    return null;
  }
  return imageUrl;
}

/** Strip inline images so Products list / cache never hold base64 on device. */
function sanitizeProductPayload<T>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  const root = payload as Record<string, unknown>;
  const list = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root)
      ? (root as unknown[])
      : null;
  if (list) {
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const product = row as Record<string, unknown>;
      product.imageUrl = sanitizeProductImageUrl(product.imageUrl);
    }
    return payload;
  }
  const entity =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  entity.imageUrl = sanitizeProductImageUrl(entity.imageUrl);
  return payload;
}

export const productService = {
  getProducts: async (params: ProductParams = {}) => {
    const query = await buildScopedQueryString(params);
    const res = await api.get(query ? `/products?${query}` : '/products');
    // Backend returns: { success: true, count: N, pagination: {...}, data: [...] }
    return sanitizeProductPayload(res.data);
  },

  getProductByBarcode: async (barcode: string) => {
    const res = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
    // Backend returns: { success: true, data: {...} }
    return res.data;
  },

  getProductByBarcodeCandidates: async (barcodes: string[]) => {
    const candidates = [...new Set(barcodes.map((barcode) => barcode.trim()).filter(Boolean))];
    let lastNotFoundError: unknown;

    for (const barcode of candidates) {
      try {
        return await productService.getProductByBarcode(barcode);
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
        lastNotFoundError = error;
      }
    }

    throw lastNotFoundError ?? new Error('Product not found');
  },

  getProductById: async (id: string) => {
    const res = await api.get(`/products/${id}`);
    // Backend returns: { success: true, data: {...} }
    return sanitizeProductPayload(res.data);
  },

  createProduct: async (data: CreateProductPayload) => {
    const { metadata, shopId, barcodeAliases, ...rest } = data;
    const scoped = await withActiveShopScope({ ...rest, shopId });
    const res = await api.post('/products', {
      unit: 'pcs',
      isActive: true,
      trackStock: true,
      costPrice: 0,
      quantityOnHand: 0,
      reorderLevel: 0,
      ...scoped,
      ...(barcodeAliases ? { barcodeAliases } : {}),
      ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
    });
    return res.data;
  },

  uploadProductImage: async (uri: string, mimeType = 'image/jpeg') => {
    const formData = new FormData();
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    formData.append('file', {
      uri,
      name: `product.${ext}`,
      type: mimeType,
    } as unknown as Blob);
    const res = await api.post('/products/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    const body = res.data as { imageUrl?: string; data?: { imageUrl?: string } };
    const imageUrl = body?.imageUrl ?? body?.data?.imageUrl;
    if (!imageUrl) {
      throw new Error('Upload succeeded but no image URL was returned');
    }
    return imageUrl;
  },

  updateProduct: async (id: string, data: {
    name?: string;
    sku?: string;
    barcode?: string;
    barcodeAliases?: string[];
    sellingPrice?: number;
    costPrice?: number;
    quantityOnHand?: number;
    isActive?: boolean;
    imageUrl?: string;
    hasVariants?: boolean;
    metadata?: Record<string, unknown>;
  }) => {
    const res = await api.put(`/products/${id}`, data);
    // Backend returns: { success: true, data: {...} }
    return res.data;
  },

  /**
   * Adjust product or variant stock and record a stock movement on the server.
   * @param id - Product id
   * @param quantity - Delta or absolute depending on mode
   * @param mode - 'delta' adds to on-hand; 'set' replaces on-hand
   * @param reason - Stored on the movement (e.g. "Receive stock")
   * @param options.variantId - Required when adjusting a variant SKU
   * @param options.type - receive | adjustment | …
   */
  adjustStock: async (
    id: string,
    quantity: number,
    mode: 'set' | 'delta' = 'set',
    reason = '',
    options: { variantId?: string; type?: string; shopId?: string } = {}
  ) => {
    const inferredType = options.type
      || (String(reason || '').toLowerCase().includes('receive') ? 'receive' : undefined);
    const res = await api.post(`/products/${id}/adjust-stock`, {
      quantity,
      mode,
      reason: reason || '',
      ...(inferredType ? { type: inferredType } : {}),
      ...(options.variantId ? { variantId: options.variantId } : {}),
      ...(options.shopId ? { shopId: options.shopId } : {}),
    });
    return res.data;
  },

  /**
   * Adjust stock for a specific variant (delta or set).
   */
  adjustVariantStock: async (
    productId: string,
    variantId: string,
    quantity: number,
    mode: 'set' | 'delta' = 'delta',
    reason = 'Receive stock',
    type = 'receive'
  ) => {
    return productService.adjustStock(productId, quantity, mode, reason, { variantId, type });
  },

  deleteProduct: async (id: string) => {
    const res = await api.delete(`/products/${id}`);
    // Backend returns: { success: true, message: '...' }
    return res.data;
  },

  getProductVariants: async (productId: string) => {
    const res = await api.get(`/products/${productId}/variants`);
    return res.data;
  },

  createProductVariant: async (productId: string, data: {
    name: string;
    sku?: string;
    barcode?: string;
    sellingPrice?: number;
    costPrice?: number;
    quantityOnHand?: number;
    attributes?: Record<string, string>;
  }) => {
    const res = await api.post(`/products/${productId}/variants`, data);
    return res.data;
  },

  updateProductVariant: async (variantId: string, data: {
    name?: string;
    sku?: string;
    barcode?: string;
    sellingPrice?: number;
    costPrice?: number;
    quantityOnHand?: number;
    attributes?: Record<string, string>;
  }) => {
    const res = await api.put(`/products/variants/${variantId}`, data);
    return res.data;
  },

  deleteProductVariant: async (variantId: string) => {
    const res = await api.delete(`/products/variants/${variantId}`);
    return res.data;
  },
};
