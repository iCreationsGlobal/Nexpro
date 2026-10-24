/**
 * Product photos from Lynk AI's import (Lynk Product Import's photo step): each product in Lynk's finished message
 * may carry `photos: [{ url }]` (or plain addresses), the first being its main photo. ABS keeps its own copy of each,
 * as when a photo is uploaded (uploads/products/<tenant>/, or inline where there's no disk), so it never depends on
 * Lynk to show them: slot A is the product's photo, B–E its online store photos.
 *
 * Only https addresses on Lynk's own host (LYNK_URL) or the storage hosts Lynk names (LYNK_PHOTO_HOSTS, comma
 * separated) are fetched; at most 8 MB each, images only. A photo that fails never fails the import.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Product } = require('../models');
const { baseUploadDir, ensureDirExists } = require('../middleware/upload');

const MAX_BYTES = 8 * 1024 * 1024;
const SLOTS = ['A', 'B', 'C', 'D', 'E'];
const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function allowedHosts() {
  const hosts = new Set(String(process.env.LYNK_PHOTO_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
  try { hosts.add(new URL(process.env.LYNK_URL || 'https://www.lynkinfra.com').hostname.toLowerCase()); } catch { /* no Lynk address */ }
  return hosts;
}

/** The photo addresses in one of Lynk's products, at most five, only from Lynk. */
function photosOf(product) {
  const hosts = allowedHosts();
  const raw = Array.isArray(product?.photos) ? product.photos : [];
  return raw
    .map((p) => (typeof p === 'string' ? p : p?.url))
    .filter((u) => {
      if (typeof u !== 'string') return false;
      try {
        const url = new URL(u);
        return url.protocol === 'https:' && hosts.has(url.hostname.toLowerCase());
      } catch {
        return false;
      }
    })
    .slice(0, SLOTS.length);
}

/** Fetches one photo and keeps ABS's own copy; its ABS address (or an inline image where there's no disk). */
async function keepPhoto(tenantId, url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Lynk answered ${res.status}`);
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES[type]) throw new Error('Not a photo');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 64 || bytes.length > MAX_BYTES) throw new Error('The photo is too small or too big');
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return `data:${type};base64,${bytes.toString('base64')}`;
  const dir = path.join(baseUploadDir, 'products', String(tenantId));
  ensureDirExists(dir);
  const filename = `${Date.now()}-lynk-${crypto.randomBytes(4).toString('hex')}${TYPES[type]}`;
  fs.writeFileSync(path.join(dir, filename), bytes);
  return `/uploads/products/${tenantId}/${filename}`;
}

/**
 * Puts Lynk's photos on the products an import added or updated: the first on the product, the rest as its store
 * photos. Returns the products whose photos couldn't be kept, with why.
 * @param {{ tenantId: string, products: Array<{ id: string, name: string, photos: string[] }> }} args
 */
async function savePhotos({ tenantId, products }, deps = {}) {
  const failed = [];
  for (const { id, name, photos } of products) {
    if (!photos.length) continue;
    const kept = [];
    for (const url of photos) {
      try {
        kept.push(await keepPhoto(tenantId, url, deps));
      } catch (err) {
        failed.push({ name, reason: `A photo couldn't be kept: ${err.message}` });
      }
    }
    if (!kept.length) continue;
    const product = await Product.findOne({ where: { id, tenantId } });
    if (!product) continue;
    const metadata = product.metadata || {};
    const storeImages = { ...(metadata.storeImages || {}) };
    kept.slice(1).forEach((u, i) => { storeImages[SLOTS[i + 1]] = u; });
    await product.update({ imageUrl: kept[0], metadata: { ...metadata, storeImages, photosFromLynk: kept.length } });
  }
  return failed;
}

module.exports = { photosOf, keepPhoto, savePhotos };
