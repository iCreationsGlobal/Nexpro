# Online Store: products per row and compact cards

**Decisions (2026-11-24)**
- The store owner chooses, under Online Store → Edit store → Product layout. Shoppers do not.
- Phones: 1 or 2 per row, default 2 for every store. Two per row uses the compact card; one keeps the large card.
- Tablets: 3 per row, always. Card style follows phones.
- Computers: the template's own number until the owner picks 3, 4, 5 or 6 (5 and 6 start at 1280px). Large cards unless the owner picks compact.
- Compact card: image, name (2 lines), price, discount, wishlist heart; "Out of stock" or "Sample" only when true. No buttons: tapping opens the product.
- Service stores too. The marketplace is unchanged.

**How it works**
- Saved in `OnlineStoreSettings.metadata.productGrid` as `{ phone, computer, computerCards }`. No migration.
- `sanitizeProductGrid` has three copies kept equal by a test: `Backend/utils/productGrid.js`, `Frontend/src/utils/productGrid.js`, `storefront/src/online-store/productGrid.js`.
- Storefront: `getProductGridClass` (columns) and `useCompactCards` (card style). A `null` grid means marketplace: old grid, large cards.
- `TEMPLATE_COMPUTER_COLUMNS` in the dashboard must match `computerColumns` in `storefront/src/templates/registry.js` (tested).

**Possible next:** smaller copies of photos. Cards now show more photos at once, and some product photos are over 1 MB.
