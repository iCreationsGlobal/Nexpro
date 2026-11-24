# Online Store: products per row and compact cards

**Decisions (2026-11-24)**
- The store owner chooses, under Online Store → Edit store → Product layout. Shoppers do not.
- Phones: 1 or 2 per row, default 2 for every store. Two per row uses the compact card; one keeps the large card.
- Tablets: 3 per row, always. Card style follows phones.
- Computers: the template's own number until the owner picks 3, 4, 5 or 6 (5 and 6 start at 1280px). Large cards unless the owner picks compact.
- Compact card: image, name (2 lines), price, discount, wishlist heart; "Sample" only when true. A plus at the bottom right adds one to the cart (added later the same day); tapping anywhere else opens the product.
- The plus shows only where the product page sells online: priced, not a sample, not rent-only, and the owner's buttons include Add to cart or Buy now.
- The featured promo card was removed from online stores (it was automatic, with no owner setting).
- A card whose item is in the cart gets a shade of the store's color (added later the same day).
- Service stores too. The marketplace is unchanged.

**Availability (2026-11-24)**
- Online Stores do not check stock while shoppers browse. Sold-out items are listed with their normal buttons, and nothing says Available, For sale, In stock or Out of stock.
- Stock is checked when the shopper pays. If something is short, payment does not start, the shopper reads what is missing, and the store is told who wanted it and their phone number (in the app and by push; owner, admin, manager, staff).
- At most one alert an hour for the same shopper and item, and 20 alerts an hour for a store.
- Products that do not track stock can be bought.
- "Continue selling when out of stock" still sells as before.
- The product page has no store card and no "Store › product" line.
- All of this is only for checkouts that name the online store. The marketplace and the Sabito apps are unchanged.

**How it works**
- Saved in `OnlineStoreSettings.metadata.productGrid` as `{ phone, computer, computerCards }`. No migration.
- `sanitizeProductGrid` has three copies kept equal by a test: `Backend/utils/productGrid.js`, `Frontend/src/utils/productGrid.js`, `storefront/src/online-store/productGrid.js`.
- Storefront: `getProductGridClass` (columns) and `useCompactCards` (card style). A `null` grid means marketplace: old grid, large cards.
- `TEMPLATE_COMPUTER_COLUMNS` in the dashboard must match `computerColumns` in `storefront/src/templates/registry.js` (tested).

- Sold-out items: the storefront sends `soldOut=1` to the store home and store products endpoints; nothing else does.
- Checkout: `isExplicitOnlineStoreRequest` (not `resolveCommerceChannelFromRequest`, which the Sabito apps fall back to online store in). Alert and wording: `Backend/services/storefrontUnavailableItems.js` and `notifyOnlineStoreItemsUnavailable`.
- The tint is the `data-in-cart` attribute. Do not change the class list of an `.sf-reveal` element: React would drop the `is-visible` class that scrollReveal adds, and the card disappears.

**Possible next:** smaller copies of photos. Cards now show more photos at once, and some product photos are over 1 MB.
