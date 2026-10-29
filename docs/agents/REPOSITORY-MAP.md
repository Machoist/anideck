# Repository retrieval map

This is a navigation aid, not a generated symbol index. Verify symbols and callers against current source. Paths below are relative to the repository root. Read only the rows relevant to the task.

| Area | Starting files | Candidate tests |
| --- | --- | --- |
| Electron boundary | `main.js`, `preload.js`, `src/app.js`, `src/index.html` | `tests/dom-ready.test.cjs`, `tests/settings-entry.test.cjs`, `tests/native-tracking.test.cjs` |
| Home and shuffle | `src/deck-core.js`, `src/deck-features.js`, `src/widgets.css`, `src/home-queue.css` | `tests/deal-reveal.test.cjs`, `tests/deck-integration.test.cjs`, `tests/home-queue.test.cjs`, `tests/shuffle-speed.test.cjs` |
| Profile | `src/profile-account.js`, `src/profile-presentation.js`, `src/profile-favorites.js`, `src/watcher.js`, `src/profile-refresh.css`, `src/profile-about.css` | `tests/profile-loading.test.cjs`, `tests/profile-customization.test.cjs`, `tests/profile-favorites.test.cjs`, `tests/profile-scroll.test.cjs` |
| Social UI and consent | `src/friends.js`, `src/friends-plus.js`, `src/social.js`, `src/message-requests.js`, `src/friends.css` | `tests/message-requests.test.cjs`, `tests/message-start.test.cjs`, `tests/friends-client.test.cjs`, `tests/social-backend.test.cjs` |
| Social server and identity | `server/src/worker.js`, `server/src/social.js`, `server/src/social-v3.js`, `server/src/message-requests.js`, `server/src/identity.js`, `server/src/local-identity.js`, `server/src/profile-details.js` | `tests/social-backend.test.cjs`, `tests/recovery-devices.test.cjs`, `tests/message-requests.test.cjs` |
| Notifications | `src/notification-preferences.js`, `src/friends.js`, `main.js` | `tests/notification-preferences.test.cjs` |
| Tracking and import | `src/local-import.js`, `src/api.js`, `main.js`, `preload.js` | `tests/local-import.test.cjs`, `tests/import-adapters.test.cjs`, `tests/import-provider-write.test.cjs`, `tests/tracking-account-change.test.cjs` |
| Jellyfin isolation | `src/app.js`, `src/api.js`, `main.js` | `tests/jellyfin-isolation.test.cjs`, `tests/optional-jellyfin.test.cjs`, `tests/onboarding-isolation.test.cjs` |
| TV and relay | `src/cast.js`, `src/casting/server.js`, `src/casting/receiver.js`, `src/casting/receiver.html`, `src/casting/receiver.css`, `src/mediaRelay.js` | `tests/receiver-recovery.test.cjs`, `tests/receiver-disconnect.test.cjs`, `tests/cast-controller.test.cjs`, `tests/media-relay.test.cjs` |
| Playback and providers | `src/player.js`, `src/streamResolver.js`, `src/anikoto.js`, `src/hianime.js`, `src/providerSubtitles.js`, `main.js` | `tests/playback-lifecycle.test.cjs`, `tests/provider-routing.test.cjs`, `tests/provider-safety-cancellation.test.cjs`, `tests/provider-subtitles.test.cjs` |
| Release and native checks | `package.json`, `scripts/release-guard.cjs`, `scripts/audit-package.cjs`, `scripts/native-smoke.cjs`, `src/system-checks-native.cjs`, `.github/workflows/` | `tests/release-config.test.cjs`, `tests/system-checks.test.cjs`, `tests/mac-support.test.cjs` |

## Trace behavior across boundaries

Start at the visible control/event handler. Search the exact called function or IPC channel, follow it through `preload.js` and `main.js` where applicable, then find the backend route and permission checks. Locate tests by the same symbol/channel/route, not just similar filenames. Inspect HTML script loading and CSS selectors when debugging renderer integration. Do not infer that similarly named modules are interchangeable.

The social backend lives under `server/`; schema changes require reviewed migration files and permission/persistence coverage. Preserve established compatibility identifiers and third-party notices. The older Desktop `anitrack` checkout is not authoritative and may contain unrelated work. Some packaging arrangements used its cached tools; prefer this checkout's dependencies and report any external dependency still required.
