# Scroll input trace

No renderer stall was reproduced. This fixture does not support a momentum, parallax, or cache-policy change.

Measured command, exit 0:

```
node scripts/native-scroll-input-trace.cjs C:\Users\Macho\AppData\Local\Temp\anideck-electron-v33.4.11\electron.exe C:\Users\Macho\Documents\Codex\2026-10-23\files-mentioned-by-the-user-codex\work\anideck-upload C:\Users\Macho\AppData\Local\Temp\anideck-scroll-input-output
```

Syntax check: `node --check scripts/native-scroll-input-trace.cjs`, exit 0. Trace: `C:\Users\Macho\AppData\Local\Temp\anideck-scroll-input-output\trace.json`. Profile retained at `C:\Users\Macho\AppData\Local\Temp\anideck-scroll-input-x0g7Nv\user-data`. Origin `http://127.0.0.1:64161`. No external HTTP. Proxy variables were unset. Seventeen assertions passed.

## Source and runtime

The harness loads the explicit source root, not this worktree's older renderer. Source root `C:\Users\Macho\Documents\Codex\2026-10-23\files-mentioned-by-the-user-codex\work\anideck-upload`, HEAD `1003adf803576b16b5ba8eab23de4a1f06cce52e` ("Verify development profiles with isolated native launches"). `src` matches renderer `88ec7229595702035fc628ecfc8d46cbbedcf92d`: that commit is an ancestor and `git diff --stat 88ec722 HEAD -- src` was empty, so the loaded title scroll deferral is the `88ec722` renderer. SHA-256 of the loaded files includes `src/title-reads.js` `af53156803e73c6691b820b4eebbca3816038723905a783e5af3be057bfc867e`, `src/smooth-wheel.js` `9be47898470a1ecc54667a201edd4ba4a37e468638a35c96d0ae2ee5f6d3fb68`, and `src/app.js` `1e5482f9afed57ac1cec41829a78c862df2914964150ec3b080137b083917c12`. The loaded `TitleReads.paint` contains both `scrollUntil` gates.

Parent Node v24.22.1, pid 11508. Cold Electron pid 32736. Warm Electron pid 25296. Electron 33.4.11, Chrome 130.0.6723.191, child Node 20.18.3. Zoom 1. The window was a normal `BrowserWindow`, not offscreen, with `backgroundThrottling: false`.

## Input that moved a surface

`webContents.sendInputEvent` `mouseWheel` was the API for every measured wheel. A hidden window delivered no trusted wheel and did not scroll. `showInactive()` made the fixture window visible and unfocused; that is the mode for every measurement below. The fixture window was not focused, and this was not a physical mouse.

On this build, positive `deltaY` and positive `deltaX` produced trusted wheel events but left both offsets unchanged. Negative `deltaY` (`-120`) and negative `deltaX` (`-160`) moved the surfaces. The page events for those successful sends were `isTrusted: true`, `deltaY: 120` or `deltaX: 160`, `defaultPrevented: false`, and `cancelable: false`. Send counts matched trusted event counts. No DOM `dispatchEvent` and no `scrollTop` assignment was the input under measurement. Resets back to offset 0 between gestures are labeled `fixture-setup-assignment` in the trace.

| Gesture | Surface | Before | After | Trusted | Largest frame gap | Long tasks | Layout shifts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cold home vertical | `#main` only | `scrollTop` 0 | 1416 | 12 | 8.4 ms | 0 | 0 |
| Cold rail | `.rail` only | `scrollLeft` 0 | 960 | 6 | 4.3 ms | 0 | 0 |
| Cold title, metadata deferred | `#main` after mount | mount `scrollTop` 480 | 1678 | 16 | 29.1 ms | 0 | 0 |
| Cold title, settled | `#main` only | 0 | 600 | 6 | 12.4 ms | 0 | 0 |
| Warm home vertical | `#main` only | `scrollTop` 0 | 1416 | 12 | 8.2 ms | 0 | 0 |
| Warm rail | `.rail` only | `scrollLeft` 0 | 960 | 6 | 4.3 ms | 0 | 0 |
| Warm title, metadata deferred | `#main` after mount | mount `scrollTop` 480 | 1678 | 16 | 33.3 ms | 0 | 0 |
| Warm title, settled | `#main` only | `scrollTop` 0 | 600 | 6 | 4.3 ms | 0 | 0 |

`#main` overflowed (`scrollHeight` 2176, then 2438 after the title mount, against `clientHeight` 760). The rail overflowed (`scrollWidth` 2008 against `clientWidth` 480). Vertical wheels were aimed at the carousel or title hero (`slide-text`, inside `#main`, outside `.rail`). Horizontal wheels were aimed at a rail card. The week row was not under the pointer. The second-largest title gap was 4.6 ms cold and 8.4 ms warm, so the 29.1 ms and 33.3 ms figures are single samples, not a run of stalled frames.

## Title deferral under real input

Wheels started before `TitleReads.mounted` and continued through optional metadata (AniList details delayed 450 ms, tracking 400 ms, requests 300 ms, core 20 ms, budget 160 ms). Both launches recorded six `TitleReads.paint` calls while `Date.now() < App.scrollUntil`. Each left `.ep-list` as `list-1`, `.detail-main` and `.title-sections` connected, and the genre text `Core`. The next paint ran with the marker inactive and replaced `list-1` with `list-2`, set the genre to `Generated`, and kept the main column and tab nav. That commit landed 41 ms after the cold wait started and 46 ms after the warm wait. The final episode title was `Generated still`.

## Cold images versus a warm page

Images were solid PNGs: carousel 3000×980 (41,005 bytes), backdrop 3000×1100 (46,006 bytes, 400 ms delay only when the request reached the server), plus the initial backdrop and two stills. Cold server sent 104,242 bytes, including every PNG at status 200. Warm server sent 129 bytes, which was only `fixture.html`; every PNG completed `fromCache: true` with resource `transferSize` 0. Cold carousel `transferSize` was 41,305 during the home wheel. Cold backdrop resource duration was 410 ms; the warm cached backdrop duration was 10.3 ms.

`Image` constructors during the home wheel were 0 on both launches. The title wheel constructed 2 images on both launches. Totals for each launch were 3 constructors and 2 `ArtworkImages.measure` calls. Those counts are not decode counts. Resource `decodedBodySize` matches the PNG file size here and is not a decode count. Display sizes were available: carousel `naturalWidth` 3000, backdrop node 3000×1100, episode still 1280. `ArtworkImages` kept 0 fixture rows because `publicImage` rejects this HTTP origin. The cold transfer did not add a long task or a larger frame gap than the warm cached run.

## Middle button

Both launches sent a trusted middle `mouseDown`, a move, and a `mouseUp` through the same `sendInputEvent` path, on the visible unfocused fixture window. The page received one trusted `pointerdown` with `button` 1. `#main` `scrollTop` stayed 0. Middle-button autoscroll is unverified. No DOM event was substituted.

## Limits

The fixture uses generated catalog rows and solid PNGs, not photographic artwork, a 50-row episode list, or a public provider. Home and title handlers are the real slices from the source root, with account and network calls stubbed inside the loopback page. Frame gaps and long tasks are observations from this window, not an FPS threshold. `showInactive` is not physical-mouse acceptance. Full commit hashes were passed in `SCROLL_TRACE_REVISION` and `SCROLL_TRACE_RENDERER` because putting a 40-character hash on the Electron command line aborted the process before the script ran.

## Coordinator review — 6 November 2026

Independent rerun against main 1003adf passed all 17 assertions using Electron 33.4.11, generated loopback artwork and a retained disposable profile. Both children selected sendInputEvent-showInactive. Trusted wheel events moved overflowing main and rail surfaces; title metadata preserved the list during active input and applied afterwards. Middle-button verification was false in both children. Evidence: enclosing workspace outputs/scroll-input-review/trace.json and outputs/scroll-input-review.log.

Accepted as controlled trusted-input evidence, not physical mouse or full photographic/public-catalog performance acceptance. The harness pins renderer baseline 88ec722 and rejects later committed src changes; update that deliberate baseline before using it to measure a new renderer. No runtime change is justified by the absence of a stall in this fixture. Next user acceptance should use the combined preview, especially first boot and middle mouse.
