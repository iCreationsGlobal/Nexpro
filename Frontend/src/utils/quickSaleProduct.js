import productService from '../services/productService';

/**
 * Quick Sale rings up a custom amount for anything not in the catalog (airtime, one-off items).
 * Sale creation requires a real productId, so every quick-sale line is attached to one
 * always-active, non-stock-tracked product — auto-provisioned once per tenant via the normal
 * product endpoints, then cached locally. No backend changes; this is just product setup done
 * in code instead of by a person. Mirrors mobile/utils/quickSaleProduct.ts.
 */

const QUICK_SALE_PRODUCT_NAME = 'Quick Sale';

const cacheKey = (tenantId) => `quick_sale_product_id_${tenantId}`;

async function findExisting(tenantId) {
  const cachedId = window.localStorage.getItem(cacheKey(tenantId));
  if (cachedId) {
    try {
      const res = await productService.getProductById(cachedId);
      const product = res?.data ?? res;
      if (product?.id) {
        return { id: product.id, name: product.name || QUICK_SALE_PRODUCT_NAME };
      }
    } catch {
      // Cached id no longer resolves (deleted, wrong tenant) — fall through to search/create.
    }
  }

  const list = await productService.getProducts({ search: QUICK_SALE_PRODUCT_NAME, limit: 5 });
  const rows = list?.data ?? list ?? [];
  const found = Array.isArray(rows)
    ? rows.find((p) => (p.name || '').trim().toLowerCase() === QUICK_SALE_PRODUCT_NAME.toLowerCase())
    : null;
  return found?.id ? { id: found.id, name: found.name } : null;
}

export async function getOrCreateQuickSaleProduct(tenantId) {
  const existing = await findExisting(tenantId);
  if (existing) {
    window.localStorage.setItem(cacheKey(tenantId), existing.id);
    return existing;
  }

  const created = await productService.createProduct({
    name: QUICK_SALE_PRODUCT_NAME,
    sellingPrice: 0,
    trackStock: false,
    isActive: true,
  });
  const product = created?.data ?? created;
  window.localStorage.setItem(cacheKey(tenantId), product.id);
  return { id: product.id, name: product.name || QUICK_SALE_PRODUCT_NAME };
}
