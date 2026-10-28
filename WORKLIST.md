# AniDeck worklist

## 27 October — shared hero redesign and visible progress comparisons

Current installer/ZIP: **preview-8dd15b4**, source **8dd15b4**, **444 tests pass**. Package audit, isolated packaged native UI/startup/TV/readiness checks, ZIP integrity and installer/portable runtime equality pass; source snapshot refreshed.

- Home hero presentation is shared across all shows: smaller balanced title blocks, separate season labels, episode chip and compact buttons with less glow. Suitable horizontal logos remain supported. Packaged Jujutsu Kaisen, Frieren and One Piece samples at 1360/640px reviewed in `outputs/hero-design-final/`.
- User reported Tokyo Revengers did not offer an episode import. Installed metadata confirmed preview-435301c. The local/provider status equality requirement could hide an otherwise newer progress update, so it was removed; same rewatch state and fresh destination guards remain. Existing rows now show both episode counts with reasons for equal/ahead/rewatch state, and explain that edits while a tracker is active go directly to that tracker. Progress-only updates preserve destination status and rating.
- A new unit regression and packaged real-planner/opt-in fixture cover local Completed/24 vs destination Watching/23. Those values are synthetic; no live user list was inspected or modified. **Tokyo Revengers live import acceptance is still pending**; user supplied the title but not its comparison counts. Source includes commits dc91d47 and 8dd15b4. Release notification remains planned; Gio and physical Mac remain deferred.


## 27 October — portrait hero logos use readable titles

Current Windows installer/ZIP: **preview-435301c**, source **435301c**, **442 tests pass**. Package audit, isolated packaged startup/UI/TV/readiness checks, ZIP integrity and installer/portable runtime equality pass; source snapshot refreshed.

Portrait or invalid logo artwork now leaves the full catalog title visible instead of a tiny vertical strip. Suitable horizontal logos still render. Failed logo lookups reveal the title without an unhandled rejection. Unit tests cover portrait/invalid/horizontal/failed/disconnected cases; packaged generated portrait artwork exercises the real trim/render path at actual 1360px and 640px widths, with no overflow and both screenshots reviewed in `outputs/hero-logo-final/`. No live account data changed. Prior progress-import update remains included; live acceptance of that new opt-in update is pending. Release notification remains next/planned; Gio and physical Mac stay deferred.


## 27 October — newer local progress review and readable queue

Current Windows installer/ZIP: **preview-fc6e214**, source **fc6e214**, **440 tests pass**. Package audit, packaged native fixture/startup/Social/TV/readiness checks, ZIP integrity and installer/portable runtime equality pass. Source snapshot refreshed. Queue and import screenshots reviewed in `outputs/import-progress-final/`.

- Queue items now have dark surfaces in ordinary/hover/selected states, brighter 12px semibold episode labels and a dark queue heading, so bright hero artwork cannot wash out the episode text.
- Local import now reviews existing titles with higher local progress as optional, unchecked updates. Rows show the destination → local episode counts; selection is required before applying changes. Only matching status/rewatch state qualifies. Fresh destination checks at execution and adapter write boundaries skip missing/changed/incompatible or already-ahead entries; updates send only progress and preserve destination status/rating. The local copy remains unchanged. This is a reviewed one-time update, not automatic synchronization.
- Provider fixtures and native opt-in controls pass; the user's earlier live AniList add-import status/progress/score were confirmed. **Live acceptance of the new existing-title progress update remains pending**, along with Kitsu live import. No real tracker/profile/message writes were made by verification. A provider can still change between the final read and write; these APIs do not supply an atomic compare-and-set in this flow.
- Release notification remains next/planned. Real-account rate-limit retest, other physical/device checks and public release acceptance remain on the worklist. Gio and physical Mac stay deferred.


## 27 October — AniList rate-limit handling fixed

Current Windows installer/ZIP: **preview-f046d54**, source **f046d54**, **438 tests pass**. Package audit, full packaged fixture/startup/Social/TV/readiness checks, ZIP integrity and installer/portable runtime equality pass; source snapshot refreshed. User reported repeated “Couldn’t load your list entry: Too Many Requests” while adding a title/updating progress.

- Native requests expose only Retry-After/reset/remaining headers. AniList shares a cooldown across reads/writes, respects the provider's retry/reset deadline and successful-response quota exhaustion, uses a one-minute fallback for body-only 429 responses, and does not queue/replay mutations. This handles the provider limit; it does not remove it.
- Concurrent entry reads share work. Successful positive/negative entries are cached briefly per account; fresh import checks bypass that cache. A complete recent collection proves presence/absence without another entry query. Successful writes/removal and new collections invalidate stale entry work; late old-account/read results cannot replace current progress. Failed reads are never cached as absence.
- A failed catalog-title entry lookup shows List entry unavailable + Retry instead of Add to your list / zero progress. Repeated rate-limited editor clicks produce one notice per cooldown. Save failures keep existing typed progress in the editor. Packaged fixture check confirms unknown state, no false zero, retry action, one notice and no empty editor; screenshot reviewed.
- Twelve additional tests (438 total) cover cooldowns, GraphQL error status, cache/write/account races and UI behavior. Import retry fixture now waits out the simulated cooldown instead of bypassing it. No live provider/profile/message writes were performed by verification; real-account retest after cooldown remains pending.
- User separately confirmed the live AniList import's status, progress and score match. Kitsu and other live edge-case acceptance remain pending. Release notification remains next/planned; recommended initial workflow is a GitHub release link without automatic downloads. Its dependency preparation was set aside outside the repo while this bug took priority. Gio and physical Mac remain deferred.


## 27 October — Social positioning refined

Current Windows installer/ZIP: **preview-9397c9b**, source **9397c9b**, **426 tests pass**. Social starts 70px higher at widths >=1700px, where its centered heading clears Home/Back horizontally. Smaller windows keep the reserved navigation row. On tall desktop windows the welcome illustration/copy has a slightly higher optical center. No negative translation of the welcome content or conversation layout changes.

Packaged fixture checks verify raised header/welcome, shortcut clearance, full-height workspace, visible composer, internal history scrolling and actual 640px no-overflow layout. Screenshot reviewed. Final delivered package passes audit, isolated startup/guest/public readiness, ZIP integrity and installer/portable runtime equality; source snapshot refreshed. Source fix pushed. No real profile/messages/list data changed. AniList readback, other live acceptance and release prompt remain on the worklist; Gio and physical Mac stay deferred.


Updated 27 October 2026. This file is the resumable checklist; earlier development notes are historical.

## 27 October — navigation clipping fixed; import count clarified

Current Windows installer and portable ZIP: **preview-65eb624**, source **65eb624**, **426 tests pass**. Package audit, final packaged native regression checks, ZIP integrity and exact installer/ZIP runtime equality pass. Source snapshot refreshed. UI geometry uses real 1440px, 640px and 360px viewport widths; controls clear My list's eyebrow/title and move naturally with the main scroll. Narrow screenshot reviewed. Standard pages reserve the navigation row; hero layouts retain their existing overlay, and Schedule accounts for the reserved row height.

Account now offers **Review local list for AniList/Kitsu** and explains that the title count is saved on this device; already-listed titles are kept unchanged. The local copy intentionally remains after import. The user reports that the live AniList import succeeded. Independent destination readback (progress/status/rating/rewatch, existing-entry preservation and safe repeat) remains pending; Kitsu live acceptance remains pending. No production list/profile/message writes were performed by this verification. Gio and physical Mac remain deferred. Release notification remains planned.

## Saved and verified

- App source through `3de4263` is backed up on GitHub `main`. All 48 previously local commits were pushed.
- Current local Windows installer and portable ZIP: `preview-f046d54`. 438 automated tests pass; package audit, packaged Electron UI checks, archive integrity and installer/portable runtime equality pass.
- [Windows test build](https://github.com/Machoist/anideck/actions/runs/40459268760) and [Mac test build](https://github.com/Machoist/anideck/actions/runs/40459268720) both succeeded for `3de4263`. Successful CI does not establish physical device acceptance.
- Latest UI work is complete: progressive profile rendering, labeled most-watched genres and next milestone, fluid milestone navigation, compact Social requests/refresh, opaque three-card shuffle with matching reveal size, and equal-height Tonight/Horizon widgets.
- Profile customization, recovery-key sign-in, consent-based message requests, notification preferences, local-list import adapters and isolated optional Jellyfin functionality are implemented. The live checks below remain necessary.
- Current package includes the navigation spacing/import-copy fixes and the policy regression test; source `f046d54`, 438 tests passing. Earlier CI artifact checks below describe their stated historical revisions. No public release or release tag was created.

## 27 October — CI artifact inspection and Mac label fix

Downloaded the `cac7d2f` Windows, Intel Mac and Apple Silicon Mac test artifacts. All three outer archive SHA-256 hashes match GitHub; outer/inner ZIP integrity and Mac Mach-O architecture checks pass. Runtime comparisons found only CRLF/LF differences, not substantive source changes. The existing strict byte audit against this mixed-line-ending local checkout reports stale bytes; CI ran it against its own checkout successfully. No byte-identical cross-platform claim is made.

Downloaded Windows build passes the actual isolated fresh-profile, guest setup and public readiness checks. Mac artifact metadata exposed duplicate testBuild arguments producing an array. CI now invokes electron-builder once with a single label, preserving ad-hoc signing and publish-never settings. Package audit rejects non-string/empty labels; the package-layout regression exercises the malformed-array case. Full suite: 426 pass. Fix `488f143` is pushed. Replacement Windows and Mac CI succeeded; all three artifacts were downloaded, their GitHub digests and archive integrity verified, and the exact package audit passed against separate source references with platform line endings (Windows CRLF, Mac LF). Both Mac executable architectures and single-string build labels were verified. Artifacts and inspection evidence are saved locally under `outputs/ci-488f143` in the enclosing workspace. No app installation or public release was performed. Physical Mac, Gio and live service/device acceptance remain pending/deferred as listed below.

## Local agent readiness

`AGENTS.md` is a compact entry point with on-demand repository map, product rules, verification and 32K workflow under `docs/agents/`. These documents do not install indexing/LSP/UB tools or change model settings.

The local Qwen agent completed a Social request trace/document and a policy-change regression test with substantial review. Reviewed test now verifies denial without writes/chat, pending-state preservation, successful restoration, retry status and exactly-once introduction delivery without friendship. Focused tests: 6 pass. Full suite independently rerun: 426 pass (localhost access required). See `docs/agents/MESSAGE-REQUEST-FLOW.md`.

Evaluation: useful for bounded supervised tasks; independent accuracy has not been established. Observed issues included guessed details after truncated reads, PowerShell/tool mismatches, incomplete assertions and unsupported verification claims. Use fresh scoped sessions, actual command evidence and diff review. Do not treat this exercise as model training or physical/live acceptance. Local-agent experiments are set aside at the user's request; resume AniDeck development directly. Runtime remains `preview-3de4263`.

## Next, in order

1. **User-confirmed AniList import:** title/status/progress/score match in AniList; local copy retained intentionally. New rate-limit fix `preview-f046d54` needs a normal real-account add/progress retry after cooldown (do not intentionally flood AniList). Existing-entry preservation, duplicate prevention and rewatch have fixtures; extra live edge-case acceptance and Kitsu live sign-in/import remain pending. No live provider mutation was performed by automated verification.
2. Test recovery-key sign-in and profile presentation on a physical second device; verify private Jellyfin playback and isolation from anime discovery and Social.
3. Test physical TV picture, sound, captions, codecs, LAN connectivity and recovery during media playback. Same-tab refresh, pairing retention, centered wordmark and pairing-code lifecycle pass packaged checks; media decoding remains simulated in protocol tests.
4. Verify real OS desktop alerts and two-account request/accept/decline, No messages and notification timing. Backend permission tests and UI bindings pass in isolation.
5. **New release notification / GitHub release link:** add an AniDeck-styled, dismissible prompt when a newer public stable release is available, showing its version with **View release on GitHub** and **Later** actions. Open the specific verified AniDeck release page; remember dismissal per version, avoid interrupting playback, and keep a manual check in Settings > About. Compare versions correctly, exclude drafts/prereleases unless explicitly opted in, and handle offline/rate-limit failures quietly. Recommended initial approach is manual GitHub updates only; implementation must reconcile/replace the existing release-build background download/install behavior without duplicate or misleading prompts. Release notification work was interrupted by the AniList rate-limit bug; no popup code or new runtime dependency has shipped. Development/test builds currently disable auto-updates; preserve that separation. Verify discovery/comparison/prompt behavior with fixtures before live release acceptance. **Planned, not implemented.**
6. **Deferred backlog:** live Friends acceptance with Gio, including consent, messages, invitations and notifications. Resume when available; do not repeatedly request testing.
7. **Deferred backlog:** physical Mac installation, sign-in, playback and cross-platform Friends acceptance. Mac CI is now successful; physical acceptance and notarization remain separate work.
8. Consider public release after acceptance. Only Anikoto is user-confirmed working; other playback providers remain unverified or unreliable. Watch invitations save a plan; they do not synchronize playback.

## Resume safely

Use this checkout and preserve unrelated local files. Automated checks use isolated fixtures; do not change production lists, profiles or messages as part of unattended verification. No local process needs to remain running to preserve this checkpoint.
