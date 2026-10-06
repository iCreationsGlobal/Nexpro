/**
 * Match bulk-uploaded photos to products by file name.
 * "00001.jpg" or "00001-A.jpg" = product 00001's main photo; "00001-B.jpg" … "00001-E.jpg" = its extra store photos.
 * Product code is tried first, then SKU, then barcode. Separators (- _ space) and case don't matter.
 */

/** A = main product photo (inventory + store cover). B–E = extra online store photos. */
export const PRODUCT_IMAGE_SLOTS = ['A', 'B', 'C', 'D', 'E'];

const normalizeCode = (value) => String(value ?? '').trim().toLowerCase();

/**
 * File name without its extension, normalized for matching.
 * @param {string} fileName
 * @returns {string}
 */
export const imageFileCode = (fileName) => normalizeCode(String(fileName || '').replace(/\.[^./\\]+$/, ''));

/**
 * Build a lookup from code to products. Product code beats SKU beats barcode.
 * @param {Object[]} products
 * @returns {(code: string) => Object[]|undefined}
 */
export const buildProductCodeLookup = (products) => {
  const tiers = [(p) => [p?.productCode], (p) => [p?.sku], (p) => [p?.barcode]].map((pick) => {
    const index = new Map();
    (products || []).forEach((product) => {
      new Set(pick(product).map(normalizeCode).filter(Boolean)).forEach((code) => {
        const list = index.get(code) || [];
        list.push(product);
        index.set(code, list);
      });
    });
    return index;
  });
  return (code) => (code ? tiers.map((index) => index.get(code)).find(Boolean) : undefined);
};

/**
 * Work out which product code and photo slot a file name points at.
 * The whole name is tried as a code first, so a real code ending in a letter (e.g. "00001B") still wins.
 * Then the last letter is read as the slot. Each step retries with the letter O read as zero.
 * @param {string} fileName
 * @param {(code: string) => Object[]|undefined} lookup
 * @returns {{ code: string, letter: string, candidates: Object[]|undefined }}
 */
export const resolveImageFileName = (fileName, lookup) => {
  const stem = imageFileCode(fileName);
  const split = stem.match(/^(.+?)[\s_-]*([a-z])$/);
  const attempts = [
    { code: stem, letter: 'a' },
    { code: stem.replace(/o/g, '0'), letter: 'a' },
    ...(split ? [
      { code: split[1], letter: split[2] },
      { code: split[1].replace(/o/g, '0'), letter: split[2] },
    ] : []),
  ];
  const hit = attempts.find((attempt) => lookup(attempt.code));
  if (!hit) return { code: stem, letter: 'a', candidates: undefined };
  return { ...hit, candidates: lookup(hit.code) };
};

/**
 * @typedef {'matched'|'no_match'|'ambiguous'|'duplicate'|'too_many'} ImageMatchStatus
 * @typedef {{ file: File, code: string, slot: string|null, status: ImageMatchStatus, product: Object|null, candidates?: Object[] }} ImageMatch
 */

/**
 * Pair each file with a product and photo slot.
 * Codes shared by several products are reported as ambiguous rather than guessed.
 * A second photo for the same product slot is a duplicate; letters after E are too many.
 * @param {File[]} files
 * @param {Object[]} products
 * @returns {ImageMatch[]}
 */
export const matchImagesToProducts = (files, products) => {
  const lookup = buildProductCodeLookup(products);
  const claimed = new Set();
  return (files || []).map((file) => {
    const { code, letter, candidates } = resolveImageFileName(file?.name, lookup);
    const slot = letter.toUpperCase();
    if (!candidates) return { file, code, slot: null, status: 'no_match', product: null };
    if (candidates.length > 1) return { file, code, slot: null, status: 'ambiguous', product: null, candidates };
    const [product] = candidates;
    if (!PRODUCT_IMAGE_SLOTS.includes(slot)) return { file, code, slot, status: 'too_many', product };
    const key = `${product.id}:${slot}`;
    if (claimed.has(key)) return { file, code, slot, status: 'duplicate', product };
    claimed.add(key);
    return { file, code, slot, status: 'matched', product };
  });
};

/**
 * The photo a product already has in a slot, if any.
 * @param {Object} product
 * @param {string} slot
 * @returns {string}
 */
export const existingSlotImage = (product, slot) => (
  slot === 'A' ? product?.imageUrl || '' : product?.storeImages?.[slot] || ''
);

/**
 * Group matched photos by product, ready to save.
 * @param {ImageMatch[]} matches - only `matched` entries are used
 * @param {{ replaceExisting?: boolean }} [options]
 * @returns {{ product: Object, photos: { slot: string, file: File, replaces: boolean }[], skipped: { slot: string, file: File }[] }[]}
 */
export const planProductImageSaves = (matches, { replaceExisting = false } = {}) => {
  const byProduct = new Map();
  (matches || []).filter((m) => m.status === 'matched').forEach((match) => {
    const entry = byProduct.get(match.product.id) || { product: match.product, photos: [], skipped: [] };
    const replaces = Boolean(existingSlotImage(match.product, match.slot));
    if (replaces && !replaceExisting) entry.skipped.push({ slot: match.slot, file: match.file });
    else entry.photos.push({ slot: match.slot, file: match.file, replaces });
    byProduct.set(match.product.id, entry);
  });
  return [...byProduct.values()].map((entry) => ({
    ...entry,
    photos: entry.photos.sort((a, b) => a.slot.localeCompare(b.slot)),
  }));
};
