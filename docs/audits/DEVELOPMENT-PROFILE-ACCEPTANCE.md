# Development-profile native acceptance

This checks how real Electron selects a profile directory, using main.js's actual profile-selection block in disposable fixtures. It is a verification task. No runtime, test, config or installer file changed, and no uninstall or migration work was done.

## Scope and inputs

- **Harness:** `scripts/native-development-profile.cjs` (new).
  - Usage: `node scripts/native-development-profile.cjs <app-root> <electron.exe> [fixture-parent]`.
  - Run from checkout `work/anideck-claude` on `agent/claude-installer-audit` (base `7809185`). The reviewed changes already in this checkout were left as they were.
- **Source under test:** the coordinator main checkout `work/anideck-upload`, read-only.
  - Revision `e919cb0204b5a302ca22727447ef3612a1dce048`; `main.js` clean.
  - `main.js` sha256 `86832dff9875fbccdc4323dc242834b62809e373d7ceb70bcb725438600ba46b`.
  - Selection block: lines 23–46, from `const smokeTest =` up to `const CONFIG_FILE`, sha256 `8af41b9211f660e992d8458672953a573736d60b09c75c5b6a9bae31de237ac6`.
  - Each child process checks this hash again before running the block.
- **Runtime:** Electron **33.4.11** (Node 20.18.3, Chrome 130.0.6723.191).
  - The coordinator checkout's `node_modules/electron` has no `dist/` binary. The executable came from the preserved Desktop `anitrack` checkout (`node_modules/electron/dist/electron.exe`, `dist/version` = 33.4.11, the same version as the lockfile).
  - It was executed only. Nothing in that checkout was written.
  - Nothing was installed or downloaded.

## Method

1. **Fixture root.** The harness creates a new fixture root, `anideck-devprofile-*`, under the given parent. Inside it are:
   - `appData-legacy/`, holding `AniShelf/marker.txt` and the simulated default profile `AniDeck Fixture/marker.txt`;
   - `appData-nolegacy/`, holding `AniDeck Fixture/marker.txt`;
   - `tmp/`;
   - two generated shell checkouts, `checkouts/alpha` and `checkouts/beta`;
   - a junction, `links/alpha-junction`, pointing to `checkouts/alpha`.
2. **Launches.** Each case is a separate `electron.exe <checkout>` launch.
   - Working directory is the fixture root. `TEMP`/`TMP` point at the fixture's `tmp/`, and `ELECTRON_RUN_AS_NODE` is removed.
   - The real smoke flag is passed as a real command-line argument when the case needs it.
3. **Before any selection code runs**, the generated shell:
   - sets `appData`, `userData` and `sessionData` to fixture paths;
   - aborts if any of them, or `os.tmpdir()`, falls outside the fixture.
4. **Running the real block.** The shell then reads `main.js` from the given app root and extracts the selection block. It runs the block with `vm.compileFunction`, passing:
   - the real `fs`, `path`, `os`, `crypto`, `process`, Electron `app.setPath`/`getPath`, and the shell's real `__dirname`;
   - a `require` that answers only `./package.json`, with the case's `testBuild` metadata.

   The selection algorithm is not copied into the harness.
5. **Packaged switch (controlled).** In packaged cases the block receives a small view of the real `app` with `isPackaged` fixed to `true`; `getPath`/`setPath` still go to the real `app`. Source cases pass the **real** `app` object, and its real `isPackaged` is `false`.
6. **After `app.whenReady()`.** The shell:
   - reads any existing `fixture` cookie from `session.defaultSession`;
   - sets a new one on `https://fixture.invalid/` (a local cookie store write; nothing is fetched);
   - flushes the store and reports `getPath` results and `session.storagePath`.

   It creates no window. It makes no Discord, provider or network calls.
7. **After each launch**, the harness compares the whole fixture tree before and after. Any added or changed path outside the selected profile fails the case; the only exception is creating the `AniDeck Development` parent folder. All three marker files are also hash-checked after every launch.
8. **Real-profile check.** The only check against the real profile location is whether a folder named after the unique fixture product name, `%APPDATA%\AniDeck Fixture`, exists. The harness refuses to run if it already exists. It does not read any other real `APPDATA` content.

## Results

Command:

```text
node --check scripts/native-development-profile.cjs   -> syntax ok
node scripts/native-development-profile.cjs <work/anideck-upload> <anitrack electron.exe> <scratchpad>
  -> "Native development-profile check passed (11 launches)", exit 0
```

Fixture kept at `<scratchpad>\anideck-devprofile-JLvpFx`, with full results in `report.json` there. It was not deleted.

| Case | isPackaged | testBuild / flag | Launched as | Selected `userData` = `sessionData` | Checks |
| --- | --- | --- | --- | --- | --- |
| source-alpha-1 | real `false` | – / – | `checkouts\alpha` | `appData-legacy\AniDeck Development\100bae62ef7a8937` | Development profile; legacy marker untouched; no writes outside the profile |
| source-alpha-2 | real `false` | – / – | `checkouts\alpha` | same `100bae62…` | Same folder; cookie from run 1 present, so the browser session was reused |
| source-alpha-upper-case | real `false` | – / – | `checkouts\ALPHA` (`__dirname` stayed upper-case) | same `100bae62…` | The selection code's Windows case folding gave the same profile; previous cookie present |
| source-alpha-junction | real `false` | – / – | `links\alpha-junction` | same `100bae62…` | Same profile (see limit 2) |
| source-beta | real `false` | – / – | `checkouts\beta` | `…\AniDeck Development\8d359179194f9953` | Different profile; no alpha cookies |
| source-flag-without-testBuild | real `false` | – / flag | `checkouts\alpha` | same `100bae62…` | Flag alone does not trigger smoke mode |
| controlled-packaged-legacy | controlled `true` | – / – | `checkouts\alpha` | `appData-legacy\AniShelf` | Legacy folder used in place; marker unchanged |
| controlled-packaged-preview-legacy | controlled `true` | `preview-fixture` / – | `checkouts\alpha` | `appData-legacy\AniShelf` | Preview build shares the legacy profile; previous cookie present |
| controlled-packaged-default | controlled `true` | – / – | `checkouts\alpha` | `appData-nolegacy\AniDeck Fixture`, the pre-set default, not changed | Default kept; marker unchanged |
| controlled-packaged-smoke | controlled `true` | `preview-fixture` / flag | `checkouts\alpha` | `tmp\anideck-smoke-RfTmk6` | Smoke takes priority over the legacy folder; no cookies |
| source-smoke | real `false` | `preview-fixture` / flag | `checkouts\alpha` | `tmp\anideck-smoke-uE942q` | Smoke takes priority over the development profile; no cookies |

In every case `userData` equals `sessionData`, and `session.storagePath` equals the selected folder. All marker hashes were unchanged after every launch. No `%APPDATA%\AniDeck Fixture` folder appeared.

**Negative control.** The same harness was run with an app root holding base `7809185:main.js`, the code from before development isolation (`git show` into the scratchpad). It **failed**, exit 1. All 6 source cases selected `appData-legacy\AniShelf`, beta matched alpha, and beta saw alpha's cookie. The packaged and smoke cases still passed, as expected for behavior that has not changed. That fixture, `anideck-devprofile-zUh2qf`, was also kept.

## Limits

1. **Packaged cases are a controlled simulation, not an installed build.** `isPackaged` was fixed in a view of the real `app`. An actual installed or `win-unpacked` `AniDeck.exe` was not launched; that would read real `resources/config.json` and start the whole app. The simulated default profile is `AniDeck Fixture`, standing in for `%APPDATA%\AniDeck`, and it was set explicitly before the block ran instead of being computed by Electron from the product name.
2. **The junction case does not test the selection code's own link resolution.** Node had already resolved `__dirname` to `checkouts\alpha` while loading the module, before `fs.realpathSync.native` ran. That is real end-to-end behavior, but it doesn't show the selection code's own resolution. The vm tests in `tests/development-profile.test.cjs` cover that branch.
3. **Only the selection block ran.** Lines 1–22 of `main.js` did not run: logging guards, the user-agent fallback, the smooth-scrolling switch and `setAppUserModelId`. Neither did anything after the block (stores, windows, IPC). Whether some earlier Electron startup step writes to the default `userData` before the block runs was observed only for the generated shell: no `%APPDATA%\AniDeck Fixture` folder appeared. It was not observed for a full AniDeck launch.
4. **The write check covers only the fixture tree.** Writes elsewhere on the machine, for example in Chromium's machine-wide locations or the real `%LOCALAPPDATA%`, were not monitored beyond the unique-name `APPDATA` check.
5. **No negative test for the write check.** The "no writes outside the selected profile" check is a direct before/after comparison. It never fired in these runs and was not deliberately triggered.
6. **Windows only.** The macOS path behavior was not run natively.

## Handoff

- Changed or added for this task: `scripts/native-development-profile.cjs` and `docs/audits/DEVELOPMENT-PROFILE-ACCEPTANCE.md`.
- Earlier reviewed changes, unchanged and still uncommitted: `main.js`, `docs/DEVELOPMENT.md`, `tests/*`. The untracked `AGENT-*.md` files and `docs/audits/INSTALLER-PROFILE-AUDIT.md` are preserved.
- Checks run:
  - `node --check` on the harness;
  - the native harness against coordinator main (pass, 11 launches);
  - the negative control against the base `main.js` (expected failure).
- Not run: existing unit tests. Runtime and tests are unchanged for this task.
- Fixtures were kept and nothing was cleaned up recursively.
- No commit or push.

## Coordinator acceptance — 6 November 2026

Independently reran the harness against clean coordinator main.js at e919cb0 using Electron 33.4.11. All 11 launches passed; report retained in enclosing workspace outputs/anideck-devprofile-2VKYvo/report.json and log outputs/development-profile-review.log. Repeated the negative control using 7809185 main.js in a generated source root: exit 1 as expected, detecting shared alpha/beta profile and leaked generated cookie. That fixture is outputs/anideck-devprofile-pq7xwI; log outputs/development-profile-baseline-review.log. Neither run created the unique fixture product folder in normal APPDATA.

Accepted as a Windows native selection-block harness, with the report's controlled packaged-mode, generated-shell, junction and fixture-only write-monitoring limits retained. This increment changes no runtime; the existing 727-test application result remains the last full suite. No installer, real profile, uninstall or migration was exercised.
