import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Lock } from 'lucide-react';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useSimpleMode } from '@/hooks/useSimpleMode';
import { useWorkspaceBrand } from '@/hooks/useWorkspaceNav';
import { lockSimpleMode } from '@/components/simple/SimpleModePinGate';
import NotificationBell from '@/components/NotificationBell';
import SidebarScopeSwitcher from '@/components/SidebarScopeSwitcher';
import AppLogo from '@/components/AppLogo';
import SmartSearchField from './SmartSearchField';
import UserMenu from './UserMenu';

/** Round 40px icon button matching NotificationBell. */
const headerIconButtonClass =
  'relative flex h-10 w-10 min-h-0 min-w-0 shrink-0 items-center justify-center rounded-full bg-muted/60 p-0 text-foreground transition-colors hover:bg-muted active:bg-muted';

const safeAreaPadding = {
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingLeft: 'env(safe-area-inset-left, 0px)',
  paddingRight: 'env(safe-area-inset-right, 0px)',
};

/**
 * Leave an inner page: back through history when we came from inside the app, otherwise to the
 * page's parent (deep link or fresh tab).
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {string|null} fallback
 */
function goBack(navigate, fallback) {
  const idx = window.history.state?.idx;
  if (typeof idx === 'number' && idx > 0) {
    navigate(-1);
    return;
  }
  navigate(fallback || '/dashboard', { replace: true });
}

/**
 * Header for phones and tablets.
 * - root pages (tab bar / More destinations): logo and workspace, notifications, account
 * - inner pages: back button and title
 * Both show the page's search field when the page registered one.
 * @param {object} props
 * @param {{ kind: 'root'|'inner', title: string, backTo: string|null }} props.meta
 */
export default function AppHeader({ meta }) {
  const navigate = useNavigate();
  const simpleMode = useSimpleMode();
  const { pageConfig } = useSmartSearch();
  const { appName, primaryColor, orgName, subtitle, showScopeSwitcher } = useWorkspaceBrand();
  const showSearch = Boolean(pageConfig) && !simpleMode.isRestricted;

  const actions = (
    <div className="flex flex-shrink-0 items-center gap-2">
      {!simpleMode.isSimple && (
        <div data-tour="header-notifications" className="inline-flex">
          <NotificationBell />
        </div>
      )}
      {simpleMode.isSimple && (
        <button type="button" onClick={lockSimpleMode} className={headerIconButtonClass} aria-label="Lock">
          <Lock className="h-5 w-5" />
        </button>
      )}
      <UserMenu compact />
    </div>
  );

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-border bg-card print:hidden"
      style={safeAreaPadding}
      data-app-header={meta.kind}
    >
      {meta.kind === 'inner' ? (
        <div className="grid h-14 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center px-2">
          <button
            type="button"
            onClick={() => goBack(navigate, meta.backTo)}
            className="flex h-11 w-11 min-h-0 min-w-0 items-center justify-center rounded-full border border-border bg-card p-0 text-foreground transition-colors active:bg-muted"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-center text-[17px] font-semibold text-foreground">{meta.title}</h1>
          <span aria-hidden />
        </div>
      ) : (
        <div className="flex h-14 items-center gap-2.5 px-4">
          <AppLogo alt={appName} className="h-9 w-9" />
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[15px] font-semibold" style={{ color: primaryColor }}>
              {appName}
            </span>
            {showScopeSwitcher ? (
              <SidebarScopeSwitcher organizationName={orgName} />
            ) : subtitle ? (
              <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
            ) : null}
          </div>
          {actions}
        </div>
      )}
      {showSearch ? (
        <div className="px-4 pb-2.5">
          <SmartSearchField inputClassName="h-10 min-h-[40px] border-transparent bg-muted/70" />
        </div>
      ) : null}
    </header>
  );
}
