import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Menu, MessageCircle, Search, Store, Truck, X } from 'lucide-react';

import { useStorefrontMode } from '../context/StorefrontModeContext';
import { getTemplateTheme } from '../templates/registry';
import { resolveImageUrl } from '../utils/fileUtils';
import { buildStoreContactHref } from '../utils/whatsapp';
import { brandAccent } from './brandAccent';
import { useOnlineStoreChrome } from './OnlineStoreChromeContext';
import { getActiveStorePage, getStorePages, isServiceStore } from './storeNavigation';
import { buildStoreCatalogPath, resolveSingleStoreHomePath } from './storePaths';
import { cn } from '@/lib/utils';

const iconButtonClass = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-foreground/5';

const scrollToTop = () => window.scrollTo(0, 0);

/**
 * Logo and store name, with whatever buttons the caller adds. Also used by the template preview.
 * @param {{ store: object, homeTo?: string, onHomeClick?: () => void, children?: import('react').ReactNode }} props
 */
export const StoreHeaderRow = ({ store, homeTo, onHomeClick, children }) => {
  const logoUrl = resolveImageUrl(store?.logoUrl);
  const brand = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border ${logoUrl ? 'bg-white' : brandAccent.softIcon}`}>
        {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : <Store className="h-5 w-5" />}
      </span>
      <span className="truncate text-base font-bold">{store?.displayName || 'Shop'}</span>
    </>
  );
  const brandClass = 'flex min-h-11 min-w-0 flex-1 items-center gap-3';

  return (
    <div className="flex items-center gap-1 py-2 pl-3 pr-1 sm:pl-4 sm:pr-2">
      {homeTo
        ? <Link to={homeTo} className={brandClass} onClick={onHomeClick}>{brand}</Link>
        : <div className={brandClass}>{brand}</div>}
      {children}
    </div>
  );
};

const StoreMenu = ({ store, pages, activePage, homePath, dark, onClose }) => {
  const panelRef = useRef(null);
  const contactHref = buildStoreContactHref(store);

  useEffect(() => {
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector('[data-menu-close]')?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = [...(panelRef.current?.querySelectorAll('a[href], button') || [])];
      const edge = event.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement !== edge) return;
      event.preventDefault();
      (event.shiftKey ? items[items.length - 1] : items[0])?.focus();
    };
    // Turning a tablet sideways shows the computer menu; do not leave the page locked behind it.
    const wide = window.matchMedia('(min-width: 1024px)');
    document.addEventListener('keydown', handleKeyDown);
    wide.addEventListener?.('change', onClose);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      wide.removeEventListener?.('change', onClose);
      opener?.focus?.();
    };
  }, [onClose]);

  const handleNavigate = () => {
    onClose();
    scrollToTop();
  };
  const secondaryClass = 'flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-foreground/80 hover:bg-foreground/5';

  return (
    <div
      ref={panelRef}
      id="store-mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Store menu"
      className={cn('fixed inset-0 z-[60] overflow-y-auto bg-background pb-[env(safe-area-inset-bottom)] text-foreground lg:hidden', dark && 'sf-dark')}
    >
      <div className="sticky top-0 z-10 border-b border-border bg-background">
        <StoreHeaderRow store={store} homeTo={homePath} onHomeClick={handleNavigate}>
          <button type="button" data-menu-close className={iconButtonClass} onClick={onClose} aria-label="Close store menu">
            <X className="h-6 w-6" />
          </button>
        </StoreHeaderRow>
      </div>
      <nav className="grid gap-2 px-3 py-4 sm:px-4" aria-label="Store pages">
        {pages.map((page) => {
          const active = page.key === activePage;
          return (
            <Link
              key={page.key}
              to={page.to}
              onClick={handleNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-12 items-center rounded-2xl border px-4 text-sm font-bold transition-colors',
                active
                  ? 'border-transparent bg-[var(--store-accent,#166534)] text-white'
                  : 'border-border bg-card text-foreground hover:border-foreground/20',
              )}
            >
              {page.label}
            </Link>
          );
        })}
      </nav>
      <div className="mx-3 grid gap-1 border-t border-border py-4 sm:mx-4">
        <Link to="/track-order" className={secondaryClass} onClick={handleNavigate}>
          <Truck className="h-5 w-5" />
          Track order
        </Link>
        {contactHref ? (
          <a href={contactHref} target="_blank" rel="noreferrer" className={secondaryClass}>
            <MessageCircle className="h-5 w-5" />
            Contact us
          </a>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Online Store header on phones and tablets (the computer headers take over at 1024px).
 * The menu is a sibling of the header on purpose: a blurred header would trap a fixed panel inside itself.
 * @param {{ store: object }} props
 */
export default function StoreMobileHeader({ store }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { pathPrefix, isCustomDomain } = useStorefrontMode();
  const { setStore } = useOnlineStoreChrome();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => setStore(store), [setStore, store]);

  const theme = getTemplateTheme(store?.templateId);
  const serviceStore = isServiceStore(store);
  const activePage = getActiveStorePage(pathname);
  const homePath = resolveSingleStoreHomePath({ storeSlug: store?.slug, pathPrefix, isCustomDomain, pathname });

  const handleSearch = (event) => {
    event.preventDefault();
    const search = new FormData(event.currentTarget).get('search');
    closeSearch();
    scrollToTop();
    navigate(buildStoreCatalogPath(store?.slug, {
      search,
      pathname,
      isCustomDomain,
      isServiceStore: serviceStore,
      ...(pathPrefix ? { prefix: pathPrefix } : {}),
    }));
  };

  return (
    <>
      <header className={cn('sticky top-0 z-50 lg:hidden', theme.headerClass, theme.dark ? 'sf-dark text-white' : 'text-slate-950')}>
        <StoreHeaderRow store={store} homeTo={homePath} onHomeClick={scrollToTop}>
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => setSearchOpen((open) => !open)}
            aria-label={searchOpen ? 'Close search' : 'Search'}
            aria-expanded={searchOpen}
          >
            {searchOpen ? <X className="h-6 w-6" /> : <Search className="h-6 w-6" />}
          </button>
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => setMenuOpen(true)}
            aria-label="Open store menu"
            aria-controls="store-mobile-menu"
            aria-expanded={menuOpen}
          >
            <Menu className="h-6 w-6" />
          </button>
        </StoreHeaderRow>
        {searchOpen ? (
          <form
            role="search"
            onSubmit={handleSearch}
            onKeyDown={(event) => { if (event.key === 'Escape') closeSearch(); }}
            className="px-3 pb-3 sm:px-4"
          >
            <div className="flex overflow-hidden rounded-full border border-border bg-background p-1">
              {/* 16px text: anything smaller makes iPhones zoom the page in. */}
              <input
                name="search"
                type="search"
                enterKeyHint="search"
                autoFocus
                defaultValue={activePage === 'catalog' ? searchParams.get('search') || '' : ''}
                placeholder={`Search ${store?.displayName || 'the shop'}`}
                aria-label={`Search ${store?.displayName || 'the shop'}`}
                className="h-11 min-w-0 flex-1 bg-transparent px-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                aria-label="Search the shop"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--store-accent,#166534)] text-white"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
          </form>
        ) : null}
      </header>
      {menuOpen ? (
        <StoreMenu
          store={store}
          pages={getStorePages({ homePath, serviceStore })}
          activePage={activePage}
          homePath={homePath}
          dark={theme.dark}
          onClose={closeMenu}
        />
      ) : null}
    </>
  );
}
