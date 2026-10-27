type AnyProduct = Record<string, any>;

/** A product name as the server compares it: trimmed, single spaces, lower case. */
export const productNameKey = (name: unknown) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The product already there when a create was refused for its name (409 DUPLICATE_PRODUCT_NAME), else null. */
export function duplicateNameConflict(error: unknown): AnyProduct | null {
  const response = (error as { response?: { status?: number; data?: { code?: string; data?: AnyProduct } } } | null)?.response;
  return response?.status === 409 && response.data?.code === 'DUPLICATE_PRODUCT_NAME' && response.data.data?.id
    ? response.data.data
    : null;
}
