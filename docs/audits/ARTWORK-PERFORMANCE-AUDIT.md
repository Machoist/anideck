# Artwork loading and scrolling audit

Source review, a baseline two-launch trace, and a post-fix trace after the backdrop change. Wall-clock and frame samples are offscreen fixture observations. They are not decode counts or real-user speed.

## Scope and base

- Checkout: `C:/Users/Macho/Documents/Codex/2026-10-23/files-mentioned-by-the-user-codex/work/anideck-grok`
- Branch: `agent/grok-artwork-audit`
- Base: `7809185210201ebc480817ec2ba179304459a6a1` (`7809185` Streamline agent context and separate active tasks from history)
- Working tree: untracked `AGENT-TASK.md`, `AGENT-REVIEW.md`, `docs/audits/`, and `scripts/native-artwork-startup-trace.cjs`. No commit.
- Question: what first-boot and warm artwork/scroll work remains after Home slot updates, title-read budgets, logo/dimension retention, and exact episode mapping. Roadmap item: [UX-PLAYBACK-ROADMAP.md](../UX-PLAYBACK-ROADMAP.md) section 1. This trace uses a disposable profile and generated loopback images. It does not close a normal-profile cold start.

## Established behavior

Boot loads saved logo and dimension records before the first page, in parallel with account init. Each IndexedDB operation aborts after 200ms and cannot block boot on its own (`App.boot`, `src/app.js` 238; `storage`, `src/title-artwork-store.js` 19–32). It does not download image bytes. `preconnectImageHosts` (`src/app.js` 2262–2270) only adds connection hints for Kitsu, AniList, and the configured Jellyfin origin.

What the application stores survive a process restart:

| Store | Keeps | Bound | Does not keep |
| --- | --- | --- | --- |
| `TitleArtwork` | Exact-ID public logo URL, or a trimmed PNG data URL | 64 ids, 4MB, 7 days (`src/title-artwork-store.js` 3–17, 34–41) | Poster or backdrop bitmaps |
| `ArtworkImages` | Width and height for public image URLs with no query, user, or port | 256 URLs, 7 days (`src/title-artwork-store.js` 43–60) | Private, Jellyfin, or token URLs. A stored public hit returns dimensions and does not construct an `Image` |
| `QueueArt` | Last chosen queue banner URL | 14 days, settings key `queueArt` (`src/app.js` 2871–2878) | Pixels. Load sits in the Home read budget |
| `HDArt` | Up to three library backdrop URLs | 7 days, settings key `hdArt` (`src/app.js` 2316–2346) | Dimensions. Jellyfin URLs carry query parameters, so `ArtworkImages` will not remember them |
| `SpotlightArt` | Chosen carousel image URL and size | 32 rows, 5 minutes, memory, scoped to tracker and Jellyfin session (`src/spotlight-art.js` 1–14) | Anything after exit or owner change |
| `setEpisodeThumb.cache` | Loaded episode-still URL | 300 keys, memory (`src/app.js` 2279) | Anything after exit. Poster and banner fallbacks are not stored |
| `AniZip` | Mapping promise, including episode image URLs | 6 hours, memory (`src/api.js` 1136–1156) | Disk. `Kitsu.externalIds` is the part that is saved (`src/api.js` 544–551) |
| `Kitsu.episodes` | One in-flight or finished page | Session memory, key `id:offset:count` (`src/api.js` 463–469) | Disk. A failed page is evicted |

A second process on the same `userData` can also reuse Chromium’s HTTP disk cache. That cache is outside the table. The trace below measured it for these loopback images. `publicImage` rejects `http` and any port, so `ArtworkImages` does not store the fixture URLs. An `Image` constructor and a dimension-store hit are separate from HTTP bytes.

Home paint does not wait for every shelf. `HomeReads` (`src/app.js` 3692–3699) returns a fallback at 600ms, keeps the finished value, and schedules one slot update. `HomeRefresh` (`src/home-refresh.js` 9–35) replaces only changed slots and remeasures one anchor. While `App.scrollUntil` is in the future, that update is postponed. `SmoothWheel` (`src/smooth-wheel.js` 1–16) sets `scrollUntil` for 200ms on a passive wheel, a captured scroll, or middle-button press. It does not write `scrollTop` or call `preventDefault`.

A carousel slide has no `src` unless `SpotlightArt` still holds a choice (`heroSlide`, `src/app.js` 2546–2553). Otherwise `homeAfter` marks `loading-art` and runs up to three `loadBest` workers (`src/app.js` 3811–3858). `firstUsableArtwork` (`src/app.js` 3687–3690) starts every source group immediately, measures at most three URLs per group, and stops that slide’s selection at score 0.65 or at 2200ms. In-flight `Image` probes are not cancelled when another source already won. A same-session return can paint the saved URL with no new measurement. A new process loses `SpotlightArt`, so the slide waits for `homeAfter` even when dimensions are already stored.

Queue markup can include the saved banner URL when `QueueArt.load` finishes inside the 600ms budget (`src/app.js` 3765–3768). A late load renders the hero without that URL, then replaces the hero slot.

Title pages paint Kitsu core content after a 160ms wait for list state, request state, and AniList details (`TitleReads.read`, `src/title-reads.js` 5–13). The late patch keeps the existing `h1`, hero background node, and tab buttons (`TitleReads.paint`, `src/title-reads.js` 16–34; `TitlePanels.commit`, `src/title-panels.js` 11–21). It does replace the sidebar and, on the Episodes tab, the panel body. `Views.animeAfter` then runs again with `retainedTitle: true` (`src/title-reads.js` 33). Resolved hero art is skipped only when `.hero-bg-img.on` or `.hero-logo` is already present (`src/app.js` 4375–4379).

Remote episode rows start with no still. `data-episode-only="1"` blocks the banner and poster from being used as the thumbnail (`src/app.js` 4282–4284, 2274–2277). `animeAfter` fills titles and stills from `AniZip.episodeMapping` and `Kitsu.episodes` (`src/app.js` 4396–4414). Mapping resolves an AniList id from the route, an `al:` prefix, or Kitsu external ids, then rejects a payload whose Kitsu id conflicts (`src/api.js` 1125–1134). A loaded still that is below `max(400, displayed width × devicePixelRatio)`, capped at 1280, probes every other candidate with a new `Image` (`src/app.js` 2280–2284). The visible image stays until a candidate is at least 15% wider. Library show rows use `fillMissingThumbs` (`src/app.js` 2293–2305), which assigns `img.src` directly and calls `AniZip.get(App.showAl?.id)` rather than `episodeMapping`.

There is no pointer-drag scroller for Home rows. Rows are native `overflow-x: auto` (`src/styles.css` 95–96, 317–318). Arrows call `scrollBy` (`src/app.js` 2016–2031). The week strip is the exception: its wheel listener is non-passive and assigns `scrollLeft` until the row reaches an edge (`src/app.js` 3132–3139). Settings row reorder and deck card drag are separate gestures.

`upgradeBackdrop` (`src/app.js` 2390–2474) now keeps one in-flight upgrade per live hero, config string, and render id (`bgFlight`). `fade` skips a URL that already has a `.hero-bg-img`, including before `.on`, and leaves the inline `background-image` in place. A stale render, a disconnected hero, or a changed `data-bgs` value does not receive that image. A failed display load removes its node and drops that `bgChoice` entry. Candidate order and the `.on` opacity transition are unchanged. The baseline section measured the previous function, which appended a second node for the same sharper URL.

## Baseline trace

This section is the pre-fix run. Its cold hero finished with two `.hero-bg-img` nodes. The child `network` arrays were empty because two `onCompleted` listeners replaced each other. Do not read those empty arrays as isolation evidence.

Cited result only: `C:/Users/Macho/AppData/Local/Temp/anideck-artwork-trace-output-3/` (`trace.json`, `cold.json`, `warm.json`), written 6 November 2026 at 11:59. Both child stages exited 0. All 11 assertions passed.

Command, from this checkout:

```text
node scripts/native-artwork-startup-trace.cjs C:\Users\Macho\AppData\Local\Temp\anideck-electron-v33.4.11\electron.exe . C:\Users\Macho\AppData\Local\Temp\anideck-artwork-trace-output-3
```

`node --check scripts/native-artwork-startup-trace.cjs` exited 0 in this session. The Electron trace was not re-run after that check. The numbers below are the retained JSON.

| Item | Value |
| --- | --- |
| Parent | Node `v24.22.1`, pid 30064 |
| Binary | `C:/Users/Macho/AppData/Local/Temp/anideck-electron-v33.4.11/electron.exe` |
| Child runtime | Electron 33.4.11, Chrome 130.0.6723.191, Node 20.18.3 |
| Cold pid / warm pid | 28304 / 26512 |
| Profile, retained | `C:/Users/Macho/AppData/Local/Temp/anideck-artwork-trace-4iPhZH/user-data` |
| Origin | `http://127.0.0.1:63560` |
| Proxy environment | empty |
| Window | Offscreen 1360×900, `backgroundThrottling: false`, paint sink, frame rate 60. Observed `devicePixelRatio` 1 |

The harness slices the real `HomeReads`, `homeAfter`, `TitleReads.paint`, `TitlePanels`, `upgradeBackdrop`, `animeAfter`, and `episodeMapping` functions. Catalog metadata is generated in process. Images are solid PNGs from the parent server. The document is `GET /fixture.html` (`Cache-Control: no-store`, 129 bytes) so the images are same-origin. Image responses use `Cache-Control: public, max-age=3600`, an ETag of the pathname, `Timing-Allow-Origin: *`, and `Access-Control-Allow-Origin: *`. The server can answer 304 when `If-None-Match` matches. This run sent no conditional request (`conditional: 0` on every server row).

Fixture delays inside the scenario: AniList details for id 501 wait 400ms, `Requests.has` waits 300ms, `trackingEntryState` waits 450ms, and `TitleReads.budgetMs` stays at the source value 160. `/backdrop-sharp.png` waits 900ms only when that request reaches the server. `HomeReads.budgetMs` is set to 40 for the Home postpone check. The carousel timer is cleared after `homeAfter`.

Generated files:

| Path | Pixels | Bytes |
| --- | --- | --- |
| `/carousel.png` | 3000×980 | 41005 |
| `/backdrop-sharp.png` | 3000×1100 | 46006 |
| `/backdrop-initial.png` | 640×200 | 2192 |
| `/still-small.png` | 320×180 | 1184 |
| `/still-large.png` | 1280×720 | 13726 |

`firstCarouselMs` and `firstStillMs` are milliseconds after `scenario()` starts. Backdrop call and fade timestamps are `performance.now()` from the document time origin. Paint, thumb, and Home-refresh timestamps are milliseconds after `scenario()` starts. Those two clocks are close in this run and are not identical.

### Cold and warm visibility

Both launches decoded the carousel and the large still.

| | Cold | Warm |
| --- | --- | --- |
| First carousel | 22ms | 26ms |
| First episode still | 1836ms | 1855ms |
| First large still | 1836ms | 1855ms |
| Carousel natural size | 3000×980 | 3000×980 |
| Carousel box | 1280×420 | 1280×420 |
| `loading-art` | false | false |
| Episode | “Generated still”, width 1280, `/still-large.png` | same |

The still times include the delayed optional title metadata. The warm still time is therefore an observation of the same fixture, including those delays. The HTTP-cache evidence is the byte section below.

### Bytes, cache, constructors, and the dimension store

Cold server, all status 200, no conditional headers: `/fixture.html` 129, `/carousel.png` 41005, `/backdrop-initial.png` 2192, `/backdrop-sharp.png` 46006 once, `/still-large.png` 13726 once. Five requests, 103058 bytes sent. `/still-small.png` was not requested.

Cold resource timing (`transferSize` / `encodedBodySize` / duration): carousel 41305 / 41005 / 1.6ms, initial 2492 / 2192 / 4.7ms, sharp 46306 / 46006 / 912.6ms, still-large 14026 / 13726 / 1.6ms. The sharp duration includes the 900ms server delay.

Warm server: only `/fixture.html` 200, 129 bytes, one request. No image request and no 304. Warm resource timing has `transferSize` 0 for all four images, with `encodedBodySize` equal to the file size: carousel 5.9ms, initial 1ms, sharp 6.8ms, still-large 0.7ms. The 900ms delay did not apply because the sharp request never reached the server. `max-age=3600` left the entry fresh, so the second process reused Chromium’s HTTP disk cache.

Both stages: `ArtworkImages.rows` size 0, `fixtureUrls` empty, `publicImageRejectsFixture` true. The warm bitmap reuse is the HTTP disk cache. It is not an `ArtworkImages` hit, and it is not `queueArt` or IndexedDB.

Both stages recorded `measureImages` 2 and `imageConstructors` 2. Cold resource timing has four image entries, and the cold server sent one body per requested image URL. Two appended `.hero-bg-img` nodes on cold shared the single `/backdrop-sharp.png` response. Constructor count, measure count, DOM nodes, and HTTP responses are different counters. The child `network` arrays from `webRequest` are empty on both stages. Byte evidence is the parent server log plus Performance resource timing. The foreign-URL assertion passed on that empty log. `pageErrors` contains only Electron’s insecure Content-Security-Policy warning.

Both stages recorded the same call counts: `anilist` 2, `anizipGet` 2, `anizipCacheHit` 1, `externalIds` 1, `kitsuEpisodes` 2, `kitsuCore` 1, `requests` 1, `entry` 1, `thumbs` 5, `showLogo` 3, `railArrows` 2, `viewsAnime` 2, `homeAfter` 1, `animeAfter` 1, `episodeMapping` 2, `refresh` 1. The `animeAfter` counter is the harness increment around the first call. Backdrop call records are the direct count of `upgradeBackdrop` entries.

### Backdrop nodes

The initial CSS background on both stages is `url("http://127.0.0.1:63560/backdrop-initial.png")`. The sharper candidate is `/backdrop-sharp.png`. `choiceSize` is 1 on both stages. The CSS equality guard therefore does not hide this candidate.

Cold, `overlap` true:

| Call | t | done | Nodes at start | Nodes at end | `scrollUntil` active |
| --- | --- | --- | --- | --- | --- |
| 1 | 2021 | 2953 | 0 | 2 | true |
| 2 | 2314 | 2953 | 0 | 2 | true |

Two fades at t=2953, both `/backdrop-sharp.png`, node counts 1 then 2. `finalNodes` length 2. Both nodes are `.on`, natural size 3000×1100. The late paint at scenario time 2066–2067 saw `beforeNodes` 0 and `afterNodes` 0, so the pair was appended after that paint returned. One 46006-byte download fed both nodes.

Warm, `overlap` false: one call, t=2035, done=2054, nodes 0 then 1, `scrollUntil` active. One fade at t=2053, `/backdrop-sharp.png`, one node. `finalNodes` length 1, `.on`, 3000×1100. The late paint saw `beforeNodes` 1 and `afterNodes` 1. The existing `.on` skip matches this result: the warm image was already present when the late paint ran, so the second `upgradeBackdrop` was not entered. The cold pair ran while that node was still absent. The duplicate is timing-dependent on the delayed first response. This warm launch is a single node.

### Episode panel during an active title scroll

Both paints ran while `scrollUntil` was active, with genre text `Generated`.

| | Cold | Warm |
| --- | --- | --- |
| Paint t / done | 2066 / 2067 | 2090 / 2091 |
| `.detail-main` same node | true | true |
| `.title-sections` same node | true | true |
| `.ep-list` same node | false | false |

The episode list node was replaced during the active scroll on both launches. Navigation and the main column stayed. Thumb samples while `scrollUntil` was active show the large still assigned, then the small and large candidates with the large URL cached, then the same pattern again after the panel replacement. The small URL is in those candidate lists. The server never received `/still-small.png`, so a candidate probe record is not a download count. The visible still stayed `/still-large.png` at 1280px.

### Gestures and Home refresh

Every gesture below was exercised on an offscreen window with synthetic events. The home sample assigns `scrollTop` after a synthetic wheel. The title sample dispatches synthetic wheels and does not assign `scrollTop`. Long tasks were 0 and `longTaskError` was empty. Largest frame gaps are samples from this fixture. They are not pass/fail thresholds and they are not user-motion latency.

| Gesture | Cold wall / samples / largest gap | Warm wall / samples / largest gap | What moved |
| --- | --- | --- | --- |
| `home-main-wheel` | 184ms / 9 / 57.2ms | 181ms / 8 / 69.7ms | `scrollUntil` active, `scrollTop` 240 |
| `home-rail` | 266ms / 16 / 18.3ms | 263ms / 15 / 18.3ms | Arrows ran, `scrollLeft` 628, moved, overflow, right edge visible |
| `home-week-wheel` | 183ms / 11 / 17.8ms | 186ms / 11 / 17.9ms | `defaultPrevented` true, `scrollLeft` 0 then 140, overflow |
| `title-scroll-during-late-paint` | 676ms / 39 / 38.5ms | 669ms / 39 / 35.4ms | One paint, `coversLatePaint` true. Cold mount at 1613, warm mount at 1638 |

Home refresh, both stages: `refreshWhileHeld` 0, `refreshBeforeRelease` 0, `refreshDuringHold` 0, `refreshAfterRelease` 1. The single refresh log is `scrollActive` false, cold t=1286 and warm t=1306. The Home postpone path held the update while `scrollUntil` was in the future and ran it once after release.

### Not exercised

- A 50-row episode candidate stampede
- Jellyfin or query-string artwork
- Public Kitsu, AniList, ani.zip, TVDB, Trakt, or Discord
- The installed user profile
- Home row pointer drag
- Carousel rotation ticks during the gesture samples

Decode count per bitmap, a normal-profile cold start, and public-host cache headers remain unmeasured. Earlier scratch output directories are not this result.

## Post-fix trace

Command, from this checkout, after the backdrop change:

```text
node scripts/native-artwork-startup-trace.cjs C:\Users\Macho\AppData\Local\Temp\anideck-electron-v33.4.11\electron.exe . C:\Users\Macho\AppData\Local\Temp\anideck-artwork-trace-output-postfix
```

Exit 0. Both stages status 0. All 17 assertions passed. Evidence: `C:/Users/Macho/AppData/Local/Temp/anideck-artwork-trace-output-postfix/trace.json`. Profile retained: `C:/Users/Macho/AppData/Local/Temp/anideck-artwork-trace-ZDSetM/user-data`. Origin `http://127.0.0.1:57355`. Parent pid 3880, Node `v24.22.1`. Cold pid 26072, warm pid 22656. Same Electron 33.4.11 / Chrome 130.0.6723.191 / Node 20.18.3 binary as the baseline. One `onCompleted` listener records fixture and unexpected URLs by parsed origin. `onBeforeRequest` cancels any other HTTP(S) origin before `loadURL`. No blocked, foreign, or error rows were recorded.

| | Cold | Warm |
| --- | --- | --- |
| First carousel / first still | 22ms / 1864ms | 26ms / 1849ms |
| Backdrop calls | 2, overlap true, both `nodesAtEnd` 1 | 1, overlap false, `nodesAtEnd` 1 |
| Fades | one, t=2967, `/backdrop-sharp.png`, 1 node | one, t=2046, same URL, 1 node |
| Final `.hero-bg-img` | 1, `.on`, 3000×1100 | 1, `.on`, 3000×1100 |
| Inline background | `/backdrop-initial.png` | `/backdrop-initial.png` |
| Server bytes | 103058 across 5 responses, sharp once (46006) | 129, `/fixture.html` only |
| Sharp resource duration | 906ms, `transferSize` 46306 | 6.8ms, `transferSize` 0, `fromCache` true |
| Dimension rows | 0 | 0 |
| Late paint | genre `Generated`, `listSame` false, `mainSame` true, `navSame` true, hero nodes 0 at the paint instant | genre `Generated`, `listSame` false, `mainSame` true, `navSame` true, hero nodes 1 before and after |
| Home refresh | `refreshWhileHeld` 0, one refresh at t=1307 with `scrollActive` false | same shape, t=1310 |

The cold pair of calls still overlaps across the 900ms server delay. They now share one fade. Warm images completed from the HTTP disk cache (`fromCache` true, `encodedBodySize` equal to the file, no image request at the server). `ArtworkImages` remained empty. That is separate from the dimension store.

Synthetic offscreen samples, 0 long tasks: cold home wheel 188ms / 8 samples / gap 68.7ms with `scrollTop` assigned to 240; rail 267ms / gap 18.2ms; week wheel 183ms / gap 18.2ms, `defaultPrevented`, `scrollLeft` 140; title marker 689ms / gap 39.2ms, synthetic wheels, `scrollTopAssigned` false. Warm gaps were 60.3, 17.5, 17.7, and 39.3ms. These are not user-motion latency.

The episode list is still replaced during the active title scroll on both stages. That baseline was not changed.

Focused regressions after the edit: `node --test --test-timeout=15000 tests/backdrop-lifecycle.test.cjs tests/artwork-quality.test.cjs tests/artwork-measurements.test.cjs tests/title-panels.test.cjs` exited 0, 24 passed. Before the edit, the new backdrop file exited 1: the overlap and repeat cases appended two sharp nodes, a detached hero and a changed config still received the old image, and a failed display image stayed in the hero. Distinct heroes already upgraded independently. `node --check` on `src/app.js`, the new test, and the harness exited 0.

## Confirmed findings

- Before the fix, cold `upgradeBackdrop` appended two `.hero-bg-img` nodes for one `/backdrop-sharp.png` response while the CSS background stayed `/backdrop-initial.png`.
- After the fix, the same cold overlap records two calls and one fade. Both stages finish with one `.on` node and the original inline background. Warm still finishes with one call when the cached image is already `.on` before the late paint.
- `TitleReads.paint` still replaces `.ep-list` while `scrollUntil` is active. `.detail-main` and `.title-sections` stay. `HomeRefresh` still waits until the held scroll ends. The scroll gate is not part of this change.
- Warm image bytes come from Chromium’s HTTP disk cache. The post-fix log shows `fromCache` true and `transferSize` 0, while the server sends only the no-store document. `ArtworkImages` stores nothing for these loopback URLs.
- `imageConstructors` 2 remains a separate counter from HTTP responses and from the single backdrop node.

These source facts remain, and this trace did not measure them as user-visible cost:

- Jellyfin artwork URLs are refused by `publicImage` (`src/title-artwork-store.js` 43; test in `tests/artwork-measurements.test.cjs`). Library backdrop measurement repeats on each visit. That matches the private-image rule.
- Home rails have no drag handler and no momentum scroller. Middle-button input stays on Chromium’s path (`src/smooth-wheel.js` 15). Adding drag momentum would be new behavior.
- The week row is the only wheel path in this scope that calls `preventDefault` and writes a scroll offset (`src/app.js` 3134–3138). The trace observed that preventDefault and the `scrollLeft` change.

## Hypotheses

- Cold carousel measurement plus the later display `<img>` may decode the same URL twice. This run shows one HTTP response for `/carousel.png`. Decode count was not measured.
- A 50-row episode page whose stills are under the pixel target can start one extra `Image` per remaining candidate per row, with no page-wide cap. This fixture has one episode.
- `firstUsableArtwork` leaves already started probes running after a winner is chosen. `ArtworkImages` does cancel a probe that hits its own timeout (`src/title-artwork-store.js` 54).
- Carousel and queue rotation still force layout with `offsetWidth` (`src/app.js` 3065, 3892) while the hero is at least 35% visible. They do not consult `scrollUntil`. Rotation ticks were not part of the gesture samples.
- `animateCards` reads `getBoundingClientRect` for each new visible card when the user is not already scrolling (`src/app.js` 2832–2847). `updateRailArrows` reads rail scroll sizes on each rail scroll event (`src/app.js` 2016–2031). The rail gesture did call the arrow update.
- `HomeReads.schedule` rearms a 120ms timer while scrolling. The timer body returns before it touches the DOM. The trace observed the resulting refresh once, after `scrollUntil` had passed.

## Test coverage

These tests lock the source behavior above. They do not measure cold or warm wall time.

- `tests/responsive-loading.test.cjs`: Home budget and single refresh, warm Home does not schedule a second render, scroll delays the late Home update, `firstUsableArtwork` does not wait for a stalled group, episode fallback, cold stills stay out of the cache until load, and a larger still replaces a small one without clearing it first.
- `tests/artwork-measurements.test.cjs`: dimension coalescing, warm reload without a new `Image`, rejection of private and query URLs, expiry, hung probes, and no further image checks after a backdrop is chosen.
- `tests/title-artwork-store.test.cjs`: logo retention, bounds, and failed storage.
- `tests/artwork-quality.test.cjs`: original Kitsu and extra-large AniList URLs, backdrop scoring, `episodeMapping` without AniList details, conflicting Kitsu id rejection, and failed episode-page eviction.
- `tests/title-reads.test.cjs`: 160ms split between core content and optional reads, no late patch when the optional reads already finished, stale navigation and account changes, and one catalog failure path.
- `tests/title-panels.test.cjs`: same-title tab commits keep navigation; retained `animeAfter` does not call `upgradeBackdrop` or `showLogo` once hero art and the logo are already present.
- `tests/home-refresh.test.cjs`: slot signature ignores hydrated queue artwork, and a changed page, render id, or owner drops a late Home write.
- `tests/smooth-wheel.test.cjs`: wheel, scroll, and middle-button listeners stay passive and only set `scrollUntil`.
- `tests/backdrop-lifecycle.test.cjs`: overlap, repeat calls, independent heroes, stale and detached heroes, a changed config, and retry after a failed measure or display load. Run for this change. It failed on the previous function and passed after it.
- `tests/queue-artwork.test.cjs` and `tests/spotlight-art.test.cjs`: score floor and in-memory spotlight scope. Not re-read line by line beyond their names and the callers above.
- `npm test` was not run.

## Remaining limitation

The backdrop duplicate is fixed in this checkout. The episode-list replacement during `scrollUntil` remains, on both the baseline and post-fix traces. A scroll gate on `TitleReads.paint` is the separate next change if the coordinator wants it. It was not implemented. Bitmap retention, row-drag momentum, and parallax stay out of scope. Frame gaps stay synthetic observations. Decode counts and real-user speed were not measured.

## Handoff

- Branch / base: `agent/grok-artwork-audit` at `7809185210201ebc480817ec2ba179304459a6a1`
- Files changed for this task: `src/app.js` (`upgradeBackdrop` and `bgFlight` only), `tests/backdrop-lifecycle.test.cjs`, `scripts/native-artwork-startup-trace.cjs`, `docs/audits/ARTWORK-PERFORMANCE-AUDIT.md`
- Left untouched: `TitleReads`, scroll and momentum code, caches, other tests, configuration, `WORKLIST.md`, `AGENTS.md`
- Profiles retained: baseline `C:/Users/Macho/AppData/Local/Temp/anideck-artwork-trace-4iPhZH/user-data`; post-fix `C:/Users/Macho/AppData/Local/Temp/anideck-artwork-trace-ZDSetM/user-data`
- Evidence: baseline `C:/Users/Macho/AppData/Local/Temp/anideck-artwork-trace-output-3/trace.json`; post-fix `C:/Users/Macho/AppData/Local/Temp/anideck-artwork-trace-output-postfix/trace.json`
- Checks: `node --check` exit 0 on `src/app.js`, `tests/backdrop-lifecycle.test.cjs`, and `scripts/native-artwork-startup-trace.cjs`. Backdrop tests failed on the previous source (two sharp nodes, plus writes after detach, config change, and a failed image). After the edit, the focused command above passed 24 tests. The post-fix trace exited 0 with 17 assertions passed. `npm test` was not run.
- Commit / push: none
- Next action for the coordinator: review the backdrop change. The episode-list scroll replacement is still open and was not edited.

## Integrated coordinator verification — 6 November 2026

Reviewed and integrated the scoped backdrop change, lifecycle tests and corrected diagnostic. Independent native rerun against main source passed all 17 assertions: cold overlapping calls produced one fade and one final image; warm produced one final image. Network instrumentation recorded five completed fixture requests in each child, including HTTP-cache completions, with no external HTTP attempts. This checks generated lifecycle behavior, not real-user scrolling latency.

Coordinator syntax checks, 24 focused checks and the complete 724-test suite passed. Full-suite fixtures required unrestricted loopback/temp-file access. Evidence remains in the enclosing workspace outputs/backdrop-integrated-review/trace.json and outputs/backdrop-lifecycle-full-tests.log. No installer was rebuilt. The episode list still changed during the active scroll marker; title patch deferral is the next separate task.

## Title scroll deferral — coordinator follow-up, 6 November 2026

TitleReads now keeps dirty metadata pending while App.scrollUntil is active, coalesces retries per batch, and rechecks after asynchronous markup preparation before touching the DOM. A new read clears the previous scheduled retry; navigation/title/account validity still gates every retry. The latest snapshot is applied after input settles. Native wheel behavior and offsets are unchanged.

Three focused regressions cover extended input with a single eventual latest-value patch, cancellation on navigation/title/account changes, and input resuming while markup is prepared. Full suite: 727 passed. Updated native trace: 17 assertions passed in two isolated processes; each retained the episode list throughout synthetic scroll activity and committed exactly once afterwards, with one backdrop image. Evidence: enclosing workspace outputs/title-scroll-native/trace.json and outputs/title-scroll-full-tests.log. These synthetic offscreen lifecycle checks do not establish actual wheel/middle-mouse latency or public-host loading speed. Earlier statements that scroll replacement remained open describe the pre-deferral checkpoint. No installer rebuilt for this increment.
