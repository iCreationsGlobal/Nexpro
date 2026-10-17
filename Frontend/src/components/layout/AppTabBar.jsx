import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NavMenuIcon } from './Sidebar';
import { navBasePath } from '@/config/appShellNav';

/** Tab bar height above the home indicator; MainLayout pads the page by this much. */
export const APP_TAB_BAR_HEIGHT = 64;

/**
 * Bottom tab bar for phones and tablets (see buildTabBarItems for the slots).
 * @param {object} props
 * @param {Array} props.items
 * @param {string|null} props.activeId
 * @param {() => void} props.onOpenMore
 * @param {boolean} [props.moreOpen]
 * @param {boolean} [props.hidden] - Slide away (keyboard open, editor with its own action bar)
 */
export default function AppTabBar({ items, activeId, onOpenMore, moreOpen = false, hidden = false }) {
  const location = useLocation();

  const handleTabClick = (event, item) => {
    // Tapping the tab you are on scrolls back to the top, like the native app.
    if (activeId === item.id && navBasePath(item.to) === location.pathname && !location.search) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <nav
      aria-label="Main"
      data-app-tab-bar
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card transition-transform duration-200 print:hidden',
        hidden && 'pointer-events-none translate-y-full'
      )}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
      aria-hidden={hidden || undefined}
    >
      <ul className="mx-auto flex max-w-2xl items-stretch" style={{ height: APP_TAB_BAR_HEIGHT }}>
        {items.map((item) => {
          const active = item.action === 'more' ? moreOpen || activeId === item.id : activeId === item.id;

          if (item.center) {
            return (
              <li key={item.id} className="flex min-w-0 flex-1 justify-center">
                <Link
                  to={item.to}
                  aria-label={item.label}
                  className="-mt-5 flex min-h-0 min-w-0 flex-col items-center gap-0.5 p-0 text-[11px] font-medium text-muted-foreground"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-card bg-brand text-white transition-transform active:scale-95">
                    <NavMenuIcon icon={item.icon} className="h-7 w-7" />
                  </span>
                  <span className="max-w-full truncate leading-tight">{item.label}</span>
                </Link>
              </li>
            );
          }

          const content = (
            <>
              {item.tone ? (
                // Simple Mode: the item's colour behind its icon, like the Simple Mode menu.
                <span
                  className={cn(
                    'flex h-8 w-11 items-center justify-center rounded-xl border-[1.5px]',
                    item.tone,
                    active ? 'border-current' : 'border-transparent'
                  )}
                >
                  <NavMenuIcon icon={item.icon} className="h-5 w-5" />
                </span>
              ) : (
                <NavMenuIcon icon={item.icon} className="h-6 w-6" />
              )}
              <span className="max-w-full truncate px-1 leading-tight">{item.label}</span>
            </>
          );
          const className = cn(
            'flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-1 rounded-none bg-transparent p-0 text-[11px] font-medium transition-colors',
            active ? 'text-brand' : 'text-muted-foreground',
            item.tone && 'text-foreground'
          );

          return (
            <li key={item.id} className="flex min-w-0 flex-1">
              {item.action === 'more' ? (
                <button
                  type="button"
                  onClick={onOpenMore}
                  className={className}
                  aria-haspopup="dialog"
                  aria-expanded={moreOpen}
                >
                  {content}
                </button>
              ) : (
                <Link
                  to={item.to}
                  onClick={(event) => handleTabClick(event, item)}
                  className={className}
                  aria-current={active ? 'page' : undefined}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
