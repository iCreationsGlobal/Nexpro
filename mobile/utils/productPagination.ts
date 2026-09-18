/** Prefer server pagination; never stop early solely because the API caps page size. */
export function nextProductPage(response: unknown, page: number, rowCount: number, requestedSize = 20): number | undefined {
  if (!rowCount) return undefined;
  const body = response as { pagination?: { totalPages?: number; total?: number; limit?: number }; count?: number } | null;
  const pages = Number(body?.pagination?.totalPages);
  if (Number.isFinite(pages) && pages > 0) return page < pages ? page + 1 : undefined;
  const total = Number(body?.pagination?.total ?? body?.count);
  const size = Number(body?.pagination?.limit) || requestedSize;
  if (Number.isFinite(total)) return page * size < total ? page + 1 : undefined;
  return rowCount >= requestedSize ? page + 1 : undefined;
}
