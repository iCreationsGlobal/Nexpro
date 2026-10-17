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

## Done — Phase 2 (screens behave like native)

- **Back closes overlays** (`hooks/useBackToClose.js`): every Dialog, Sheet and AlertDialog adds a history entry while open in the app shell, so the Android back button / iOS back gesture closes it instead of leaving the page — including the full-screen POS. Closing another way pops the entry; nested overlays close one at a time. URL-driven dialogs opt out with `disableBackClose` (Marketing campaign dialog).
- **Tap a card to open it**: inside phone/tablet cards, `ActionColumn` hands its View action to the card (`components/cardTapContext.js`) — no full-width View buttons. Taps on buttons/links inside a card still do their own thing.
- **Detail drawers are full-screen pages on phones** (slide in from the right, round back button, title, sticky actions, safe areas). Tablets/desktop keep the side panel.
- **Forms are bottom sheets on phones**: base `DialogContent` below 640px is a 94%-height sheet (was full screen) — covers Rentals, Materials and every other plain dialog without page changes.
- **Confirmations are action sheets on phones**: `AlertDialogContent` below 640px rises from the bottom with full-width buttons.
- `/pos` redirects to the point of sale (fixes the manifest shortcut); POS content no longer runs off the right edge below 1024px.
- Watch incidents are cards on phones/tablets; other wide tables scroll sideways inside their card.
- Desktop dialogs, drawers and confirms checked pixel-identical before/after.

Not done from the original Phase 2 list (follow-ups):
- Filter chips instead of filter sheets, and infinite scroll in `MobileCardView` (both need per-page work; lists still page with Previous/Next).
- Native-style Dashboard redesign (the current phone dashboard already has period tabs, 2×2 stats, AI insight and recent sales).

## Next

**Phase 3 — PWA**: manifest (drop portrait lock, `id`, remove `/foot-traffic` shortcut, maskable icons, screenshots), 180px touch icon, SPA navigation fallback + offline page in `sw.js`, persisted query cache.

**Phase 4 — polish**: page transitions, skeletons, vibration, web push, offline sales queue.

## Known issues found along the way
- **Desktop:** header menus (account, bell) open off-screen when the page is scrolled. Cause: `html { overflow-y: scroll }` in `index.css` breaks Radix/floating-ui positioning. Fixed in the app shell only; on desktop, removing that rule fixes it (`* { scrollbar-gutter: stable }` already prevents layout shift) but changes the empty-scrollbar look on short pages.
- Main tour copy still says "sidebar"; steps without a target are skipped, so phones get a shorter tour.
- `pages/Customers.jsx` calls `settingsService.getPrintConfig()`, which does not exist (throws when a customer is opened; the drawer still works). Likely meant `getPOSConfig()`.
