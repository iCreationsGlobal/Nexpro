# ABS performance improvements — 15 September 2026

Changes validated locally:

- Product list barcode and variant collections use Sequelize batched separate loads. This avoids multiplying parent rows when a product has multiple barcodes and variants, while retaining existing fields, pagination and stock enrichment. Child queries add round trips; confirm net latency with representative production data.
- Cache deletion/expiration now removes tenant-index entries and empty tenant sets, preventing invalidation work from accumulating expired entries. TTL and freshness policies were not extended.
- Products loads bulk/single label tools only when opened. The emitted Products JavaScript chunk decreased from 244,164 to 158,876 bytes (about 35%, uncompressed). This is a chunk-size measurement, not a measured page-load improvement.
- Smart report PDF export uses the existing lazy loader rather than loading html2pdf with the report view.
- Receive stock reuses successful barcode lookups within an open batch. Cache clears on reopen and submission; repeated scans still increase quantities. A test confirms three scans of two distinct products make two lookups.

Verification: 24 backend tests across cache and product controller suites passed; 14 frontend tests across hardware scanning, batch receiving and label generation passed. Frontend production build passed after query/cache/lazy-loading changes; subsequent receiving-cache changes were exercised by the frontend tests. No live stock updates, migrations or deployments were performed.

Remaining measurement: authenticated browser navigation, production API latency percentiles, database EXPLAIN plans on representative data, connection-pool waits and concurrency. No claim is made that the entire app has been profiled or that production latency has been reduced by a particular amount. Existing index migrations should be checked against the deployed schema before proposing new indexes or changing database configuration.
