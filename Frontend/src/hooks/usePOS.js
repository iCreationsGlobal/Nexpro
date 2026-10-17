/**
 * POS helpers: product lookup, sale processing, quick-add grid.
 * Desktop checkout is online-only. Phones and tablets (app shell) keep selling without a connection:
 * sales are saved on the device and synced later (services/offlineSalesQueue).
 */
import { useCallback } from 'react';
import productService from '../services/productService';
import saleService from '../services/saleService';
import { newSaleClientId, queueSale } from '../services/offlineSalesQueue';
import { getQuickItems, setQuickItem, removeQuickItem } from '../utils/posDb';
import { isNavigatorOnline, requireOnline } from '../utils/onlineRequired';
import { useOnlineStatus } from './useOnlineStatus';
import { useDeviceMode } from './useDeviceMode';
import { useAuth } from '../context/AuthContext';
import { getCatalogUnitPrice } from '../utils/productStock';

/** The request never got an answer (offline, dropped connection, timeout). */
const isNoResponseError = (error) => Boolean(error) && !error.response && error.code !== 'ERR_CANCELED';

/**
 * @returns {Object} POS functions and online status
 */
export const usePOS = () => {
  const { isOnline } = useOnlineStatus();
  const { isAppShell } = useDeviceMode();
  const { activeTenantId, user } = useAuth();
  const canSellOffline = isAppShell && Boolean(activeTenantId && user?.id);

  const searchProducts = useCallback(async (query) => {
    requireOnline();
    const response = await productService.searchProducts(query, { includeVariants: false });
    const body = response && typeof response === 'object' ? response : {};
    return Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.products)
        ? body.products
        : [];
  }, []);

  const getProductByBarcode = useCallback(async (barcode) => {
    requireOnline();
    console.info('[POS Scan] Looking up product by barcode:', barcode);
    try {
      const response = await productService.getProductByBarcode(barcode);
      const product =
        response.data?.data ?? response.data?.product ?? response.product ?? response.data;
      const resolved = product?.id ? product : null;
      console.info('[POS Scan] Barcode lookup response:', {
        barcode,
        found: Boolean(resolved),
        productId: resolved?.id,
        name: resolved?.name,
        hasSelectedVariant: Boolean(resolved?.selectedVariant?.id),
      });
      return resolved;
    } catch (error) {
      console.error('[POS Scan] Barcode lookup failed:', {
        barcode,
        status: error?.response?.status,
        message: error?.response?.data?.message || error?.message,
      });
      throw error;
    }
  }, []);

  const resolveProductFromQRPayload = useCallback(async (qrData) => {
    requireOnline();
    return productService.resolveProductFromQRPayload(qrData);
  }, []);

  /**
   * @param {object} saleData - POST /sales body
   * @param {{ allowOffline?: boolean, total?: number }} [options] - allowOffline: false for sales that
   *   need the server right away (mobile money prompt, dealer credit)
   */
  const processSale = useCallback(async (saleData, { allowOffline = true, total = 0 } = {}) => {
    const mayQueue = canSellOffline && allowOffline;
    if (!mayQueue) {
      requireOnline();
      const response = await saleService.createSale(saleData);
      const sale = response?.data ?? response?.sale ?? response;
      return {
        success: true,
        sale: sale && typeof sale === 'object' && (sale.id || sale.saleNumber) ? sale : null,
        isQueued: false,
      };
    }

    // Same id online and offline, so a sale the server already got is not recorded twice on sync.
    const payload = { ...saleData, clientId: saleData.clientId || newSaleClientId() };
    const saveOnDevice = () => {
      const entry = queueSale(payload, { tenantId: activeTenantId, userId: user.id, total });
      return { success: true, sale: null, isQueued: true, localId: entry.clientId };
    };

    if (!isNavigatorOnline()) return saveOnDevice();
    try {
      const response = await saleService.createSale(payload);
      const sale = response?.data ?? response?.sale ?? response;
      return {
        success: true,
        sale: sale && typeof sale === 'object' && (sale.id || sale.saleNumber) ? sale : null,
        isQueued: false,
      };
    } catch (error) {
      if (isNoResponseError(error)) return saveOnDevice();
      throw error;
    }
  }, [canSellOffline, activeTenantId, user?.id]);

  const getQuickAddItems = useCallback(async () => getQuickItems(), []);

  const addQuickItem = useCallback(async (product, position) => {
    await setQuickItem({
      productId: product.id,
      position,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        sellingPrice: getCatalogUnitPrice(product),
        barcode: product.barcode,
      },
    });
  }, []);

  const removeQuickAddItem = useCallback(async (productId) => {
    await removeQuickItem(productId);
  }, []);

  return {
    isOnline,
    canSellOffline,
    searchProducts,
    getProductByBarcode,
    resolveProductFromQRPayload,
    processSale,
    getQuickAddItems,
    addQuickItem,
    removeQuickAddItem,
  };
};

export default usePOS;
