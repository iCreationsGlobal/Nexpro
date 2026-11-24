import { Link } from 'react-router-dom';
import { Heart, Package, ShoppingCart, Trash2 } from 'lucide-react';

import AccountLayout from '../components/storefront/AccountLayout';
import { EmptyState, getProductUrl } from '../components/storefront/StorefrontLayout';
import { InlineErrorState, WishlistSkeleton } from '../components/storefront/StateBlocks';
import { useCart } from '../context/CartContext';
import { useStorefrontMode } from '../context/StorefrontModeContext';
import { useWishlist } from '../context/WishlistContext';
import { resolveSingleStoreHomePath } from '../online-store/storePaths';
import { resolveImageUrl } from '../utils/fileUtils';
import { formatAmount } from '../utils/formatNumber';
import { showError, showSuccess } from '../utils/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const ShopperWishlistPage = () => {
  const { addItem } = useCart();
  const {
    isSingleStoreMode,
    storeSlug: modeSlug,
    pathPrefix,
    isCustomDomain,
  } = useStorefrontMode();
  const {
    isWishlistLoading,
    wishlistError,
    refetchWishlist,
    items,
    pendingListingIds,
    removeWishlistItem,
  } = useWishlist();

  const shopHomePath = isSingleStoreMode
    ? resolveSingleStoreHomePath({ storeSlug: modeSlug, pathPrefix, isCustomDomain })
    : '/';
  const browsePath = isSingleStoreMode
    ? (isCustomDomain || shopHomePath === '/' ? '/products' : `${shopHomePath}/products`)
    : '/products';

  const handleAddToCart = (product) => {
    const result = addItem({ product, quantity: 1 });
    if (!result.ok) {
      showError('This product could not be added to your cart.');
      return;
    }
    showSuccess(result.replacedStore
      ? (isSingleStoreMode ? 'Cart updated.' : 'Cart updated for this seller. Previous seller items were removed.')
      : 'Added to cart.');
  };

  return (
    <AccountLayout
      title="Wishlist"
      description={isSingleStoreMode
        ? 'Saved products from this shop appear here with their latest price and stock status.'
        : 'Saved products from Sabito storefronts appear here with their latest price and stock status.'}
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:rounded-[2rem] sm:p-5 md:p-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[color:var(--store-accent,#166534)]">Saved products</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Your wishlist</h1>
            <p className="mt-2 text-sm text-slate-500">
              {items.length ? `${items.length} saved product${items.length === 1 ? '' : 's'}` : 'Products you save will show here.'}
            </p>
          </div>
          <Button asChild variant="outline" className="w-full rounded-full border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] hover:bg-[var(--store-accent-soft,#16653422)] sm:w-auto">
            <Link to={browsePath}>{isSingleStoreMode ? 'Back to shop' : 'Browse products'}</Link>
          </Button>
        </div>

        {isWishlistLoading ? (
          <WishlistSkeleton />
        ) : wishlistError ? (
          <InlineErrorState
            title="Could not load your wishlist"
            message="Saved products will appear here after the wishlist refreshes."
            onRetry={refetchWishlist}
          />
        ) : items.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={Heart}
              title="No saved products yet"
              description="Tap the heart on a product to save it here for later."
              action={<Button asChild className="rounded-full bg-[var(--store-accent,#166534)] text-white hover:bg-[var(--store-accent-hover,color-mix(in_srgb,var(--store-accent,#166534)_85%,black))]"><Link to={browsePath}>{isSingleStoreMode ? 'Back to shop' : 'Start shopping'}</Link></Button>}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {items.map((item) => (
              <WishlistItem
                key={item.id}
                item={item}
                isPending={pendingListingIds.includes(item.listingId)}
                sellerFallback={isSingleStoreMode ? 'Seller' : 'Sabito seller'}
                checksStock={!isSingleStoreMode}
                productUrlPrefix={isSingleStoreMode ? (pathPrefix || 'shop') : undefined}
                onAddToCart={handleAddToCart}
                onRemove={removeWishlistItem}
              />
            ))}
          </div>
        )}
      </section>
    </AccountLayout>
  );
};

const WishlistItem = ({
  item,
  isPending,
  sellerFallback = 'Seller',
  checksStock = true,
  productUrlPrefix,
  onAddToCart,
  onRemove,
}) => {
  const product = item.product || {};
  const availability = product.availability || {};
  const store = product.store || {};
  // Online Stores check stock at payment; only a listing that was taken down cannot be added.
  const available = checksStock ? product.available === true : availability.status !== 'unavailable';
  const imageUrl = resolveImageUrl(product.images?.[0]);
  const productUrl = getProductUrl(product, productUrlPrefix ? { prefix: productUrlPrefix } : {});

  return (
    <article className="grid gap-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:rounded-3xl">
      <Link to={productUrl} className="h-28 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 sm:w-28">
        {imageUrl ? (
          <img src={imageUrl} alt={product.title} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-400">
            <Package className="h-7 w-7" />
          </span>
        )}
      </Link>

      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--store-accent,#166534)]">{store.displayName || sellerFallback}</p>
        <Link to={productUrl} className="mt-1 block break-words text-lg font-black text-slate-950 hover:text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]">
          {product.title}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {checksStock || !available ? (
            <Badge
              variant={available ? 'outline' : 'default'}
              className={available
                ? 'border-[color:color-mix(in_srgb,var(--store-accent,#166534)_18%,#e5e7eb)] bg-[var(--store-accent-soft,#f0fdf4)] text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]'
                : 'border-0 bg-slate-700 text-white hover:bg-slate-700'}
            >
              {availability.label || (available ? 'Available' : 'Out of stock')}
            </Badge>
          ) : null}
          {product.category?.name ? (
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
              {product.category.name}
            </Badge>
          ) : null}
        </div>
        <p className="mt-3 text-lg font-black text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]">
          {formatAmount(product.publicPrice || 0, store.currency)}
        </p>
        {!available ? (
          <p className="mt-2 text-sm text-slate-500">{availability.message || 'This item is saved, but cannot be added to cart right now.'}</p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:flex sm:flex-col sm:items-end sm:justify-between">
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-full border-rose-200 text-rose-700 hover:bg-rose-50 sm:w-auto"
          onClick={() => onRemove(item.listingId)}
          disabled={isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remove
        </Button>
        <Button
          type="button"
          className="w-full rounded-full bg-[var(--store-accent,#166534)] text-white hover:bg-[var(--store-accent-hover,color-mix(in_srgb,var(--store-accent,#166534)_85%,black))] sm:w-auto"
          disabled={!available}
          onClick={() => onAddToCart(product)}
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          {available ? 'Add' : 'Out of stock'}
        </Button>
      </div>
    </article>
  );
};

export default ShopperWishlistPage;
