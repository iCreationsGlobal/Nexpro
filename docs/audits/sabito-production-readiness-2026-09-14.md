# Sabito production-readiness review — 14 September 2026

## Release decision

**Not approved for production yet.** Passing builds and service tests do not establish complete end-to-end behavior. This review covers the public website and signed-in marketer web app in `sabito-app`, the Expo client in `sabito-app-mobile`, and their ABS partner backend. It does not cover the separate buyer/store apps or nested legacy mobile copies.

## Changes made

- Added web password recovery, authenticated password changes and explicit account closure, using the same backend endpoints as mobile. Updated mobile confirmation validation and closure retention copy.
- Aligned signup password length with backend recovery: 8–128 characters. Kept confirmation validation on mobile; enforced registration bounds on the server.
- Corrected mobile earnings and cashout displays to use the marketer share, including an explicit zero. Cashout selection now excludes uncollected or already-reserved commissions, matching web and backend.
- Removed misleading Professional-plan withdrawal-fee copy from the active mobile cashout screen.
- Changed mobile payment setup to load the current server profile and show retryable failures; web profile editing now sends empty fields when clearing phone/payout details.
- Replaced unsupported React Native URL setters in local API resolution. Preserved explicit remote servers and excluded Metro tunnel hosts from API rewriting.
- Corrected shared mobile theme calls, dialog button types, Axios header assignment, notification behavior fields, and several current profile/navigation declarations.
- Added a working web ESLint configuration. Moved loading resets to retry actions and subscribed to browser auth state rather than copying local storage into state through effects. Web account navigation now reacts to token changes.
- Added cross-client commission eligibility/share tests and password-recovery API contract tests; registration-boundary tests run without live accounts.
- Updated Next.js and its lint configuration from 16.1.3 to 16.3.5, Nodemailer from 8 to 10.0.10, and compatible dependency patches. Nodemailer now requires Node 20 or newer; local validation used Node 20.19.6.
- Retired 28 unreachable legacy mobile modules after checking the active import graph; see `sabito-retired-legacy-modules.md`. Fixed remaining active navigation/API contracts without excluding active code from TypeScript.
- Aligned mobile legal links with website routes and made their domain configurable through `EXPO_PUBLIC_SABITO_SITE_URL`. Its default preserves the existing share-link domain, `https://sabito.app`; deployment still needs confirmation.
- Changed public “AI Match” labels to “Partner search” and keyword-search guidance to match the implemented service; retained existing URLs.
- Added `.github/workflows/sabito.yml` for web lint/tests/build, mobile types/API-address checks/exports and the isolated partner journey. The workflow has not yet run on GitHub.

## Flow evidence and remaining verification

| Flow | Local evidence | Still required |
| --- | --- | --- |
| Website → login/signup → intended destination | Routes build; redirect safety utility tests pass | Browser navigation, accessibility, small-screen review |
| Marketer signup | Shared endpoint and payload checked; in-memory signup journey and bounds tests pass | Staging signup from browser and real iOS/Android devices |
| Login, persistence, logout, expired sessions | Web token subscription and mobile endpoint/storage flow reviewed | Cross-tab logout, cold starts, expiry and offline recovery on devices |
| Password recovery | Web screen added; request/reset contract tests pass; backend has reset-code expiry/attempt handling | Staging email delivery, wrong/expired/reused-code UI behavior |
| Discover → apply → approve partnership | Shared endpoint contracts; partner service/journey tests pass | Browser/mobile application states; tenant-side approval UI |
| Referral creation → customer match → project progress | In-memory integrated journey passes | Real database isolation/concurrency and cross-client refresh behavior |
| Payment → commission → remittance | Service tests cover attribution, fee split and payment replay | Staging provider callbacks, concurrent requests and deployed migrations |
| Earnings → cashout | Web/mobile parity tests and backend lock/idempotency tests pass | Real-device confirmation screens and staging settlement lifecycle |
| Profile/payout updates | Fresh mobile profile load; clearing web fields fixed | Edit on one client and verify on the other; payout validation UX |
| Account security/deletion | Web/mobile controls and authenticated API contract checks; 8 backend account-security tests pass | Staging reset-email delivery, session revocation and closure confirmation on each client |
| Marketing claims | Public partner-search wording now reflects keyword discovery; unused mobile AI/rating/professional stubs retired | Product-owner review of all promotional and legal copy |
| Branding | Existing assets retained | Supplied new logo still needs its actual source asset in the workspace |

## Verification

- Backend: **64 tests in 12 suites pass**, covering the isolated partner journey, partner services, account security, email templates/service and email settings. Persistence and payment providers are mocked; these are not deployed end-to-end tests. Nodemailer JSON transport smoke test passes without sending email.
- Web: **11 utility/API contract tests pass**. ESLint passes. Production build passes with the Webpack fallback (`npx next build --webpack`). The default Turbopack build encounters an environment port-binding denial, including the permission-expanded retry; verify the default build in CI.
- Mobile: full `tsc --noEmit` passes with no type exclusions added; **6 API address checks pass**; **Expo Doctor 21/21 passes**.
- Android, iOS and web JavaScript exports pass. These do not establish native compilation, store acceptance or physical-device behavior.
- Production dependency audits (`npm audit --omit=dev`): web **0 advisories**; mobile **21 moderate, 0 high/critical**; backend **4 moderate, 0 high/critical**. These counts are npm findings, not a complete security assessment. Backend findings involve `qs`, `uuid`, and their `exceljs`/`sequelize` dependency paths. Compatible `qs` update did not resolve its finding. Do not force suggested downgrades of core frameworks/ORMs to silence advisories; remaining findings need exposure review and supported upgrades.
- No browser runtime is connected; visual/interactive checks could not run.

## Remaining release gates

1. Confirm deployed website/API URLs and provide staging. Verify migrations, HTTPS/CORS, environment variables, password-reset delivery, logging, monitoring and rollback there. The configured API host is not evidence of the intended deployment.
2. Exercise signup → partnership approval → referral → payment → commission → remittance → cashout with isolated staging records in browser, iOS and Android. Include invalid input, duplicate submissions, session expiry, offline recovery, stale balances and edits made from another client. Real database concurrency and row locks remain unverified.
3. Review remaining moderate dependency findings and verify the default web build in CI. Check deployment Node compatibility after the Nodemailer update.
4. Produce and test native release builds following the Expo SDK upgrade. Review native projects/config, deep links, permissions and privacy disclosures. `eas.json` still contains a placeholder iOS App Store ID (`1234567890`) and a production Android APK setting; resolve actual store identifiers and choose an app-bundle profile for Play distribution before submission. No submission has been attempted.
5. Provide the actual new logo source asset for the requested web rebrand, then verify its rendering in browser.

No production accounts were created, emails sent, payments requested, migrations executed or deployments performed during this review.
