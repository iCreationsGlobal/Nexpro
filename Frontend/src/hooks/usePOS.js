/**
 * Online-only POS helpers: product lookup, sale processing, quick-add grid.
 */
import { useCallback } from 'react';
import productService from '../services/productService';
import saleService from '../services/saleService';
import { getQuickItems, setQuickItem, removeQuickItem } from '../utils/posDb';
import { requireOnline } from '../utils/onlineRequired';
import { useOnlineStatus } from './useOnlineStatus';
import { getCatalogUnitPrice } from '../utils/productStock';

/**
 * @returns {Object} POS functions and online status
 */
export const usePOS = () => {
  const { isOnline } = useOnlineStatus();

  const searchProducts = useCallback(async (query) => {
    requireOnline();
    const response = await productService.searchProducts(query);
    const body = response && typeof response === 'object' ? response : {};
    return Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.products)
        ? body.products
        : [];
  }, []);

  const getProductByBarcode = useCallback(async (barcode) => {
    requireOnline();
    const response = await productService.getProductByBarcode(barcode);
    const product =
      response.data?.data ?? response.data?.product ?? response.product ?? response.data;
    return product?.id ? product : null;
  }, []);

  const resolveProductFromQRPayload = useCallback(async (qrData) => {
    requireOnline();
    return productService.resolveProductFromQRPayload(qrData);
  }, []);

  const processSale = useCallback(async (saleData) => {
    requireOnline();
    const response = await saleService.createSale(saleData);
    const sale = response?.data ?? response?.sale ?? response;
    return {
      success: true,
      sale: sale && typeof sale === 'object' && (sale.id || sale.saleNumber) ? sale : null,
      isQueued: false,
    };
  }, []);

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
