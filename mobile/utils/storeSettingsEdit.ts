/**
 * Editing a live Online Store from mobile.
 *
 * PUT /store/settings rebuilds most fields from the request body: a missing description or contact
 * becomes empty, a missing slug is re-derived from the store name (changing the store link), delivery
 * switches off, and a missing `enabled` unpublishes the store. The first-run wizard payload also resets
 * template, colours and delivery to setup defaults. Live edits therefore resend these fields from the
 * saved settings and change only what the merchant edited; everything else (template, colours, hero,
 * banner, metadata) the backend keeps when it is left out.
 */
const FIELDS_RESET_WHEN_MISSING = [
  'enabled',
  'slug',
  'displayName',
  'description',
  'contactPhone',
  'whatsappNumber',
  'contactEmail',
  'pickupEnabled',
  'deliveryEnabled',
  'deliveryFee',
] as const;

export function buildLiveStoreEditPayload(
  saved: Record<string, unknown>,
  changes: Record<string, unknown>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  FIELDS_RESET_WHEN_MISSING.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(saved, field)) {
      payload[field] = saved[field];
    }
  });
  return { ...payload, ...changes };
}

/** Saved settings are only safe to edit once loaded — without `enabled` a save would unpublish the store. */
export function canEditLiveStoreSettings(saved: Record<string, unknown> | null | undefined): boolean {
  return Boolean(saved?.id) && Object.prototype.hasOwnProperty.call(saved, 'enabled');
}
