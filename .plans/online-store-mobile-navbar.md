# Online Store: navbar on phones and tablets

**Decisions (2026-11-24)**
- Bottom navbar with five tabs: Home, Shop, Categories, Cart, Account. Service stores show Services instead of Shop; signed-out shoppers see Sign in instead of Account.
- About Us, Reviews, Track order and Contact us are in the full-screen menu. Wishlist stays under Account.
- Phones and tablets below 1024px, where the computer menu disappears. Computers and the Sabito marketplace are unchanged.
- No bar on checkout, payment callback, sign-in, sign-up and password pages. Order confirmation has it.
- On for every store, no setting.

**How it works** (`storefront/src/online-store/`)
- `storeNavigation.js` — pages, active tab, and which paths have the bar.
- `StoreMobileHeader.jsx` — one-row header, search and menu, used by the store, product, service, cart and account pages. It reports its store to `OnlineStoreChromeContext`.
- `StoreTabBar.jsx` — the bar. Mounted once per app by `OnlineStoreChrome`, so it stays put between pages. Hides while typing and while a dialog is open.
- `html.sf-tab-bar` and `--sf-tab-bar` (`index.css`) reserve the space and lift toasts and the connection banner.
- `StoreTemplateShell` shows the same header and bar, not clickable, in template previews.

**Rules worth keeping**
- The menu must not be inside the header: a blurred header traps a fixed panel inside itself. That is why it used to show only two links.
- Dialogs on a page need `aria-modal="true"`, or the bar stays over them.
- `.sf-page-enter` uses `backwards`, not `both`, or dialogs get trapped inside the page area.

**Needs a real phone:** the on-screen keyboard and iPhone bottom spacing.
