# AniDeck active worklist

Current as of 6 November 2026. Read this for status and next work; [historical checkpoints](docs/history/WORKLIST-through-2026-11-06.md) are not current instructions. Update this file in place, keeping completed detail in history.

## Current verified application

- Windows preview **e9b843a** (`preview-e9b843a`), application version **1.0.0**. **727 tests**, package/runtime audit, packaged-source wide/narrow filler badge checks, signed-out packaged startup/guest setup, installer ASAR equality and ZIP integrity passed. Adds the top-left filler badge to d6d600e's profile/backdrop/scroll fixes. Full packaged visuals/public readiness passed d6d600e and were not rerun wholesale for this badge-only increment. Versioned installer and portable ZIP verified in enclosing outputs; not installed automatically or publicly released.
- Latest feature: opt-in Discord presence; public application **1568285269717946439** is configured. Real desktop **HANDSHAKE → READY** verified; no `SET_ACTIVITY` or public activity was sent. Sharing remains off by default; smoke profiles cannot publish. [Setup and acceptance](docs/DISCORD-PRESENCE.md).
- Filler labels appear only on verified pure filler; hiding preserves anime-canon/mixed/unknown episodes and original numbering. Exact public episode-art mapping works independently of optional AniList details; tested One Piece 51–57 with larger stills. Coverage still depends on verified mappings and upstream assets.
- No public release/tag or backend deployment was made by these latest increments. Source may be newer than the installer; check Git and Settings > About before attributing a user report to a revision.

## Next implementation

| Priority | State | Task and acceptance |
| --- | --- | --- |
| 1 | **Implemented; included in preview** | Per-checkout development profiles preserve packaged/legacy/smoke selection. Coordinator reran **11 real Electron shell launches** against actual selection code: profile/cookie reuse, checkout separation and unchanged fixture markers passed; old source failed the isolation negative control. Packaged flags are controlled simulations, not installed/uninstall acceptance. No deletion or migration. [Native report](docs/audits/DEVELOPMENT-PROFILE-ACCEPTANCE.md). |
| 2 | **Retention guards integrated for verification, not delivered** | [Implementation and correction report](docs/audits/RETENTION-IMPLEMENTATION.md): coordinator confirmed complete structural validation rejects unsafe mutations; **735 full tests**, **20 command lines × 2 NSIS hooks + 2 relaunch checks** pass. No local deletion/migration code. Full NSIS package compilation being checked; actual v1→v2/update/uninstall/Settings behavior still needs disposable Windows environment. Windows Sandbox executable absent here. Existing installer unchanged; do not mark end-to-end acceptance complete. |
| 3 | **Ready for user preview acceptance** | [Artwork audit](docs/audits/ARTWORK-PERFORMANCE-AUDIT.md) and [trusted-input trace](docs/audits/SCROLL-INPUT-TRACE.md): duplicate backdrop guard and deferred title patches pass synthetic and trusted-input checks. Episode list stays mounted during input then patches once; no stall reproduced in the generated fixture. Test preview-d6d600e on first boot, Home/show rows, title return and middle mouse before proposing more motion/cache changes. Physical input and photographic/public-host performance remain unverified. |
| 4 | Ready when reproducing reports | Broaden filler/source-mapping, missing-synopsis and episode-thumbnail coverage beyond accepted examples. Keep unavailable metadata honest; no guessed seasons, fabricated episodes or universal-HD claims. |

Filler visual follow-up delivered in preview-e9b843a: verified pure filler has a source-linked amber badge over the thumbnail's top-left, separate from watched/actions. Classification/hiding unchanged. Full 727 tests plus extracted-package Chromium wide/narrow containment, watched separation, toggles/hiding and stale/offline checks passed. Claude's next design-only assignment is prepared; the user must start it in the external session.

Latest source follow-up: titles without confirmed filler quietly retain ordinary episode cards; no unavailable-guide warning, Waiting state or visible retry prompt. Unknown classification never becomes a no-filler claim or hides episodes. Save failures still appear. Native filler UI check and full 727 tests passed. This follows preview-e9b843a; no newer installer built.

User chose the development workflow for frequent testing. `Start-AniDeck-Development.cmd` launches this checkout directly (or `npm start`); exit/reopen after source edits. Matching Electron 33.4.11 restored locally in ignored node_modules from the existing verified cache. Development profile remains separate and starts signed out; installed app/accounts untouched. Released-app in-app updating is a later task, not enabled or published by this setup.

Local access correction: created and verified the user's Desktop **AniDeck Development.lnk**, targeting the existing runtime with an absolute project argument and working directory. Prefer that shortcut; downloading the project-relative `.cmd` alone cannot carry its dependencies. Launcher now explains a misplaced copy. No runtime changes or app retesting needed for this shortcut/documentation correction.

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
