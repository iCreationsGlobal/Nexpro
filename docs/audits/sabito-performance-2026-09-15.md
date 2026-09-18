# Sabito web and mobile performance

## Changes

- Mobile business cards use FlatList virtualization (six initial cards, six per batch, seven viewport windows). Existing filters, selection/navigation and pull-to-refresh remain.
- Dashboard startup no longer fetches statistics and referrals both during session initialization and again on focus.
- Dashboard polling skips background app states and overlapping polls; returning to the foreground refreshes the data. Animation loops clean up on unmount.
- Web API shares identical simultaneous GET requests within the browser, keyed by endpoint, API base and authentication token. Responses are not retained after requests finish. Requests with custom options/signals are not merged. Mutations clear the in-flight index so later reads cannot join older requests.

## Evidence and limits

Web lint, 14 tests and the Webpack production build pass. Tests cover concurrent request reuse, session isolation, refreshing after completed reads and separating reads across mutations, as well as existing account and commission contracts. Sabito mobile TypeScript passes. Android/iOS/web JavaScript export was verified; no native release build or physical-device profiling was performed.

These changes remove duplicate work and bound list rendering. They do not establish a measured improvement in startup seconds, network latency or frame rate. Next validation should measure cold startup, large-list scrolling, foreground/background refresh, account switching and payout changes on a release build against staging.
