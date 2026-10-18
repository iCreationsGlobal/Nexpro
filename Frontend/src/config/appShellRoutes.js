import { SETTINGS_HUB_CARDS } from '@/utils/settingsRoutes';
import { isNavPathActive, navBasePath } from '@/config/appShellNav';

/**
 * Header and tab-bar behaviour per route in the phone/tablet app shell.
 *
 * - root: a destination on the tab bar or in the More sheet → app header (logo, workspace,
 *   bell, avatar, page search).
 * - inner: anything reached from a root (settings sections, editors, profile…) → back button
 *   and title, like the native app's stack pages.
 */

const SETTINGS_TITLES = Object.fromEntries(SETTINGS_HUB_CARDS.map((card) => [card.slug, card.title]));

/**
 * Pages with their own sub-navigation that stay "root" for every sub-path
 * (the same component renders /messages/templates, /marketing/campaigns/1, …).
 */
const ROOT_PREFIXES = ['/messages', '/marketing', '/store/dashboard', '/reports', '/compliance'];

/**
 * Inner pages: [pattern, title, back target, extra].
 * `hideTabBar`: the page has its own bottom action bar (editors, wizards).
 */
const INNER_ROUTES = [
  [/^\/profile$/, 'Profile', '/settings'],
  [/^\/settings$/, 'Settings', '/dashboard'],
  [/^\/settings\/([^/]+)$/, (match) => SETTINGS_TITLES[match[1]] || 'Settings', '/settings'],
  [/^\/sales\/returns$/, 'Returns', '/sales'],
  [/^\/dealers\/[^/]+\/prices$/, 'Dealer prices', '/dealers'],
  [/^\/store\/setup$/, 'Store setup', '/store', { hideTabBar: true }],
  [/^\/store\/listings\/[^/]+\/edit$/, 'Edit listing', '/store/listings', { hideTabBar: true }],
  [/^\/store\/listings\/[^/]+\/published$/, 'Listing published', '/store/listings'],
  [/^\/store\/services\/[^/]+\/edit$/, 'Edit service', '/store/services', { hideTabBar: true }],
  [/^\/plans$/, 'Plans', '/settings'],
  [/^\/checkout$/, 'Checkout', '/plans', { hideTabBar: true }],
];

const titleCase = (segment = '') =>
  segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * @param {string} pathname
 * @param {object} args
 * @param {Array<{ to?: string, label: string }>} args.destinations - Tab bar + More sheet entries
 * @returns {{ kind: 'root'|'inner', title: string, backTo: string|null, hideTabBar: boolean }}
 */
export function getAppShellRouteMeta(pathname = '/', { destinations = [] } = {}) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  const exactRoot = destinations.find((item) => item.to && navBasePath(item.to) === path);
  if (path === '/' || path === '/dashboard') {
    return { kind: 'root', title: 'Dashboard', backTo: null, hideTabBar: false };
  }
  if (exactRoot) {
    return { kind: 'root', title: exactRoot.label, backTo: null, hideTabBar: false };
  }

  for (const [pattern, title, backTo, extra = {}] of INNER_ROUTES) {
    const match = path.match(pattern);
    if (match) {
      return {
        kind: 'inner',
        title: typeof title === 'function' ? title(match) : title,
        backTo,
        hideTabBar: Boolean(extra.hideTabBar),
      };
    }
  }

  if (ROOT_PREFIXES.some((prefix) => isNavPathActive(path, prefix))) {
    const owner = destinations
      .filter((item) => item.to && isNavPathActive(path, item.to))
      .sort((a, b) => navBasePath(b.to).length - navBasePath(a.to).length)[0];
    return {
      kind: 'root',
      title: owner?.label || titleCase(path.split('/')[1]),
      backTo: null,
      hideTabBar: false,
    };
  }

  // Unknown sub-page: back to the closest destination above it.
  const parent = destinations
    .filter((item) => item.to && isNavPathActive(path, item.to))
    .sort((a, b) => navBasePath(b.to).length - navBasePath(a.to).length)[0];
  const segments = path.split('/').filter(Boolean);
  return {
    kind: 'inner',
    title: parent?.label || titleCase(segments[segments.length - 1]),
    backTo: parent ? navBasePath(parent.to) : '/dashboard',
    hideTabBar: false,
  };
}
