# ABS mobile release audit — October 7, 2026

Target: `mobile/`, Expo project `8dff9445-6979-427f-b84e-aae48f077d82`, bundle/package `com.absghana.app`. Web comparison: local `Frontend/` at commit `90abeef` plus current working tree. GitHub origin/main was checked and matches `90abeeffe46d2512b81ecfbe21d35802a14c72d4`. Existing unrelated automation edits were preserved.

## Corrections

- Added Furniture shop to mobile onboarding; the complete catalog matches web after translating the existing `printing_press` → `studio` workflow alias.
- Defaulted scanning to enabled, matching web. An explicit workspace disable still takes precedence.
- Fixed Dashboard → Quick Actions → View all and Back to menu destinations to open the shared menu instead of bouncing to Home.
- Added rental reminder/damage notification destinations, including rental metadata precedence over the related product.
- Added notification destinations for list links emitted by the backend (invoices, jobs, quotes, leads, expenses, customers, sales, tasks, rentals).
- Fixed already encoded notification IDs being encoded a second time; malformed escapes are ignored.
- Fixed type incompatibilities exposed by the installed Expo/React Native SDK, contact test fixtures, stored auth data, payment payloads, and invoice tax formatting. Native unspecified appearance now falls back to the light palette.
- Restricted the repository-root EAS archive to `mobile/` and excluded every local `.env*` variant. The first 946 MB upload was stopped; the corrected upload scope is 383 files / 48.9 MB uncompressed. EAS uses repository-root ignore rules even when launched in `mobile/`.
- Added `npm run check:release` and a mobile CI job covering static route checks, TypeScript, mobile tests, and web catalog/scanning parity.

## Validation scope

Static navigation checker: 158 literal/template/JSX targets matched 66 app routes. This includes literal paths, parameterized path templates, and JSX links; it checks existence, not runtime behavior, permissions, network responses, or dynamically constructed IDs.

Live read-only checks returned HTTP 200 for:

- `https://api.africanbusinesssuite.com/health` (reported production environment)
- `https://myapp.africanbusinesssuite.com`
- `https://store.absghana.com`
- `https://africanbusinesssuite.com/privacy`
- `https://africanbusinesssuite.com/terms`
- `https://africanbusinesssuite.com/data-deletion`

Release checks passed: 26 test suites / 146 tests, TypeScript, and static navigation. Expo production export succeeded for iOS, Android, and web. Local offline Expo dependency checks reported dependencies up to date (offline validation has limited reliability). A source check matched all 141 directly expressed mobile API calls to backend route methods/paths; calls built from conditional or variable expressions were outside this check.

HTTP status checks do not verify authenticated flows or customer-specific invoice tokens, shop slugs, and custom domains.

## Web parity boundaries

Recent web export remains web-only per the mobile scope rules. Bulk product image upload and bulk publish-to-store are present on web and currently absent from mobile; release scope was raised with the user. Single product image upload and existing store listing workflows remain available on mobile. This audit does not certify complete feature parity.

## Store readiness

The last inspected iOS production build was build 14, created August 19, 2026, on SDK 54. It predates the current changes (local project uses SDK 57). Do not submit that build with `--latest` for this release. Use a newly verified build ID explicitly.

New Android production build: [`8be2380c-c404-4e49-9e5c-0c71e848cfda`](https://expo.dev/accounts/eamankyim/projects/abs/builds/8be2380c-c404-4e49-9e5c-0c71e848cfda), version 1.0.0 / version code 4. Native build finished successfully. The aborted upload consumed version code 3 but did not create a build. New iOS production build: [`c81f0430-03ed-473a-9301-e6c0de2c76ce`](https://expo.dev/accounts/eamankyim/projects/abs/builds/c81f0430-03ed-473a-9301-e6c0de2c76ce), version 1.0.0 / build 15. Both build uploads completed. iOS native build finished successfully. App Store Connect submission failed twice: [`ab4b4ffe-8441-42f6-9713-48ffe5774103`](https://expo.dev/accounts/eamankyim/projects/abs/submissions/ab4b4ffe-8441-42f6-9713-48ffe5774103) and [`55771303-6f69-4a19-be19-41ce24b7ea83`](https://expo.dev/accounts/eamankyim/projects/abs/submissions/55771303-6f69-4a19-be19-41ce24b7ea83). Expo returned no error details/logs, and the waiting CLI returned only “Something went wrong when submitting your app to Apple App Store Connect.” No connected browser was available for dashboard diagnostics. The precise submission cause is unresolved; do not assume a code, credential, or version problem without evidence. Android native build also finished successfully. Neither store upload has completed.

The production EAS profile supplies the production API/store hosts and increments build versions remotely. iOS submission is configured for App Store Connect app `6775217082`; Android build signing was verified using the existing remote keystore. Android submission was attempted with the new build ID and failed before scheduling: “Google Service Account Keys cannot be set up in --non-interactive mode.” Configure the Google Play submission service account in EAS before retrying. No Android submission job was created.

Before public release, exercise a signed native build on devices: sign in/sign up/reset password, onboarding and workspace switching, simple/advanced mode, POS scan/manual lookup and checkout, products and images, invoices/payments/sharing, store orders, rentals, notification taps, contact permissions/import, and data deletion. Authenticated/device smoke testing is outstanding.


## Completed packages and next steps

- [iOS 1.0.0 build 15 IPA](https://expo.dev/artifacts/eas/BbnkD92oL0ubj9bt9yC0O2B8QuTzTnEgIpALgBh2a7c.ipa)
- [Android 1.0.0 version code 4 AAB](https://expo.dev/artifacts/eas/Zfr1Y2rSxNi8InwIiRDe3acM7lyssmgywsdf8pXDYHw.aab)

Both EAS builds have status `FINISHED`. Public publishing remains blocked by the submission issues above. Get the precise iOS failure reason from Expo/App Store Connect, configure the Android service account, and finish signed-device testing. The existing store version `1.0.0` was retained; no unsupported assumption about a closed version train or revoked credentials was made.

To configure an existing Google Play submission key, use `eas credentials --platform android` from `mobile/` and select the Google service account submission credentials. Do not use an unrelated Firebase key.

After resolving the platform blockers, retry using the verified build IDs:

```bash
cd mobile
eas submit --platform ios --id c81f0430-03ed-473a-9301-e6c0de2c76ce --profile production --wait
eas submit --platform android --id 8be2380c-c404-4e49-9e5c-0c71e848cfda --profile production --wait
```
