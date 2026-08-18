# Stock Architecture (ABS Retail)

Long-term model for retail product stock: **shared catalog**, **per-shop balances**, and a **single movement ledger**. Materials/drugs are unchanged for now.

## Model

### Shared catalog
- One `products` / `product_variants` row per tenant identity (name, barcode, price, images, `trackStock`).
- Do **not** clone a product per shop for new transfers.
- `products.shopId` may still exist as a legacy “home shop” and for single-shop tenants.

### Per-shop balances — `product_shop_stocks`
| Column | Notes |
|--------|--------|
| `tenantId` | Always filter first |
| `productId` | Catalog product |
| `productVariantId` | Nullable; null = simple product balance |
| `shopId` | Location |
| `quantityOnHand` | Source of truth for that shop |

Unique:
- `(tenantId, productId, shopId)` where variant is null
- `(tenantId, productId, productVariantId, shopId)` where variant is set

### Ledger — `product_stock_movements`
Every quantity change writes a row (same DB transaction as the balance update).

Types:
`receive`, `adjustment`, `transfer_in`, `transfer_out`, `return`, `sale`, `sale_void`, `count_adjustment`, `opening`, `import`, `damage`

Always set: `shopId`, `quantityDelta`, `previousQuantity`, `newQuantity`, `reference` when applicable, `createdBy`, `reason` / `metadata`.

### Denormalized cache
`products.quantityOnHand` / `product_variants.quantityOnHand` remain for backward compatibility. `applyStockChange` syncs them when the change is for the product’s home shop (`product.shopId` matches) or when `product.shopId` is null.

## Helper

`Backend/utils/productStockUtils.js` → **`applyStockChange`**

```js
await applyStockChange({
  tenantId,
  productId,
  productVariantId, // optional
  shopId,           // required
  delta,            // OR setTo
  type,
  reason,
  reference,
  userId,
  metadata,
  transaction,      // required
});
```

Also: `applyStockChanges`, `getShopStockQuantity`, `attachShopStockToProducts`, `shopCatalogVisibilityLiteral`.

## Write paths (must use helper)

| Flow | Type(s) |
|------|---------|
| POS / create sale | `sale` |
| Cancel sale / restore online order | `sale_void` |
| Storefront checkout | `sale` |
| Adjust / receive / bulk stock | `receive` / `adjustment` |
| Product create opening qty | `opening` |
| Sale return restock | `return` |
| Stock transfer | `transfer_out` + `transfer_in` (same `productId`) |
| Stock count approve | `count_adjustment` |

## Transfers

**Preferred:** same `productId`, `sourceShopId` → `destinationShopId`, two balance updates + two ledger rows; `stock_transfers` row with `sourceProductId === destinationProductId`.

**Legacy:** clone/find destination product still available when `sharedCatalog: false` (not the default).

## Reads

- List/detail: quantity from `product_shop_stocks` for the active shop. If that shop-stock row is missing, use denormalized `quantityOnHand`. If the home-shop (or null home) shop-stock row is 0 but catalog qty is > 0, use the catalog qty (stale placeholder from POS/migration). Non-home shops keep an explicit 0.
- Never replace a simple product’s qty with `sum(variants)` when `variants` is missing or `[]`. POS and product detail always include variants; an empty array used to wipe Heatpress/CAPS-style SKUs to 0 while the Products table (no variants include) still showed catalog qty.
- Catalog visibility at a shop: home `shopId`, null `shopId`, or EXISTS shop-stock row (`shopCatalogVisibilityLiteral`).
- Product history: ledger types including sales; legacy `sale_items` merged only when no ledger `sale:` reference exists.

## Migration

1. `create-product-stock-movements-table` (existing)
2. `create-product-shop-stocks-and-expand-movements` — table, indexes, enum expansion, backfill from shop-scoped products/variants

Run via `Backend/migrations/migrate.js` or the migration file directly.

## Single-shop tenants

POS and restock keep working: product still has `shopId`, backfill creates one shop-stock row, adjust-stock / sales resolve shop from product or request scope.

## Follow-ups

- Pharmacy drugs / materials stock ledger (out of scope here)
- Optional GET movements report endpoint
- Gradual relaxation of product `shopId` (true tenant-wide catalog)
- Deduplicate historical product clones created by old transfers
