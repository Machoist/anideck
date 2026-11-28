# Android Home wording and fullscreen control hierarchy — 27 November 2026

Task owner: Claude Code agent. Checkout `work/anideck-player-hierarchy`, branch `agent/mobile-player-hierarchy`, based on `agent/mobile-onboarding` @ `733bd1e` (draft PR #3).

## Inherited baseline (not authored here)

Commit `7ea96d0` is a byte-for-byte import of the uncommitted 0.1.12+13 player presentation work in `work/anideck-mobile-review`. All eight files' SHA-256 matched the source before commit, and the source checkout was not modified:

- `player_chrome.dart`, `player_chrome_test.dart`
- `fullscreen_preview.dart`, `player_preview.dart`
- `fullscreen_controls_test.dart` tap offsets
- `pubspec.yaml` 0.1.12+13
- `MOBILE-PLAYER-PRESENTATION` and `MOBILE-COMBINED-REVIEW` audits

The baseline passed analysis and 93 tests before any change here. See [MOBILE-PLAYER-PRESENTATION-2026-11-27.md](MOBILE-PLAYER-PRESENTATION-2026-11-27.md) for its own evidence.

## Changes in this branch

- **Home:** the feed heading "Explore Anikoto" is now **Discover anime**. Provider names elsewhere (episode/source selection) are unchanged.
- **Fullscreen header:** title only (show · episode), left-aligned on a full-width scrim that is only as tall as the title. The exit icon and every other control moved out of the header.
- **Bottom area, desktop hierarchy adapted to touch:**
  - Seek row: elapsed time, then the scrubbable timeline, then total time. Matches desktop and saves a row.
  - Toolbar below it, right-aligned in desktop order: captions (accent while on), playback settings, Fit/Fill and **exit fullscreen** last.
  - Settings shows the active speed as a labelled pill ("1.25×") when not normal. Fit/Fill uses the same pill style.
  - All targets are at least 48dp, with tooltips.
- **Unchanged:** central ±10 s and play/pause transport, auto-hide, captions at their fixed offset, Fit/Fill, the single owning controller and system Back. Tooltip names and the `fullscreen-fit` key are kept, so existing behavioral tests still apply.
- **Settings sheet (inherited) fixes:**
  - Overflowed by 40px in phone landscape; it now scrolls (`isScrollControlled`, `SingleChildScrollView`).
  - Speed labels no longer read "2.0×".
  - Removed the filler subtitle "Make it your pace."

No provider fetching/resolution, dependency, account, signing or unrelated feature changes.

## Verification

| Check | Result |
| --- | --- |
| `flutter analyze` | No issues |
| `flutter test` (full) | **101 pass** (93 baseline + 8 new in `test/fullscreen_toolbar_test.dart`; Home wording assertion added to `home_feed_test.dart`) |
| Native `integration_test/player_toolbar_test.dart`, acceptance emulator `emulator-5560` (`AniDeck_Acceptance_API36`) | pass; real HLS player, portrait ↔ landscape, settings sheet, speed 1.0 → 1.25 on the same controller, auto-hide, exit |
| Native `integration_test/fullscreen_controls_test.dart` (auto-hide) | pass |
| Installed diagnostics-off debug APK, guest skip to Home | "Discover anime" present, "Explore Anikoto" absent |

New widget tests check:
- the header contains no buttons
- every option is in the toolbar below the seek row, in desktop order, right-aligned and at least 48×48
- transport stays centered and out of the toolbar
- the title scrim is full width and ends above the transport
- no clipping on phone portrait, small-phone landscape (640×320), phone landscape at 1.4× text, and tablet landscape and portrait (1.4× text), with captions clear of the visible controls
- the speed change keeps the same controller and the toolbar shows "1.5×"
- toolbar exit and system Back both leave fullscreen with the caption choice kept

The speed test also caught the inherited sheet overflow before its fix. During this work, the existing auto-hide tests caught an intermediate header that covered the whole player; that was fixed, and a dedicated scrim assertion was added.

Visual evidence, inspected, in enclosing `outputs/mobile-player-hierarchy-20261127/`:
- `portrait-paused.png`, `landscape-paused.png`
- `landscape-settings.png`, `landscape-playing-speed.png`
- `landscape-hidden.png`, `portrait-paused-speed.png`
- `app-home-discover.png`

Also there: logs and `AniDeck-Mobile-player-hierarchy-debug.apk` (SHA-256 `d0654da1888a7a7d27feabd2b5a89d334f12a7b514dc840b0aad46638102d60f`, development-signed, not a release).

The user's emulator (`emulator-5554`, `AniDeck_API36`) was running during this work and was not touched. Every command targeted `emulator-5560` after confirming its AVD name. The test app was uninstalled and the acceptance emulator stopped afterwards.

## Limits

- No physical phone/tablet or TalkBack session; tablet sizes are widget-test layouts, not a tablet emulator.
- Visual checks used the public HLS sample, not a provider episode.
- Inline (non-fullscreen) player layout is the inherited 0.1.12 design and was not reorganized in this task.
- Speed options remain 0.75–2×; no quality/server options are offered on Android (not supported by the current controller).
