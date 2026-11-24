import { useEffect, useLayoutEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ClipboardList, Home, LayoutGrid, ShoppingBag, ShoppingCart, User } from 'lucide-react';

import { useCart } from '../context/CartContext';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { isStorefrontCommercePath, useStorefrontMode } from '../context/StorefrontModeContext';
import { buildStoreColorCssVars, getTemplateTheme } from '../templates/registry';
import { brandAccent } from './brandAccent';
import { useOnlineStoreChrome } from './OnlineStoreChromeContext';
import { getActiveStorePage, getStorePages, hasStoreTabBar, isServiceStore } from './storeNavigation';
import { resolveSingleStoreHomePath } from './storePaths';
import { cn } from '@/lib/utils';

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);

const isTextField = (element) => Boolean(element) && (
  element.tagName === 'TEXTAREA'
  || element.isContentEditable === true
  || (element.tagName === 'INPUT' && !NON_TEXT_INPUTS.has(element.type))
);

/** True while typing, when some phone browsers would float a bottom bar above the keyboard. */
const useIsTyping = (locationKey) => {
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const update = () => setIsTyping(isTextField(document.activeElement));
    // Wait a tick: during focusout the next field is not focused yet.
    const schedule = () => window.setTimeout(update, 0);
    update();
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    };
  }, [locationKey]);

  return isTyping;
};

/**
 * @param {{ homePath?: string, serviceStore?: boolean, isAuthenticated?: boolean, cartCount?: number, signInPath?: string }} opts
 */
export const getStoreTabs = ({
  homePath = '/',
  serviceStore = false,
  isAuthenticated = false,
  cartCount = 0,
  signInPath = '/login',
} = {}) => {
  const [home, catalog, categories] = getStorePages({ homePath, serviceStore });
  return [
    { ...home, icon: Home },
    { ...catalog, label: serviceStore ? 'Services' : 'Shop', icon: serviceStore ? ClipboardList : ShoppingBag },
    { ...categories, icon: LayoutGrid },
    {
      key: 'cart',
      label: 'Cart',
      to: '/cart',
      icon: ShoppingCart,
      badge: cartCount > 99 ? '99+' : cartCount || null,
      ariaLabel: cartCount ? `Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}` : undefined,
    },
    isAuthenticated
      ? { key: 'account', label: 'Account', to: '/account', icon: User }
      : { key: 'account', label: 'Sign in', to: signInPath, icon: User },
  ];
};

/**
 * The bar itself. The template preview renders it with `interactive={false}`.
 * @param {{ store: object, tabs: object[], activeKey?: string, hidden?: boolean, interactive?: boolean }} props
 */
export const StoreTabBarView = ({ store, tabs, activeKey, hidden = false, interactive = true }) => {
  const { dark } = getTemplateTheme(store?.templateId);

  return (
    <nav
      aria-label="Store"
      style={buildStoreColorCssVars(store?.templateId, store || {})}
      className={cn(
        'store-tab-bar fixed inset-x-0 bottom-0 z-40 border-t lg:hidden',
        dark ? 'border-white/10 bg-slate-950' : 'border-slate-200 bg-white',
        hidden && 'invisible',
      )}
    >
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map(({ key, label, to, icon: Icon, badge, ariaLabel }) => {
          const active = key === activeKey;
          const className = cn(
            'relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors',
            dark ? 'text-slate-400' : 'text-slate-500',
            active && (dark ? 'text-[color:color-mix(in_srgb,var(--store-accent,#f59e0b)_60%,white)]' : brandAccent.textStrong),
          );
          const content = (
            <>
              {active ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--store-accent,#166534)]" /> : null}
              <span className="relative">
                <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
                {badge ? (
                  <span key={badge} className="sf-bump absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-950">
                    {badge}
                  </span>
                ) : null}
              </span>
              {label}
            </>
          );
          return (
            <li key={key} className="min-w-0 flex-1">
              {interactive ? (
                <Link
                  to={to}
                  className={className}
                  aria-label={ariaLabel}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => window.scrollTo(0, 0)}
                >
                  {content}
                </Link>
              ) : <span className={className}>{content}</span>}
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

/** Online Store bottom bar on phones and tablets. Mounted once per app so it stays put between pages. */
export default function StoreTabBar() {
  const location = useLocation();
  const { store } = useOnlineStoreChrome();
  const { isSingleStoreMode, storeSlug, pathPrefix, isCustomDomain } = useStorefrontMode();
  const { cartSummary } = useCart();
  const { isAuthenticated } = useStorefrontAuth();
  const isTyping = useIsTyping(location.key);

  // On a shop's own pages, never show the bar of the shop browsed before it.
  const isCurrentStore = Boolean(store) && (
    isStorefrontCommercePath(location.pathname)
    || String(storeSlug || '').toLowerCase() === String(store.slug).toLowerCase()
  );
  const visible = isSingleStoreMode && isCurrentStore && hasStoreTabBar(location.pathname, { isCustomDomain });

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('sf-tab-bar', visible);
    return () => root.classList.remove('sf-tab-bar');
  }, [visible]);

  if (!visible) return null;

  const returnTo = `${location.pathname}${location.search || ''}`;
  const tabs = getStoreTabs({
    homePath: resolveSingleStoreHomePath({ storeSlug: store.slug, pathPrefix, isCustomDomain, pathname: location.pathname }),
    serviceStore: isServiceStore(store),
    isAuthenticated,
    cartCount: cartSummary?.itemCount || 0,
    signInPath: `/login?returnTo=${encodeURIComponent(returnTo)}`,
  });

  return (
    <>
      <div className="store-tab-bar-space lg:hidden" aria-hidden="true" />
      <StoreTabBarView store={store} tabs={tabs} activeKey={getActiveStorePage(location.pathname)} hidden={isTyping} />
    </>
  );
}
