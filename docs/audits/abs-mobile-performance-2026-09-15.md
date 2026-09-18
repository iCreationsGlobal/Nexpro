# ABS mobile: products and stock performance

- Products now uses incremental 20-item pages rather than stopping at the first 20 rows. FlatList renders a smaller window, deduplicates overlapping pages, supports load-more retry, and preserves loaded rows when a subsequent request fails.
- Query keys retain tenant/shop/studio isolation and use a distinct infinite-query key to avoid colliding with persisted single-page responses. Existing inventory mutation invalidation uses the products prefix.
- Restock uses the variants endpoint first when variants are not already provided, avoiding the full product request on populated variant responses. Empty/legacy responses still fall back to product details.
- Existing exact local barcode lookup and remote fallback in POS are retained; no longer cache duration or optimistic stock changes were introduced.
- Replaced two obsolete StyleSheet.absoluteFillObject usages on Products with absoluteFill.

19 tests passed across pagination, product service, stock calculations and local barcode lookup. Full TypeScript checking still reports other app errors; no overall typecheck pass is claimed. Physical-device startup time, frame rate and scan latency have not been measured. JavaScript export results are reported in the task response; native release compilation and device validation remain separate checks.
