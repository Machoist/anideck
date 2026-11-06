# AniDeck active worklist

Current as of 6 November 2026. Read this for status and next work; [historical checkpoints](docs/history/WORKLIST-through-2026-11-06.md) are not current instructions. Update this file in place, keeping completed detail in history.

## Current verified application

- Windows preview **be15606** (`preview-be15606`), application version **1.0.0**. Latest application verification: **710 automated tests**, release/package audit, complete isolated native visuals, separate fresh-profile/public readiness, installer/portable runtime equality and ZIP integrity passed. These results describe that runtime, not every later documentation commit.
- Latest feature: opt-in Discord presence; public application **1568285269717946439** is configured. Real desktop **HANDSHAKE → READY** verified; no `SET_ACTIVITY` or public activity was sent. Sharing remains off by default; smoke profiles cannot publish. [Setup and acceptance](docs/DISCORD-PRESENCE.md).
- Filler labels appear only on verified pure filler; hiding preserves anime-canon/mixed/unknown episodes and original numbering. Exact public episode-art mapping works independently of optional AniList details; tested One Piece 51–57 with larger stills. Coverage still depends on verified mappings and upstream assets.
- No public release/tag or backend deployment was made by these latest increments. Source may be newer than the installer; check Git and Settings > About before attributing a user report to a revision.

## Next implementation

| Priority | State | Task and acceptance |
| --- | --- | --- |
| 1 | **Implemented; isolated native selection verified** | Per-checkout development profiles preserve packaged/legacy/smoke selection. Coordinator reran **11 real Electron shell launches** against actual selection code: profile/cookie reuse, checkout separation and unchanged fixture markers passed; old source failed the isolation negative control. Packaged flags are controlled simulations, not installed/uninstall acceptance. No deletion or migration. [Native report](docs/audits/DEVELOPMENT-PROFILE-ACCEPTANCE.md); full source suite last **727 passed**. Existing installer unchanged. |
| 2 | Design pending | Design **Keep my data / Remove my data** uninstall choice, retention default. First establish exact owned paths and a reviewable design; test deletion only in explicitly disposable locations. |
| 3 | **Backdrop and title scroll deferral integrated** | [Artwork audit](docs/audits/ARTWORK-PERFORMANCE-AUDIT.md): duplicate backdrop guard and deferred late title patches verified. Full **727-test** suite and native two-process trace (**17 checks**) pass: episode list stays mounted during the held scroll marker, then patches once after settling; backdrop remains unique. Navigation/account cancellation and input resuming during markup preparation covered. Next: measure actual wheel/middle-mouse behavior and public-host loading before further motion/cache changes. Existing installer unchanged. |
| 4 | Ready when reproducing reports | Broaden filler/source-mapping, missing-synopsis and episode-thumbnail coverage beyond accepted examples. Keep unavailable metadata honest; no guessed seasons, fabricated episodes or universal-HD claims. |

Choose one observable task. Do not automatically start all rows or multiple agents.

User-authorized external assignments reviewed: Claude native profile-selection acceptance and [Grok trusted wheel measurements](docs/audits/SCROLL-INPUT-TRACE.md) integrated as harnesses/reports. Coordinator rerun passed 17 trusted-input checks; controlled Home/title/rail input moved correctly with title deferral, no renderer stall reproduced, middle-button autoscroll unverified. No further motion/cache change justified. Preserve earlier dirty worktrees. Coordinator is preparing the combined unpublished preview; current installer below remains older until package verification finishes.

## Acceptance requiring user or external setup

| Area | Established evidence | Remaining check |
| --- | --- | --- |
| Discord | Registered ID, actual handshake, simulated IPC and native privacy/settings checks | User opt-in real playback, pause/seek, privacy modes, clear/opt-out and Discord restart. Never publish an unattended test activity. |
| Tracking/import | AniList original values user-confirmed; Kitsu new-entry/progress import and Tokyo Revengers 6.5 score save verified | Future natural AniList progress advance and broader ordinary-save/readback checks; preserve provider status/score. Do not fabricate watched progress. |
| Recovery | Isolated second-window recovery verified | Physical second-device sign-in/profile acceptance. |
| Notifications/Social | Backend permissions/consent and isolated UI checks pass | Real OS delivery and two-account request/accept/decline/notification timing; Gio testing deferred. |
| Releases | Manual stable-GitHub notice flow implemented/tested | Acceptance against a future actual stable release. No automatic downloads or release publication authorization. |

## Explicitly deferred

- **Samsung TV:** user deferred testing. Video/sound worked for under a minute, then returned to pairing; captions and framing were not accepted. Recovery fixes/protocol fixtures do not prove physical codecs, subtitle rendering or LAN stability. Resume only when user is ready.
- **Gio/Friends:** two-person messages, invitations, privacy and notifications when available; do not repeatedly request testing. Invitations schedule plans, not synchronized playback.
- **Physical Mac:** installation, sign-in, playback and cross-platform Social; CI/archive checks do not establish physical acceptance or notarization.
- **Private Jellyfin:** real private-server playback/isolation acceptance pending; keep it separate from public anime discovery, stats and presence.
- **Engine research:** Nuvio is a reference, not an approved dependency/backend replacement. Existing AniDeck does not use TorrServer. Require a concrete measured proposal before engine/torrent changes.

## Agent handoff and artifacts

One writer per checkout. Concurrent tasks require separate worktrees and ownership recorded in each handoff: agent/task, checkout, branch/base, owned files, intended result. Inspect dirty files before editing; do not assume another agent's work is committed or copied.

In the enclosing workspace, `outputs/` contains versioned installers/portable archives, `AniDeck-latest-test-info.json` (hashes/revisions), and `AniDeck-source-checkpoint.zip`. These generated/private-workspace artifacts are not in this repository or guaranteed on another machine. Do not preload long external handoffs; use only a needed current excerpt. Verify artifacts before claiming availability. Preserve unrelated untracked files, including `readme-preview.html` if present.

Documentation context cleanup changes no runtime or installed profile. Resume from the **Ready** queue above; history retains all older verification details and superseded decisions.
