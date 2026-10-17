import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Download } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePWAInstall } from '@/context/PWAInstallContext';
import { findActiveNavId } from '@/config/appShellNav';
import { cn } from '@/lib/utils';
import { NavMenuIcon } from './Sidebar';

/**
 * The More tab's menu (phones and tablets): every page that is not on the tab bar, in the native
 * app's sections, plus the web-only pages under Business tools. Simple Mode shows big tiles.
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {Array} props.sections - From buildMoreMenuSections
 * @param {boolean} [props.simple] - Simple Mode tiles
 */
export default function MoreMenuSheet({ open, onOpenChange, sections, simple = false }) {
  const location = useLocation();
  const { canInstall, promptInstall } = usePWAInstall();
  const allItems = sections.flatMap((section) => section.items);
  const activeId = findActiveNavId(location.pathname, allItems);
  const close = () => onOpenChange(false);
  const contentRef = useRef(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Focus the sheet itself (not the close button) so no focus ring flashes on open. */}
      <SheetContent
        ref={contentRef}
        side="bottom"
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
        className="flex max-h-[90dvh] flex-col gap-0 rounded-t-2xl p-0 outline-none shell:mx-auto shell:max-w-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex flex-shrink-0 justify-center pt-3 pb-1" aria-hidden>
          <div className="h-1.5 w-12 rounded-full bg-muted" />
        </div>
        <SheetHeader className="flex-shrink-0 px-5 pb-3 text-left">
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="sr-only">All pages in your workspace</SheetDescription>
        </SheetHeader>

        <nav aria-label="All pages" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
          {simple ? (
            <div className="grid grid-cols-2 gap-3 px-1 pt-1">
              {allItems.map((item) => (
                <Link
                  key={item.id}
                  to={item.to}
                  onClick={close}
                  className={cn(
                    'flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-2xl border border-transparent p-4 text-center text-base font-semibold',
                    item.tone || 'bg-muted text-foreground'
                  )}
                >
                  <NavMenuIcon icon={item.icon} className="h-10 w-10" />
                  <span className="leading-snug">{item.label}</span>
                </Link>
              ))}
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.id} className="mb-2">
                {section.title ? (
                  <h3
                    id={`more-section-${section.id}`}
                    className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {section.title}
                  </h3>
                ) : null}
                <ul
                  className="space-y-0.5"
                  aria-labelledby={section.title ? `more-section-${section.id}` : undefined}
                >
                  {section.items.map((item) => {
                    const active = item.id === activeId;
                    return (
                      <li key={item.id}>
                        <Link
                          to={item.to}
                          onClick={close}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-medium transition-colors',
                            active ? 'bg-brand text-white' : 'text-foreground hover:bg-muted active:bg-muted'
                          )}
                        >
                          <NavMenuIcon
                            icon={item.icon}
                            className={cn('h-5 w-5 flex-shrink-0', active ? 'text-white' : 'text-muted-foreground')}
                          />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          <ChevronRight className={cn('h-4 w-4 flex-shrink-0', active ? 'text-white/80' : 'text-muted-foreground/60')} />
                        </Link>
                      </li>
                    );
                  })}
                  {section.id === 'account' && canInstall ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          close();
                          promptInstall();
                        }}
                        className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[15px] font-medium text-foreground transition-colors hover:bg-muted active:bg-muted"
                      >
                        <Download className="h-5 w-5 flex-shrink-0 text-green-600" />
                        <span className="min-w-0 flex-1 truncate">Install app</span>
                      </button>
                    </li>
                  ) : null}
                </ul>
              </div>
            ))
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
