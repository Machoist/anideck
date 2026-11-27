# Android first-launch onboarding — 27 November 2026

Task owner: Claude Code agent. Checkout `work/anideck-onboarding`, branch `agent/mobile-onboarding`, based on `agent/mobile-controls-autohide` @ `7c52dec` (draft PR #2, which is stacked on PR #1). Draft PR targets `agent/mobile-controls-autohide`.

## What existed before

- `AccountService` (unchanged): key format `adk_` + 64 hex, `signIn` verifies with `POST /v1/session` before writing the key to namespaced secure storage and refuses when a key is already saved; `create` saves a generated key *before* any account write so an interrupted creation is recoverable; failures throw `AccountFailure` with user-facing messages.
- `AccountPage` (unchanged): FLAG_SECURE via `anideck/privacy`, explicit Show/Copy key actions, sign-out, "Continue without an account".
- `AniListPageView` (unchanged): optional AniList connection, opened from Home's sync icon.
- No first-launch flow; the app opened straight to Home, which always creates `anideck-library-v1.db`.

## Outcome

`lib/onboarding.dart` adds `OnboardingGate` (used only by `main()` on Android) and `OnboardingFlow`:

1. Welcome in the existing dark/lilac style. Three choices are pinned below the scrolling intro, so **Continue without an account** is always visible without scrolling.
2. Create profile (handle validated locally) or Sign in with private key (format validated locally, no request until valid). Both reuse `AccountService` unchanged; no new endpoints.
3. The welcome and both account steps explain that the private key allows sign-in on another device and where to find it later (Your account → Sign-in & recovery). The key is never displayed, copied or logged automatically.
4. After account setup or skipping: optional **Connect AniList** (existing `AniListPageView`) or "Not now". No unimplemented services are offered.
5. Completion is stored in a separate sqflite database `anideck-app-state-v1.db` (table `app_state`), not in the local-list schema. Values are a fixed outcome word plus timestamp; no secrets.
6. Existing installations: when no completion is stored, the gate checks only *presence* of the local-list database, the AniDeck account key and the AniList token. Any of them, or an unreadable check, means an existing install: it is marked complete and goes straight to Home.
7. States: progress bar while contacting AniDeck (inputs and buttons disabled, back blocked), inline field validation, request errors in a live region with **Try again** that repeats the same request. Offline/busy/rejected messages are the service's existing ones. If completion cannot be saved, setup continues and the user is told the welcome may reappear.
8. Security: the sign-in step turns on FLAG_SECURE and is refused if protection cannot be enabled. The key field is obscured, with no suggestions, autocorrect or IME learning. The typed key is cleared on backgrounding and when leaving the step, and protection turns off when leaving.

Supporting change: `LocalLibrary.fileName` constant (same filename, no schema change). `AniDeckMobile` gains `onboarding` (default false; `main()` sets it on non-web), so existing tests pumping the default home are unaffected.

## Verification

| Check | Result |
| --- | --- |
| `flutter analyze` | No issues |
| `flutter test` (full) | **91 pass** (77 previous + 14 new in `test/onboarding_test.dart`) |
| `dart format` on changed files | clean (pre-existing `test/anilist_edit_test.dart` from the baseline commit remains unformatted; not touched) |
| Native `integration_test/onboarding_test.dart` on `AniDeck_Acceptance_API36` (port 5560) | pass: real sqflite store, real FLAG_SECURE, offline fixture sign-in, guest skip, reopen-from-disk restart |
| Installed-app adb checks on the same emulator | pass, below |

Widget tests use fixtures only (`MemoryVault`, `MockClient`, in-memory/temp sqflite). They cover: fresh-install choices, guest skip, AniList optional, remembered completion across a new gate, existing installation, store read/write failures, local key validation with zero requests, screen protection on/off, offline sign-in with retry (vault unchanged and local list intact until success), rejected key leaving an already saved account untouched, backgrounding clearing the key, create with validation/network failure/retry using the same saved key, narrow 320×640 at 1.6× text with a simulated keyboard, store persistence/reopen/failed-open retry, and detection rules.

Installed debug APKs (built with `ANIDECK_DIAGNOSTICS=false`) driven by real adb taps and the real Android keyboard:

- **Fresh install:** welcome with all three choices visible (`app-A1-welcome.png`). In Create, the real keyboard opens with the field (y 821–968) and button (y 1010–1147) above it (`app-A2-create-keyboard.png`). Handle validation is shown (`app-A3-create-validation.png`).
- **Sign in:** FLAG_SECURE makes the screenshot black (`app-B1-sign-in-protected.png`, intended). From the accessibility tree, the field (y 979–1126) and Sign in button (y 1168–1304) sit above the keyboard. A typed placeholder (not a key) is absent from the accessibility dump. Format validation is shown.
- **Guest skip:** Continue without an account → optional AniList (`app-C1`) → Home (`app-C2`). Cold restart (force-stop, relaunch) opens Home directly (`app-C3`).
- **Upgrade:** the previous build (`agent/mobile-controls-autohide`) opened to Home, creating the library DB. Installing this build over it with `install -r` opened Home directly, with no onboarding (`app-D1-upgrade-home.png`).

Artifacts: enclosing `outputs/mobile-onboarding-20261127/` (screenshots, `native-test.log`, build logs, both APKs). No real account was created, no real key was read or typed, and no account/AniList request was made. The sign-in step's AniList "Connect" was not opened.

Acceptance-emulator-only settings changed: `immersive_mode_confirmations` (earlier task) and `show_ime_with_hard_keyboard=1` (so the soft keyboard draws). The test app was uninstalled afterwards. The user's `AniDeck_API36` emulator, installed preview, real accounts and the original checkout were not touched.

## Limits

- No physical device or TalkBack session.
- Real account creation and sign-in against the AniDeck backend were not exercised (fixtures only, by instruction).
- The native integration harness could not measure real keyboard insets; keyboard layout was verified with real adb input on the installed app instead.
- Detection treats any earlier Home launch as an existing install. A user who installed an older preview but never opened it gets onboarding, which is harmless.
- The final validation-message wording ("64 characters (0–9, a–f)") changed after the emulator run; the emulator build showed the earlier wording.
- Profiles created through AniList/Kitsu on desktop still cannot sign in on Android (existing limitation, not offered).
- Worklist not edited from this branch (the mobile rows live only in the original checkout's uncommitted WORKLIST); add a one-line Mobile feasibility update when integrating.

## Next recommended task

Accept onboarding on the physical Android device: fresh install, then an upgrade over the installed 0.1.10 preview, which must go straight to Home. Then implement automatic browser return for the AniList connection (mobile callback), which onboarding now leads into.
