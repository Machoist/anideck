# AniDeck experience and playback backlog

Requested 4 November 2026. Items marked complete have scoped verification below; unchecked items remain planned work. Keep existing deferred acceptance work visible in WORKLIST.md.

## Recommended order

### 1. Loading, artwork and scrolling

Progress: logo retention and shared public artwork measurements are included in preview-a6fca28. Delayed Home data now updates scoped slots instead of rebuilding mounted content; controlled native comparisons verify node, focus, selection and scroll retention. Normal-profile cold-start/scroll acceptance, broader frame tracing and managed bitmap retention remain pending.

- [ ] **Artwork quality and retention:** measure first-launch versus warm-launch image/network/decode costs; retain validated title logos, posters and backdrops across restarts with bounded disk usage, freshness/revalidation and explicit cache clearing. Use exact provider IDs and adequate image dimensions for displayed size/DPI. Keep private Jellyfin artwork scoped to its server/account, and exclude credentials from cache diagnostics. Verify cold/warm starts, offline reuse, changed artwork and eviction.
- [ ] **Responsive scrolling and momentum:** profile first-boot Home, show rows, title pages, middle-mouse scrolling and horizontal drag. Eliminate main-thread stalls, layout shifts and competing scroll animations before adding effects. Preserve Chromium wheel behavior and immediate input cancellation. Evaluate drag momentum and momentum in snappy navigation separately; they must not delay normal wheel/middle-mouse input. Aura/background parallax is optional, motion-reduced and performance-gated.
- [x] **Fluid page/title-tab transitions:** preview-dc43430 shortens page/card entrances and removes delayed hero choreography/forced layout. Same-title Episodes/Discussion/Friends changes and late episode availability preserve mounted artwork, sidebar, tab focus and scroll. Native frames, rapid-navigation races and app/OS Reduce motion verified with generated data; other specialized inline component transitions remain separate.
- [x] **Contained loading shimmer:** preview-dc43430 clips placeholder paint and contains skeleton shelf viewports. Native wide/narrow containment and stable gutter pixels verified during animation; real hover-card overflow and native shelf scrolling are unchanged.

Acceptance: compare repeatable cold/warm traces and input/frame timing, not only screenshots. No promise of instant upstream responses. Existing title-logo and thumbnail identity rules remain intact.

### 2. Player behavior and subtitle font customization

Desktop control-state fixes shipped in preview-080d7ee with unit and real generated-video/native rendering checks; physical TV/remote acceptance remains deferred. Local subtitle font import ships in preview-a6f9eeb, with real Chromium decode/preview/player styling, two-process restart persistence and default removal verified in an isolated fixture. Native file selection is simulated; physical picker appearance remains manual acceptance.

- [x] **Pause overlay and controls:** explicit states for playing, paused, seeking, buffering, ended, menus/drawers and casting. Paused controls remain visible; active controls/menu/focus are not hidden by stale idle timers. Resume auto-hide only when appropriate. Test mouse, keyboard, fullscreen, source changes and reopening playback.
- [x] **Subtitle font import:** one device-local TTF/OTF/WOFF/WOFF2 font,4 MB limit, native parented AniDeck chooser, format/signature plus Chromium decode validation, shared preview/player styling, persistence and removal. Cancel/save failure preserves the current font. Desktop text subtitles only; burned-in text and TV appearance remain unchanged.

Acceptance: native UI checks plus behavioral timing coverage; imported font persists across restart and affects subtitle rendering without interrupting playback.

### 3. Filler indicators and filtering

Implemented 5 November: optional Jikan/MAL annotations in remote title episode lists, exact mapped identities, bounded background reads, shared outage backoff and separate per-title preferences. See [source/mapping audit](FILLER-METADATA-AUDIT.md). Live Jikan API access timed out from this connection; generated-data/native DOM acceptance is separate from live source acceptance.

- [x] Compact **Filler Markers** (on) and **Hide Filler** (off) dot toggles beside sorting above each title’s episode grid. Choices persist independently per title; turning Hide filler off restores hidden rows. No global Playback settings.
- [x] Preserve original numbers, tracker totals/progress, actual provider availability and automatic next-episode behavior. Only explicitly marked pure filler is hidden; recap and unknown remain visible.
- [x] Exact mapped MAL identities; reject conflicting AniList/Kitsu mapping and mismatched combined-entry totals. No franchise-title/absolute-offset guessing; unsupported splits remain unknown.
- [ ] Confirm live public source availability across real titles/providers. Jikan only supplies explicit filler/recap flags; canon/mixed classification and verified aggregate segment mapping remain future work.

Acceptance: fixtures for mapping ambiguity and missing data plus real title checks across available providers. Filtering must behave independently of AniList/Kitsu/local connection.

### 4. Discord Rich Presence

- [ ] Implement desktop Discord RPC with an explicit user-controlled opt-in; existing Discord notification webhooks are a different feature.
- [ ] Show accurate title/episode and playing/paused state, with suitable artwork where supported. Clear presence on stop, sign-out, app exit, opt-out and connection loss; handle Discord absent/restarted without playback errors.
- [ ] Keep private Jellyfin library activity out of presence by default; never send keys, provider URLs/tokens or private server addresses. Choose useful privacy controls for title and episode visibility.
- [ ] Record Discord application registration/configuration needed for real acceptance; use a mock transport for unattended tests and explicit consent for a real public activity check.

### 5. Desktop packaging and updates

- [ ] Audit development/test/release profile isolation and installer/shortcut ownership. Preserve AniDeck's compatibility app ID and legacy AniShelf profile migration; renaming folders would risk orphaning existing settings/keys. Keep tests isolated from the installed profile.
- [ ] Design uninstall **Keep my data** / **Remove my data** choice with retention as default. Explain that lists, settings and saved account access are affected; removal is limited to verified AniDeck-owned data. Test with disposable profiles only.
- [ ] Retain the existing stable-release notification and exact GitHub release-page/manual installation flow. Check version/channel correctness and update messaging. An automatic downloader/installer is a separate product decision, not authorized by reference to another app's updater.

## NuvioCodeineXO reference and engine research

Reference reviewed 4 November 2026: [repository README](https://github.com/codeineXO/NuvioCodeineXO/blob/main/README.md). Its README advertises NuvioEngine-only streaming, persistent torrent caching, HTTP buffering/audio routing/resume improvements, dedicated fork data directories, an uninstall retention prompt and a fork-specific GitHub updater. These are upstream claims; this review did not execute or verify that app or its engine.

- [ ] **Engine feasibility research:** identify actual backend interfaces, runtime/package footprint, platform support, maintenance and integration effort before considering adoption. AniDeck's current resolver/HTTP/HLS/relay pipeline does not rely on TorrServer, so removing that dependency is not an AniDeck fix. Torrent storage and HTTP artwork caching are separate systems.
- [ ] Evaluate bounded configurable cache size/location, disk-full handling, cleanup and exact-file resume, stream startup/seek timing, audio routing, subtitle support and TV relay compatibility using controlled media. Determine whether measured improvements can be made in the existing pipeline first.
- [ ] Produce a concrete proposal before adding an engine or torrent dependency. No backend replacement, installer execution, code copying or automatic updates are part of this backlog update.

## Current starting points

- `src/player.js`: pause/wake and 2.8-second idle timer, stream startup, subtitles, menus/drawer and playback lifecycle.
- `src/api.js`, `src/app.js`, `src/home-queue.css`: metadata/artwork lookups and title/queue rendering; existing response caches are not proof of persistent artwork retention.
- `src/smooth-wheel.js`, `src/nav-motion.css`, `src/styles.css`: native wheel policy, motion and shimmer. Diagnose earlier first-boot staggering before introducing momentum/parallax.
- `main.js`, `preload.js`, `package.json`: native dialogs/IPC, profile selection, NSIS packaging and application identity.
- `src/release-check.cjs`, `src/release-notifications.js`: existing manual stable-release flow.

See WORKLIST.md for the current runtime, completed increments and exact verification results.
