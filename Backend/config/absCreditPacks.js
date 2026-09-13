/**
 * Default ABS Credits packs (GHS amounts in pesewas).
 * Platform can override via Setting key `platform:abs_credits`.
 */
const DEFAULT_ABS_CREDIT_PACKS = Object.freeze([
  {
    id: 'pack_100',
    credits: 100,
    amountPesewas: 2500,
    label: '100 credits',
    description: 'Good for occasional reminders and receipts overflow',
  },
  {
    id: 'pack_500',
    credits: 500,
    amountPesewas: 10000,
    label: '500 credits',
    description: 'Best for weekly promos and birthday messages',
  },
  {
    id: 'pack_2000',
    credits: 2000,
    amountPesewas: 35000,
    label: '2,000 credits',
    description: 'For high-volume campaigns',
  },
]);

/**
 * @param {unknown} packs
 * @returns {Array<{ id: string, credits: number, amountPesewas: number, label: string, description?: string }>}
 */
function normalizeCreditPacks(packs) {
  if (!Array.isArray(packs) || packs.length === 0) {
    return DEFAULT_ABS_CREDIT_PACKS.map((pack) => ({ ...pack }));
  }

  return packs
    .map((pack) => {
      const id = String(pack?.id || '').trim();
      const credits = parseInt(pack?.credits, 10);
      const amountPesewas = parseInt(pack?.amountPesewas ?? pack?.amount, 10);
      if (!id || !Number.isFinite(credits) || credits <= 0 || !Number.isFinite(amountPesewas) || amountPesewas <= 0) {
        return null;
      }
      return {
        id,
        credits,
        amountPesewas,
        label: String(pack.label || `${credits} credits`).trim(),
        description: pack.description ? String(pack.description).trim() : undefined,
      };
    })
    .filter(Boolean);
}

/**
 * @param {string} packId
 * @param {Array} [packs]
 * @returns {object|null}
 */
function findCreditPack(packId, packs = DEFAULT_ABS_CREDIT_PACKS) {
  const id = String(packId || '').trim();
  return normalizeCreditPacks(packs).find((pack) => pack.id === id) || null;
}

module.exports = {
  DEFAULT_ABS_CREDIT_PACKS,
  normalizeCreditPacks,
  findCreditPack,
};
