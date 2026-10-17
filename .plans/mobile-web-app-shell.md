# Web app behaves like the mobile app on phones and tablets

**Decisions (2026-10-17)**
- Build an app-style shell inside `Frontend/` (not the Expo app on web).
- Applies to phones and all tablets, including iPad landscape: `(max-width: 1023.98px), (pointer: coarse) and (max-width: 1366px)`. Desktops/laptops keep the sidebar.
- Web-only pages stay reachable on phones under **More → Business tools**.
- On for everyone, no feature flag.

## Done — Phases 0 and 1 (ship together)

**Foundations**
- `hooks/useDeviceMode.js` — one `matchMedia` store: `phone` (<768) / `tablet` / `desktop`, `isAppShell`. Tailwind variants `shell:` and `desk:` use the same queries (`tailwind.config.js`; a unit test keeps them in sync).
- `useResponsive` and `useSafeAreaInsets` now share one listener each instead of one per component.
- Inputs/textareas: 16px on phones and tablets (no iOS zoom on focus) unless the caller sets a size (`lib/inputFontSize.js`).
- Phone CSS block now ends at 767.98px (matches JS); the blanket button/link rules are wrapped in `:where()` so Tailwind classes win.
- App shell: the window scrolls (was `#root` on phones), no sideways scroll, no rubber-band.
- Toasts top-centre in the app shell.
- DashboardTable shows cards wherever the app shell is used (iPad landscape too).

**Shell**
- `config/navigation.js` — menu + quick actions moved out of `Sidebar.jsx` (was copy-pasted into the old mobile drawer, now deleted). `hooks/useWorkspaceNav.js` shares them.
- `config/appShellNav.js` — tab bar and More sheet, mirroring `mobile/app/(tabs)/_layout.tsx` and `mobile/utils/moreMenuItems.ts`:
  - Dashboard · focus slot (Customers) · centre (Sell / Add Job / New rental) · Invoices (or Orders) · More
  - Simple Mode: Home · Sales · Sell · Expenses · More (tiles). Drivers: Deliveries · Account.
  - More sections: main, Store, Work, Reports, Business tools, Account. Every page in the member's menu is reachable (unit-tested).
- Focus areas read from `/settings/focus-areas` (`config/focusAreas.js`, `hooks/useFocusAreas.js`); `mobile/__tests__/webParity.test.ts` checks the web copy matches mobile.
- `components/layout/AppHeader.jsx` — root pages: logo, workspace/scope switcher, iBIS, bell, account menu, page search. Inner pages (`config/appShellRoutes.js`): back button + title.
- `AppTabBar`, `MoreMenuSheet`, `ShellPullToRefresh` (refetches active queries; pages using `usePullToRefresh` still get their callback), `useShellScrollMemory` (per-tab and back/forward scroll), tab bar hides while typing.
- iBIS floating button and hard-refresh button removed in the app shell.
- `/jobs?add=1` opens the new-job form (centre button; the desktop "New job" quick action now opens it too).

**Tests**
- `Frontend/src/__tests__/config/appShellNav.test.js` (39 tests).
- `e2e/tests/mobile-shell.spec.js` — `cd e2e && npx playwright test -c playwright.mobile.config.js`. No backend: API calls are answered in the browser. Projects: desktop, Pixel 7, iPhone 13, iPad Mini, iPad Pro 11 landscape (Chromium).
- Desktop screenshots before/after were pixel-identical.

## Next

**Phase 2 — screens behave like native**
1. Back button closes sheets (history entry per open sheet/drawer/filter).
2. Lists: tap card to open (`onCardClick`), filter chips, infinite scroll in `MobileCardView`.
3. DetailsDrawer → full-screen page with back header + sticky actions in the app shell.
4. Rentals (12 dialogs incl. checkout) and Materials (6) → `MobileFormDialog`.
5. POS as a `/pos` route in the app shell; fix POS header overflow on phones (Online pill / Stay open switch run off-screen — existed before).
6. Native-style mobile Dashboard.
7. Confirmations as bottom action sheets.
8. Remaining raw tables (Watch, Messages, settings Billing/Payments/Delivery rules) → cards.

**Phase 3 — PWA**: manifest (drop portrait lock, `id`, fix `/pos` and `/foot-traffic` shortcuts, maskable icons, screenshots), 180px touch icon, SPA navigation fallback + offline page in `sw.js`, persisted query cache.

**Phase 4 — polish**: page transitions, skeletons, vibration, web push, offline sales queue.

## Known issues found along the way
- **Desktop:** header menus (account, bell) open off-screen when the page is scrolled. Cause: `html { overflow-y: scroll }` in `index.css` breaks Radix/floating-ui positioning. Fixed in the app shell only; on desktop, removing that rule fixes it (`* { scrollbar-gutter: stable }` already prevents layout shift) but changes the empty-scrollbar look on short pages.
- Main tour copy still says "sidebar"; steps without a target are skipped, so phones get a shorter tour.
