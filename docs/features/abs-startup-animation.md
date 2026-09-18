# ABS startup animation

The startup overlay follows the September 16 reference: deep green, a steady ABS identity near the middle, subtle African-inspired geometric motifs across the lower half, and a lime loading line. Locally bundled SVG motifs move and fade in three independent native-driven animation groups. No artwork network requests or custom font downloads are needed. The logo symbol is the existing recreated vector; the BS lettering uses the system font.

Session providers and font loading run underneath the overlay. Once fonts/session are ready and the initial route resolves, the overlay fades out in 180 ms without waiting for the decorative animation. Reduced-motion settings keep the pattern and indicator still, including when that setting changes while the screen is visible. Animation loops stop on unmount. Later loading screens use the static composition.

Native splash plugin settings retain the same green and bundled symbol. Expo Go shows the new composition after its own native splash. Changing the installed app's OS launch screen requires a native rebuild.

Validation: startup readiness and scan-session regression tests pass (6 tests). No TypeScript diagnostics reference AppLoadingScreen or bootPattern; unrelated existing project diagnostics remain. Physical device verification of the animation and OS splash handoff remains necessary.

## Essential data handoff

The cold-launch overlay now observes the mounted dashboard's scoped React Query request. It reveals cached data immediately, or waits for the first result, error, offline pause, or a four-second deadline. Workspace restoration is included in that deadline. Login, onboarding, and direct links to other screens bypass the dashboard gate. Existing configuration queries continue underneath the overlay; no duplicate dashboard request is issued.

Once the dashboard is revealed, first-page products (20) and customers (20) are prefetched sequentially with their destination query keys and feature permissions. Optional warmup skips offline connections, cache restoration, and unresolved workspaces. Scope changes stop the old sequence from starting another request. The full POS catalogue is not downloaded during startup. Existing cache freshness and stock validation behavior is unchanged.

Validation: 11 startup readiness/data and pagination tests passed. Full typechecking still reports unrelated existing errors; the changed startup files have no diagnostics. Device startup timing has not yet been measured.

The pattern now uses downloaded Adinkrahene, Nyansapo and Dwennimmen SVGs from Wikimedia Commons instead of the original geometric approximations. Original files and licensing/source records are in `mobile/assets/boot/adinkra/`. Recolored vectors stay bundled offline and retain the same three-layer animation. The combined SVG layers were rendered to verify their geometry and tint.

### Dashboard-ready handoff revision

The four-second automatic release has been removed. A normal dashboard launch now waits for usable data in the actively observed, workspace-scoped overview query. Failed/offline requests remain behind startup; after 15 seconds (or an error/offline pause), recovery controls offer retry or an explicit “Open app anyway” escape. Cached overview data can still open immediately. Background prefetches and refreshes with existing data no longer count toward the connectivity banner's slow-request warning. Seven readiness regression tests pass; no changed-file type errors were reported.
