import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, MessageCircle, Search, ShoppingCart, Store, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatAmount } from '../utils/formatNumber';
import { resolveImageUrl } from '../utils/fileUtils';
import { getProductGridClass, sanitizeProductGrid } from '../online-store/productGrid';
import { StoreHeaderRow } from '../online-store/StoreMobileHeader';
import { getStoreTabs, StoreTabBarView } from '../online-store/StoreTabBar';
import { buildStoreProductPath } from '../online-store/storePaths';
import StoreHeroCarousel from '../components/storefront/StoreHeroCarousel';
import { StoreScopedFooter } from '../components/storefront/StorefrontLayout';
import TemplateThemeProvider, { getTemplateTheme, resolveStoreBrandColors } from './TemplateThemeProvider';
import { SAMPLE_PRODUCTS } from './sampleCatalog';

const PREVIEW_NAV_ITEMS = [
  { key: 'home', label: 'Home' },
  { key: 'catalog', label: 'All Products' },
  { key: 'categories', label: 'Categories' },
  { key: 'about', label: 'About Us' },
  { key: 'reviews', label: 'Reviews' },
];

/**
 * Lightweight presentational storefront chrome for Online Store gallery / ABS iframe previews.
 * Live Online Store pages use PublicStoreHome with single-shop mode; this shell mirrors that chrome
 * without marketplace navigation.
 *
 * @param {{
 *   store: object,
 *   products?: object[],
 *   previewMode?: boolean,
 *   showGalleryChrome?: boolean,
 *   galleryBackTo?: string,
 *   useTemplateCtaHref?: string,
 * }} props
 */
export default function StoreTemplateShell({
  store,
  products = SAMPLE_PRODUCTS,
  previewMode = true,
  showGalleryChrome = false,
  galleryBackTo = '/templates',
  useTemplateCtaHref,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const theme = getTemplateTheme(store?.templateId);
  const brandColors = resolveStoreBrandColors(store?.templateId, store || {});
  const accent = brandColors.primary || theme.accent;
  const secondary = brandColors.secondary || theme.secondary || accent;
  const logoUrl = resolveImageUrl(store?.logoUrl) || '';
  const currency = store?.currency || 'GHS';
  const listingProducts = Array.isArray(products) && products.length ? products : SAMPLE_PRODUCTS;

  const productLink = (product) => {
    if (previewMode) return '#';
    const slug = product?.slug || product?.id;
    return store?.slug && slug
      ? buildStoreProductPath(store.slug, slug, { prefix: 'shop' })
      : '#';
  };

  return (
    <TemplateThemeProvider
      templateId={store?.templateId}
      primaryColor={brandColors.primary}
      secondaryColor={brandColors.secondary}
      tertiaryColor={brandColors.tertiary}
    >
      <div className="min-h-screen">
        {showGalleryChrome ? (
          <div className="sticky top-0 z-[60] border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Template preview</p>
                <p className="truncate font-semibold text-slate-950">{store?.displayName || 'Demo store'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="text-slate-950" asChild>
                  <Link to={galleryBackTo}>Back to gallery</Link>
                </Button>
                {useTemplateCtaHref ? (
                  <Button className="bg-[var(--store-accent,#166534)] text-white hover:bg-[color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]" asChild>
                    <a href={useTemplateCtaHref}>Use this template</a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <header className={`sticky top-0 z-50 lg:hidden ${theme.headerClass} ${theme.dark ? 'sf-dark text-white' : ''}`}>
          <StoreHeaderRow store={store}>
            <span className="flex h-11 w-11 items-center justify-center"><Search className="h-6 w-6" /></span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              aria-label={mobileMenuOpen ? 'Close store menu' : 'Open store menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </StoreHeaderRow>
          {mobileMenuOpen ? (
            <div className="border-t border-border px-3 py-3 sm:px-4">
              <nav className="grid gap-2" aria-label="Store pages">
                {PREVIEW_NAV_ITEMS.map((item) => (
                  <span
                    key={item.key}
                    className="flex min-h-11 items-center rounded-2xl border border-border px-4 py-2.5 text-sm font-bold"
                    style={
                      item.key === 'home'
                        ? { backgroundColor: accent, borderColor: accent, color: '#fff' }
                        : undefined
                    }
                  >
                    {item.label}
                  </span>
                ))}
              </nav>
            </div>
          ) : null}
        </header>

        <header className={`sticky top-0 z-50 hidden lg:block ${theme.headerClass}`}>
          <div className="mx-auto flex w-full max-w-[1440px] items-center gap-4 px-4 py-3">
            <div className="contents">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Store className="h-5 w-5" style={{ color: accent }} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-black sm:text-xl">{store?.displayName}</span>
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 overflow-hidden rounded-full border border-slate-200 bg-white/80 p-1">
              <Input
                readOnly={previewMode}
                placeholder={`Search ${store?.displayName || 'store'}`}
                className="h-11 min-h-11 border-0 bg-transparent px-4 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                type="button"
                size="icon"
                className="h-11 min-h-11 w-11 shrink-0 rounded-full"
                style={{ backgroundColor: accent }}
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>

            <nav className="hidden shrink-0 items-center gap-4 xl:gap-5 lg:flex" aria-label="Store pages">
              {PREVIEW_NAV_ITEMS.map((item) => (
                <span
                  key={item.key}
                  className={`whitespace-nowrap text-sm font-semibold ${
                    item.key === 'home' ? '' : 'opacity-70'
                  }`}
                  style={item.key === 'home' ? { color: accent } : undefined}
                >
                  {item.label}
                </span>
              ))}
            </nav>

            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                type="button"
                style={{ borderColor: secondary, color: secondary }}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Cart
              </Button>
              <Button type="button" className="rounded-full" style={{ backgroundColor: accent }}>
                Sign in
              </Button>
            </div>
          </div>
        </header>

        <main>
          {Array.isArray(store?.heroSlides) && store.heroSlides.length > 0 ? (
            <StoreHeroCarousel
              slides={store.heroSlides}
              storeName={store?.displayName}
              accent={accent}
              animation={store?.heroAnimation}
            />
          ) : null}
          <section className="w-full px-3 py-6 sm:px-4 sm:py-8">
            <div className={`overflow-hidden ${theme.heroClass}`}>
              <div className="grid gap-4 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: accent }}>
                    {theme.id === 'catalog' ? 'Lookbook' : theme.id === 'marketplace' ? 'Shop the catalog' : 'Your shop'}
                  </p>
                  <h1 className={`mt-2 font-bold tracking-tight ${theme.id === 'bold' ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'}`}>
                    {store?.displayName}
                  </h1>
                  <p className={`mt-3 max-w-2xl text-sm leading-6 ${theme.id === 'bold' ? 'text-white/80' : 'opacity-70'}`}>
                    {store?.description || 'Browse sample products in this storefront layout.'}
                  </p>
                </div>
                <Button type="button" className="w-full sm:w-auto" style={{ backgroundColor: accent }}>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Contact store
                </Button>
              </div>
            </div>
          </section>

          <section className="w-full px-3 pb-12 sm:px-4">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: accent }}>
                  {store?.displayName}
                </p>
                <h2 className={`mt-1 font-semibold ${theme.dense ? 'text-xl' : 'text-2xl'}`}>
                  {theme.dense ? 'All listings' : 'Featured products'}
                </h2>
              </div>
              {previewMode ? (
                <span
                  className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                  style={{ borderColor: secondary, color: secondary }}
                >
                  Sample catalog
                </span>
              ) : null}
            </div>

            <div className={getProductGridClass(sanitizeProductGrid(store?.productGrid), theme)}>
              {listingProducts.map((product) => {
                const price = Number.parseFloat(product?.publicPrice || 0);
                const compareAt = Number.parseFloat(product?.compareAtPrice || 0);
                const image = Array.isArray(product?.images) ? product.images[0] : null;
                const card = (
                  <div className={`overflow-hidden ${theme.productCardClass}`}>
                    <div className={`aspect-square overflow-hidden bg-slate-100 ${theme.dense ? 'lg:aspect-[4/5]' : ''}`}>
                      {image ? (
                        <img src={image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm opacity-50">No image</div>
                      )}
                    </div>
                    <div className={`space-y-1 p-2 ${theme.dense ? 'lg:p-2.5' : 'lg:space-y-2 lg:p-4'}`}>
                      <p className={`line-clamp-2 text-[13px] font-semibold leading-snug lg:leading-snug ${theme.dense ? 'lg:text-sm' : 'lg:text-base'}`}>
                        {product.title}
                      </p>
                      {!theme.dense && product.shortDescription ? (
                        <p className="line-clamp-2 text-xs opacity-60 max-lg:hidden">{product.shortDescription}</p>
                      ) : null}
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className={`font-bold ${theme.dense ? 'text-sm' : 'text-[15px] lg:text-base'}`} style={{ color: accent }}>
                          {formatAmount(price, currency)}
                        </span>
                        {compareAt > price ? (
                          <span className="text-xs line-through opacity-50">{formatAmount(compareAt, currency)}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );

                if (previewMode) {
                  return <div key={product.id || product.slug}>{card}</div>;
                }

                return (
                  <Link key={product.id || product.slug} to={productLink(product)} className="block">
                    {card}
                  </Link>
                );
              })}
            </div>
          </section>
        </main>

        <StoreScopedFooter
          store={{
            ...store,
            showAbsPromo: store?.showAbsPromo !== false,
          }}
          singleStoreMode
          storeBasePath={`/shop/${encodeURIComponent(store?.slug || 'demo-boutique')}`}
          subtitle=""
          accentColor={accent}
        />
        <div className="h-14 lg:hidden" aria-hidden="true" />
        <StoreTabBarView store={store} tabs={getStoreTabs()} activeKey="home" interactive={false} />
      </div>
    </TemplateThemeProvider>
  );
}
