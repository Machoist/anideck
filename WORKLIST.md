# AniDeck active worklist

Current as of 6 November 2026. Read this for status and next work; [historical checkpoints](docs/history/WORKLIST-through-2026-11-06.md) are not current instructions. Update this file in place, keeping completed detail in history.

## Current verified application

- Windows preview **d6d600e** (`preview-d6d600e`), application version **1.0.0**. **727 automated tests**, release/package audit, full packaged isolated visuals, separate signed-out readiness, installer/portable runtime equality and ZIP integrity passed. Includes development-profile isolation, duplicate backdrop prevention and late title patch deferral. Versioned installer and portable ZIP verified in enclosing outputs; not installed automatically or publicly released.
- Latest feature: opt-in Discord presence; public application **1568285269717946439** is configured. Real desktop **HANDSHAKE → READY** verified; no `SET_ACTIVITY` or public activity was sent. Sharing remains off by default; smoke profiles cannot publish. [Setup and acceptance](docs/DISCORD-PRESENCE.md).
- Filler labels appear only on verified pure filler; hiding preserves anime-canon/mixed/unknown episodes and original numbering. Exact public episode-art mapping works independently of optional AniList details; tested One Piece 51–57 with larger stills. Coverage still depends on verified mappings and upstream assets.
- No public release/tag or backend deployment was made by these latest increments. Source may be newer than the installer; check Git and Settings > About before attributing a user report to a revision.

## Next implementation

| Priority | State | Task and acceptance |
| --- | --- | --- |
| 1 | **Implemented; included in preview** | Per-checkout development profiles preserve packaged/legacy/smoke selection. Coordinator reran **11 real Electron shell launches** against actual selection code: profile/cookie reuse, checkout separation and unchanged fixture markers passed; old source failed the isolation negative control. Packaged flags are controlled simulations, not installed/uninstall acceptance. No deletion or migration. [Native report](docs/audits/DEVELOPMENT-PROFILE-ACCEPTANCE.md). |
| 2 | **Design assigned to Claude** | Concrete **Keep my data / Remove my data** journey, retention default; compare uninstaller versus in-app local removal, prove ownership/update/silent/lifecycle constraints and specify disposable acceptance matrix. `AGENT-RETENTION-DESIGN.md` in Claude worktree owns one new design document only. No deletion/runtime implementation authorized by this design task. |
| 3 | **Ready for user preview acceptance** | [Artwork audit](docs/audits/ARTWORK-PERFORMANCE-AUDIT.md) and [trusted-input trace](docs/audits/SCROLL-INPUT-TRACE.md): duplicate backdrop guard and deferred title patches pass synthetic and trusted-input checks. Episode list stays mounted during input then patches once; no stall reproduced in the generated fixture. Test preview-d6d600e on first boot, Home/show rows, title return and middle mouse before proposing more motion/cache changes. Physical input and photographic/public-host performance remain unverified. |
| 4 | Ready when reproducing reports | Broaden filler/source-mapping, missing-synopsis and episode-thumbnail coverage beyond accepted examples. Keep unavailable metadata honest; no guessed seasons, fabricated episodes or universal-HD claims. |

Filler visual follow-up: verified pure filler now has a source-linked amber badge over the thumbnail's top-left, separate from watched/actions. Classification and hiding unchanged. Full 727 tests plus real Chromium wide/narrow badge containment, watched separation, toggles/hiding and stale/offline checks passed. Updated preview packaging in progress; see current verified artifact above until complete.

Choose one observable task. Do not automatically start all rows or multiple agents.

User-authorized external assignments reviewed/integrated: Claude native profile-selection acceptance and Grok trusted wheel measurements. No further motion/cache change justified by generated fixtures. Preserve their earlier dirty worktrees. Coordinator completed combined unpublished preview-d6d600e; user acceptance is next. Windows packaging used a separate helper cache to avoid a macOS symlink extraction privilege failure; source/package configuration was unchanged.

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

The installed app/profile remains untouched until the user installs a preview. Resume from the **Ready** queue above; history retains older verification details and superseded decisions.
