# ABS iOS crash investigation — October 9, 2026

User reports crashes on iOS in the latest release. Crash timing, installed build number, and App Store versus TestFlight distribution are not yet confirmed.

## Verified evidence

- Live EAS build records identify version 1.0.0 build 15 (`c81f0430-03ed-473a-9301-e6c0de2c76ce`, October 7) as the newest iOS build. It uses Expo SDK 57; the previous build 14 used SDK 54. Build success does not establish runtime stability or store availability.
- Downloaded and checked the actual build 15 IPA. ZIP integrity passes. Its Info.plist identifies build 15, minimum iOS 16.4, arm64, and camera, microphone, photo-library and contacts usage descriptions. These permission descriptions are present in the artifact.
- Packaged Expo.plist has `EXUpdatesEnabled: false`; an Expo OTA update is not enabled in this binary.
- Current local release checks pass: 158 static navigation targets, TypeScript, 26 suites / 146 tests. These checks do not reproduce a native device crash and do not prove the local working tree exactly matches the uploaded source.
- ABS `mobile/` has no Sentry dependency/configuration. Other Sabito apps' Sentry files do not provide ABS crash telemetry.
- No booted simulator or available connected iPhone was found. The previously paired iPhone 13 Pro Max is unavailable. No ABS crash report was found in the local diagnostic report search.

## Status and next evidence

Root cause remains unconfirmed. The SDK 54 → 57 change is a regression boundary to investigate, not an established cause. No speculative code change or release was made; existing working-tree changes were preserved.

Obtain the installed version/build and an iOS `.ips` crash report (or matching App Store Connect/TestFlight crash report). On the affected phone, look under Settings → Privacy & Security → Analytics & Improvements → Analytics Data for ABS. Also establish whether termination happens at launch, after authentication, or on a named screen. Symbolicate against the matching build and use the exception/termination reason to distinguish JavaScript fatal errors, native crashes, memory termination, and watchdog termination.
