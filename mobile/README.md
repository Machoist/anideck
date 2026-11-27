# AniDeck mobile prototype

Active mobile scope is **Android only**, per the user on 23 November 2026. iPhone development and testing are deferred; the existing iOS scaffold is retained for later. Version 0.1.10 adds full-viewport fullscreen video with overlaid controls and Fit/Fill cropping. [Fullscreen evidence](../docs/audits/MOBILE-FULLSCREEN-2026-11-26.md). Version 0.1.9 fixes Search focus restoration after title return and gives fullscreen the actual show/episode header. [Follow-up evidence](../docs/audits/MOBILE-SEARCH-RETURN-2026-11-26.md). The 0.1.8 presentation pass adds: an AniDeck Home panel, consistent cards/navigation, density-aware poster decoding and exact-source poster preference. Verified AniList editing, optional key accounts and live playback/local resume remain available. [Polish evidence](../docs/audits/MOBILE-POLISH-2026-11-25.md). This is not the complete mobile AniDeck release. Desktop source, packaging, saved profiles and server endpoints are unchanged by this mobile work.

## What works in this prototype

- Home connection icon or My list AniList action opens secure tracker sign-in. Approve AniDeck in the system browser, copy the access token and paste it only into the protected app screen. Viewer verification precedes encrypted storage. The separate tracker view loads 50-entry pages, statuses, episodes and decimal scores. Tap a row/pencil to edit; Save sends only reviewed changed fields after exact account/entry checks and verifies readback. Cancel never writes; uncertain outcomes require refresh before another edit. Failed pages retain loaded rows; rate limits pause reads. Disconnect leaves AniDeck accounts/local lists intact. Automatic browser return, reviewed imports and Kitsu connection are next. [Editing acceptance](../docs/audits/MOBILE-ANILIST-EDITING-2026-11-24.md). [Evidence and limits](../docs/audits/MOBILE-ANILIST-2026-11-24.md).

- Home's Your account icon opens optional AniDeck creation and existing-key sign-in. Keys use namespaced encrypted native storage; the account screen blocks screenshots and hides revealed keys on background. Copy/show are explicit actions, and signing out locally keeps the local list and cloud profile intact. Real user account recovery remains an acceptance check. [Account evidence and limits](../docs/audits/MOBILE-ACCOUNTS-2026-11-24.md).
- Live Home source picks and Continue watching, with independent retry states. Home feed and Search state stay mounted across tab changes; returning from a title refreshes saved progress without reloading the feed.
- Home, Search and My list bottom navigation. Public sample playback is available only in development through Home's More → Playback checks menu. Release/profile builds always hide it; the delivered 0.1.10 preview also sets ANIDECK_DIAGNOSTICS=false.
- Source-provided title artwork, synopsis, genres and facts. Details and episodes share one validated title-page request. Short or absent upstream descriptions remain honest; richer catalog enrichment is still pending.
- Episode lists render at most 50 actual entries per page, retaining original numbers and gaps. Pagination never invents episodes from a catalog total.
- Search Anikoto, manually choose the exact provider title, and browse its actual numbered episodes and supported audio. No episode cards are fabricated from catalog totals.
- Resolve a selected episode on the phone through a temporary native WebView, then play through the native video controller with the observed media request headers. Popups are denied; verification challenges are reported rather than bypassed.
- Load real English-preferred WebVTT/SubRip subtitles for provider playback. Missing tracks are reported; sample captions are never substituted for real episodes.
- Edit watch status, manually recorded episode count and personal score for a saved title. Scores move in 0.5 steps with Clear, Cancel and Save actions. These details are independent of resume positions and do not sync to trackers yet.
- Explicitly save a title to My list. SQLite stores its exact provider identity and separate resume checkpoints for each episode/audio choice. Playback alone does not silently add a show.
- Resume from My list after reopening. The current provider episode list is fetched again and an expiring stream is resolved afresh. Missing episodes keep their saved progress. Near-ended playback offers replay from the start; seeking never marks an episode watched.
- Public Flutter MP4 sample with bundled, explicitly illustrative WebVTT captions.
- Separate Apple HLS streaming sample, with an explicit HLS hint for native playback. Unsupported playback reports an error and retries the same selected source; it never substitutes a different video silently.
- Play/pause, replay after completion, scrubbing, bounded ten-second seeking, caption toggle and lifecycle pause.
- Fullscreen with the same media session, landscape layout, seeking and persistent caption selection, including system Back.
- Twenty-second initialization deadline, retry and generation checks for late completion after closing/replacing a player.

HLS compatibility is platform-specific. Native MP4/HLS sample checks and the real Anikoto search-to-playback UI pass on an Android API 36 emulator. Hell's Paradise episode 1 played at 1920×1080; its actual subtitle file contained 299 cues, with a visible English cue after seeking several minutes ahead. My list reopened that episode at 3:12, and generated progress survived two independent Android app launches. This does not establish every title/source, iPhone compatibility or audible physical-phone sound. Kitsu connection, automatic watched-episode tracking, local-list sync/import, casting and mobile Watch Together are not implemented yet. Provider selection is manual; automatic AniList-to-provider identity mapping remains open.

SQLite schema v2 upgrades the existing database filename in place; prior shows/resume points are retained, with new manual fields initially Planning / zero / unrated. Cancel does not write; saving edits does not alter a resume point. Account keys and AniList tokens never enter SQLite; their encrypted namespaces are separate. AniList now supports explicitly reviewed edits with readback; tracker sync and Kitsu connection are not included yet. Android automatic app backup is disabled to prevent restoring encrypted credentials without the original device's Keystore material; the private key is the account recovery method.

The local database belongs to this Android preview app. It contains no credentials, signed streams or embeds. Checkpoints save every ten seconds and on pause/background/normal player exit. A sudden process kill can lose the latest unsaved interval; clearing app data or uninstalling removes the local database. Errors are shown rather than reporting a successful save. This is device-local resume, not account backup or tracker progress sync.

The native WebView plugin is pinned to official `flutter_inappwebview` **6.2.0-beta.3**. Stable 6.1.5 failed with the generated AGP 9.3.1 project because its Android dependency uses a removed ProGuard default; the pinned upstream beta fixes that build incompatibility. Review this prerelease dependency before distribution. No dependency-cache patch or build-tool downgrade is used.

## Toolchain and commands

Created with Flutter **3.50.1**, Dart **3.14.0**, official SDK revision `ae9b586f34a8443573f82ef57c3bf914a908cbf7`. App dependencies are locked in `pubspec.lock`. This Flutter SDK uses the extracted official Material UI package. The Flutter SDK, pub cache and generated build artifacts are not part of the app source.

On this Windows workspace, the SDK is at `C:\Users\Macho\Documents\Codex\toolchains\flutter` and the pub cache beside it. No system PATH change is required. From this directory:

```powershell
.\tools\flutter.ps1 pub get
.\tools\flutter.ps1 analyze
.\tools\flutter.ps1 test
.\tools\flutter.ps1 test integration_test/playback_test.dart -d emulator-5556
.\tools\flutter.ps1 test integration_test/provider_ui_test.dart -d emulator-5556
.\tools\flutter.ps1 test integration_test/library_persistence_test.dart --no-uninstall --dart-define=LIBRARY_PHASE=write -d emulator-5556
.\tools\flutter.ps1 test integration_test/library_persistence_test.dart --no-uninstall --dart-define=LIBRARY_PHASE=read -d emulator-5556
.\tools\flutter.ps1 build apk --debug
.\tools\flutter.ps1 run -d web-server --web-hostname 127.0.0.1 --web-port 48931
```

The wrapper uses `ANIDECK_FLUTTER_SDK`, then `FLUTTER_ROOT`, then this workspace's local SDK or an existing PATH command. It detects the workspace-local Android SDK and JDK when no environment override is present, and keeps Gradle/pub caches alongside the SDK. It restores the prior environment after invocation. It does not download tooling or modify persistent settings. Flutter flags such as `-d` and `-v` are forwarded unchanged.

This PC now has Android platform/build tools 36, NDK 28.2.13676358, emulator 37.3.10, an isolated `AniDeck_API36` profile and Eclipse Temurin 21. The user explicitly accepted the Android SDK agreement. SDK, JDK, emulator data and caches are outside the repository in the workspace's `toolchains/` directory. No personal Android/Google account is used.

On another development computer, install the official Flutter SDK and run the same commands using `flutter` directly. Run `flutter doctor` and `flutter devices` to inspect remaining native setup. Android requires an Android SDK/JDK and a device/emulator. iPhone building requires the Mac/Xcode workflow, signing setup and device acceptance; those have not been configured by the Windows browser preview. These requirements are for developers, not future app users.

## Verification scope

All 65 unit/widget checks pass, covering player layout/fullscreen, provider identity, real episode gaps, audio/server separation, request headers, subtitle parsing and real temporary SQLite close/reopen, duplicate saves, episode/audio/season isolation, invalid data and failed-open retry. New checks cover feed parsing, shared metadata reads, independent Home failure states, retained navigation, enlarged narrow layouts and episode pagination with gaps. `integration_test/playback_test.dart` uses the real native controller with public MP4/HLS samples. `integration_test/provider_ui_test.dart` exercises home → search → save → actual episode → player → seek/pause → database close/reopen → My list → resumed native player. `integration_test/home_navigation_test.dart` checks live source cards, details and tab/route returns. Run native tests on a dedicated acceptance emulator: Flutter normally uninstalls the test app afterward. The separate persistence test needs `--no-uninstall` to preserve its generated database across processes. These checks do not verify actual OS interruptions, physical rotation, audible audio or a complete viewing session. [Home flow evidence](../docs/audits/MOBILE-HOME-FLOW-2026-11-23.md), [sample results](../docs/audits/MOBILE-PROTOTYPE-2026-11-22.md), [provider results](../docs/audits/MOBILE-PROVIDER-2026-11-22.md), [local-list results](../docs/audits/MOBILE-LOCAL-LIST-2026-11-23.md), [status/rating editor results](../docs/audits/MOBILE-LIST-EDITOR-2026-11-23.md).

The prototype has separate Android/iOS IDs under `com.machoist.prototype`, no bundled account credentials. The optional account screen uses the existing public AniDeck cloud endpoint. Android declares Internet access for the HTTPS samples. No broad iOS insecure-network exception is added. Generated launcher icons/signing settings remain development scaffolding and must be finalized before distribution.

## Next

The 0.1.7 APK includes ARM64, ARMv7 and x86_64 and matches the previous preview signing identity. **65 checks pass**, including tablet layout and account failure cases. See [tablet installation and acceptance](../docs/MOBILE-TABLET-TESTING.md); physical tablet results remain pending.

See [the mobile plan](../docs/MOBILE-PLAN.md). Next extend catalog-to-provider identity and cancellation coverage, establish physical Android acceptance, and add AniList/Kitsu browser authentication, full first-run account onboarding and tracker integration. Keep actual source episode availability, subtitles and tracker fields separate. No PC service or hosted credential/media proxy is required by the provider experiment. Web preview retains samples only; native provider playback is disabled there.

Public sample sources: [Flutter playback guide](https://docs.flutter.dev/cookbook/plugins/play-video), [Apple HLS examples](https://developer.apple.com/streaming/examples/).
