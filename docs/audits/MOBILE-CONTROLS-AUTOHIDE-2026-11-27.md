# Mobile fullscreen controls auto-hide — 27 November 2026

Task owner: Claude Code agent. Checkout `work/anideck-controls-autohide`, branch `agent/mobile-controls-autohide`, based on `agent/android-ci` @ `87c111a` (PR #1, not merged). Draft PR targets `agent/android-ci` so the diff contains only this change.

## Outcome

Android fullscreen playback hides its overlaid controls after **3 seconds** of inactivity while playing. Tapping the video toggles them. They remain visible while paused or ended, on a playback error, while a finger is held on any control (including dragging the seek slider), while a menu/dialog/sheet route is above the player, and whenever screen-reader/switch navigation (`accessibleNavigation`) is active. A key press (keyboard, D-pad) reveals them before focus can move.

The inline (non-fullscreen) player is unchanged: its controls sit below the video, not over it.

## Design notes

- `mobile/lib/fullscreen_preview.dart` only. The owning `PreviewPlayer`, its single `VideoPlayerController`, `_toggle`/`_seek`, caption state hand-back and Fit/Fill math are untouched; no streaming-provider code, dependency, configuration or signing change.
- Hiding fades opacity only (200 ms; instant when the system requests reduced motion). Bars stay laid out, captions keep their existing fixed offset, so video and captions do not move (asserted).
- Hidden bars are wrapped in `IgnorePointer`, `ExcludeFocus` and `ExcludeSemantics`: a tap where an invisible button sits reaches the video tap layer and only reveals controls; nothing invisible can be activated, focused or announced.
- The hide timer is armed once when hiding becomes allowed and cancelled on every hold reason, interaction and dispose.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| New widget tests (9) | `.\tools\flutter.ps1 test test/fullscreen_controls_test.dart` | pass |
| Negative control | same tests against original `fullscreen_preview.dart` (plus only the delay constant so it compiles) | **9/9 fail**, as expected |
| Full suite | `.\tools\flutter.ps1 test` | **77 pass** (68 existing + 9 new) |
| Analyzer | `.\tools\flutter.ps1 analyze` | No issues |
| Format | `dart format --set-exit-if-changed` on changed Dart files | 0 changed |
| Native visual | `.\tools\flutter.ps1 test integration_test/fullscreen_controls_test.dart -d emulator-5560` | pass; position advanced 0 → 21.1 s |

Widget tests cover: inactivity hide; tap toggle; tap at an invisible control does not seek; control use restarts the delay; paused stays visible and resume re-arms; error reveals and holds; held/dragged slider holds until release; popup menu holds and closing re-arms; screen-reader navigation never hides; reduced motion has zero fade; key press reveals; video/caption rectangles identical shown vs hidden; Fill survives hiding; caption toggle still works.

Native visual check ran on the **separate `AniDeck_Acceptance_API36` emulator** (port 5560, `-no-snapshot-save`), real `video_player` controller with Apple's public HLS sample, landscape. Screenshots inspected: `paused-shown`, `playing-shown`, `playing-hidden` (controls gone, caption visible in place), `tap-shown`, `fill-hidden` (cropped Fill retained), `paused-after-delay-shown`. Artifacts: enclosing `outputs/mobile-controls-autohide-20261127/{*.png,native-test.log}`.

The first capture was obscured by Android's one-time "Viewing full screen" system education dialog; on the acceptance emulator only, `settings put secure immersive_mode_confirmations confirmed` was set and the capture rerun. The user's `AniDeck_API36` emulator, installed preview 0.1.10, real accounts and the original checkout were not touched.

## Limits

- No physical phone/tablet, TalkBack session or real provider stream verified for this change; accessibility behavior is verified through Flutter's `accessibleNavigation`/`disableAnimations` flags.
- Fullscreen currently has no menu of its own; menu protection is generic (any route above the player) and tested with a popup menu.
- The 3-second delay is a constant, not a user setting.
- The active worklist with mobile rows exists only as uncommitted edits in the original checkout, so it was not edited from this branch; add a one-line Mobile feasibility update ("controls auto-hide implemented, draft PR") when integrating.

## Next recommended task

After PR #1 and this PR are reviewed, build a diagnostics-off debug APK from the combined branch and accept auto-hide on the physical Android device with TalkBack on and off, then continue the Mobile feasibility queue: full onboarding/mobile callback.
