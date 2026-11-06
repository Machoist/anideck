# Installer and profile ownership audit

Audit only. No source, test, configuration or installed profile was changed. Designs here are proposals for review, not approved work. Revision 2 includes the coordinator review corrections listed in the last section.

## Scope and base

- Checkout `work/anideck-claude`, branch `agent/claude-installer-audit`, base `7809185210201ebc480817ec2ba179304459a6a1`.
- Read: `main.js`, `preload.js`, `package.json` (`build`), `src/api.js` (`LocalTracker`, device ID), `src/app.js` (settings), `src/player.js` and `src/watcher.js` (watch log), `src/profile-account.js` (cloud session), `src/title-artwork-store.js`, `src/subtitle-font-native.cjs`, `src/system-checks-native.cjs`, `scripts/release-guard.cjs`, `scripts/audit-package.cjs`, `scripts/native-smoke.cjs`, `scripts/mac-smoke.cjs`, the isolation lines of the other `scripts/native-*.cjs`, `.github/workflows/check.yml` and `mac-test.yml`, and the related tests.
- This checkout has no `node_modules`. Installer behavior comes from reading the **app-builder-lib 25.1.8** NSIS templates and `out/targets/nsis/NsisTarget.js` in the main checkout (`work/anideck-upload/node_modules`). I only read them; nothing was modified or executed.
- Not inspected: the installed user's profile, registry, secrets, private config or the contents of temp folders. I ran no installer, uninstaller, app, build or tests.

## Established facts (observed in source)

### Identity and install layout

| Item | Value | Evidence |
| --- | --- | --- |
| Compatibility app ID | `com.machoist.anishelf` | `package.json` `build.appId`; `main.js:15` |
| Names | `productName` `AniDeck`, npm `name` `anideck` | `package.json` |
| NSIS mode | `oneClick: true`, `perMachine: false`, desktop and Start Menu shortcuts named `AniDeck`; no custom NSIS include; `deleteAppDataOnUninstall` unset | `package.json` `build.nsis`; no `*.nsh` in the repository |
| Windows build target | `nsis` only | `package.json` `build.win.target` |
| Install directory | `%LOCALAPPDATA%\Programs\anideck`, from `sanitizedName` because the build is one-click and per-user. An existing registry `InstallLocation` wins | `NsisTarget.js:156`; `targetUtil.js:40-41`; `templates/nsis/multiUser.nsh:26-40` |
| Registry keys | HKCU `Software\<guid>` and `…\Uninstall\<guid>`, where `guid = UUID.v5(appId, …)` | `NsisTarget.js:147-153`; `multiUser.nsh:8-9` |
| Single instance | **None.** No `requestSingleInstanceLock` or `second-instance` handler | `rg` over `main.js`/`src` |

### Profile selection (`main.js:20-31`)

1. If `smokeTest` is true, the profile goes to a new `mkdtemp` folder, `os.tmpdir()/anideck-smoke-*`, for both `userData` and `sessionData`. `smokeTest` needs a truthy `package.json` `testBuild` **and** `--anideck-smoke-test` (`main.js:22`).
2. Otherwise, if `%APPDATA%\AniShelf` exists, it is adopted in place for both paths (`main.js:23,28-30`). Nothing is copied or moved, and nothing records that the folder belongs to AniDeck. Any existing folder with that name qualifies.
3. Otherwise Electron's default is used. I infer `%APPDATA%\AniDeck` from Electron's documented preference for `productName`; this was not checked at runtime.

### Data inside the selected profile (all of it is removed if the folder is removed)

`dataDir()` is `app.getPath('userData')` (`main.js:35`). `sessionData` is the same folder.

- **`store.json`** (`main.js:36,51-53`). The whole object is cached in memory and rewritten in full on each save. Keys are written by the renderer through `native.set` (`preload.js:10-11`). Examples:
  - `localTracker`: the **on-device watchlist with status and progress**. Its source comment says "Optional on-device tracking. No provider credentials or network writes", so there is no server copy (`src/api.js:1179-1186`).
  - `watchLog`: local watch history (`src/player.js:874-878`).
  - `settings` (`src/app.js:230,848`).
  - `deviceId` (`src/api.js:124-127`).
  - `jellyfin`, `localServer`, `requests`, `requestWebhook`, `notificationPreferences`, `notifications`, `anideckSocialOwner`, `kitsuMatches*`, `volume`, plus caches and mappings: `ratingCache2`, `queueArt`, `hdArt`, `alArt`, `malIds`, `anilistIds`, `alToKitsu`, `catalogEligibilityV1`, `publicScheduleWeekV1`, and release-notice state.
  - The window size and position (`main.js:109-117`).
- **`secrets.json`**: encrypted with `safeStorage`, or base64 only when encryption is unavailable (`main.js:56-78`). It holds:
  - `anideckIdentity`: the **AniDeck account recovery key** `adk_…` (`src/api.js:1184,1187`). Only a SHA-256 of it identifies the account (`src/api.js:1183`), so if the user has no copy, removal loses access to that account.
  - `anideckCloud`: the cloud session (`src/profile-account.js:17,34`).
  - `anilistAuth`, `kitsuAuth`, `traktAuth`, `jellyfinToken`.
- **`subtitle-font.json`**: the imported subtitle font (`src/subtitle-font-native.cjs:12`; `main.js:874`).
- **Chromium session data**: cookies, cache, local storage, and IndexedDB `anideck-public-title-artwork` (`src/title-artwork-store.js:24`). The `Partitions/` folder holds `persist:anishelf-web` (`main.js:781`), the provider/Cloudflare session cookies, and `persist:anishelf-oauth` (`main.js:839`), the AniList/Kitsu login cookies.
- `config.json` is not profile data. Packaged builds read it from `resources`, development builds from the repository (`main.js:34`).

### Installer and uninstaller (template behavior, not executed)

- **Uninstall removes:**
  - `$INSTDIR` (`uninstaller.nsh:169`).
  - Unless `--keep-shortcuts` is passed, the AUMID registration and both shortcuts, whose names come from the registry `ShortcutName` with a fallback to `PRODUCT_FILENAME` (`uninstaller.nsh:172-189`; `common.nsh:85-106`).
  - The registry keys (`uninstaller.nsh:232-236`).
- **When app data is deleted** (`uninstaller.nsh:198-212`). An **explicit `--delete-app-data`** on the uninstaller command line **always** means delete. If it is absent, deletion happens only when `DELETE_APP_DATA_ON_UNINSTALL` is defined (`NsisTarget.js:435-436`, from `deleteAppDataOnUninstall`) **and** the run is not `--updated`. AniDeck defines neither, so the configured default keeps data. A caller can still request deletion explicitly.
- **What deletion would remove:** `$APPDATA\anideck`, `\AniDeck` and `\anideck` (`uninstaller.nsh:219-226`). These are the same folder on case-insensitive NTFS. **`AniShelf` is not in the list.**
- **Updates.** A new installer runs the old uninstaller through `uninstallOldVersion`. It passes `--delete-app-data` when the installer's `${isDeleteAppData}` is true, otherwise `--updated` (`include/installUtil.nsh:202-207`). So a normal update keeps data, but an update started with deletion requested passes deletion through. I could not find where `${isDeleteAppData}` and `${isUpdated}` are defined in the templates (`grep` finds only uses); they probably come from NSIS resources fetched at build time, and their exact parsing is unverified.
- **Silent state.** One-click uninstall shows an OK/Cancel confirmation, then calls `SetSilent silent` **before** `customUnInit` runs (`uninstaller.nsh:11-28`). `${Silent}` inside custom hooks is therefore true even when a person started the uninstall interactively. One-click mode has no uninstaller pages (`uninstaller.nsh:136`).
- **Running app.** `un.checkAppRunning` runs in both branches (`uninstaller.nsh:12,19`). It is reasonable to assume it targets the installed executable; it cannot detect a development `electron.exe` or another copy of AniDeck. That is unverified.

### Test, development and CI runs

- **CI.** Windows CI sets `testBuild` and runs `native-smoke.cjs` (`check.yml:38,41`), which always passes `--anideck-smoke-test` (`native-smoke.cjs:5`). Mac CI does the same (`mac-test.yml:34,40`; `mac-smoke.cjs:3`).
- **Other harnesses.** The other 14 `scripts/native-*.cjs` contain `mkdtempSync` and set their own `userData` (I read `native-navigation-check.cjs:8` and `native-subtitle-font.cjs:4,7`). `native-subtitle-font.cjs` creates its folder in `path.resolve('..')`, not the OS temp folder.
- **Smoke exit.** The child process ends with `app.exit(0|1)` (`main.js:744-745`). Neither the child nor the parent scripts delete the `mkdtemp` folder.
- **Package checks.** The release guard and package audit keep profile files out of packages. They do not check profile paths or NSIS options.

## Findings

Each finding is labelled as an established fact or a design observation.

1. **F1 (fact): Source runs share the installed profile.** `npm start` has no `testBuild`, so it falls through to `AniShelf` or the default `AniDeck` folder, the same folders an installed copy uses. With no single-instance lock and whole-file `store.json` rewrites (`main.js:51-53`), a source run and an installed run open at the same time can each overwrite the other's saved state. That outcome is inferred from the code and was not reproduced. It is also how an old checkout, such as the preserved Desktop `anitrack` one, could have created or used `AniShelf`.
2. **F2 (current design choice): Installed builds share one profile.** Preview/test builds without the smoke flag share the profile with releases. I treat this as intended compatibility, not a bug. A zipped portable copy (WORKLIST mentions portable archives; `package.json` defines only `nsis`) would share it too, since profile choice does not depend on install location.
3. **F3 (current design choice): Uninstall keeps data by default.** The configured default keeps all profile data. The explicit `--delete-app-data` path exists in the template and would skip `AniShelf`.
4. **F4 (fact): Folder names do not prove ownership.** The legacy branch adopts any existing `AniShelf` folder, and source runs, preview builds, release builds, and possibly portable copies or old checkouts all use the same two folder names. A deletion design based on those names could remove data another copy still uses.
5. **F5 (fact): Smoke folders are never cleaned up.** Smoke and harness `mkdtemp` folders are not removed. Their contents depend on what each run did. I did not inspect them and make no claim that they hold no secrets.
6. **F6 (fact, limited): No updater in source.** `electron-updater` is a dependency but is not referenced in `main.js` or `src/`. So **the current source does not create an updater cache**. That says nothing about whether such a folder exists on a given machine, for example from an older build.

## Proposed ownership and retention design (for review; no deletion code)

The core rule: **remove only a profile the uninstaller can positively prove belongs to this installation alone. Anything unverified, shared or ambiguous is kept.**

### A. Give source runs their own profile (recommended first; no deletion involved)

- When `!app.isPackaged && !smokeTest`, set `userData` and `sessionData` to a separate folder such as `%APPDATA%\AniDeck Development`. Do this **before** the legacy check.
- Packaged preview and release builds keep today's selection, including legacy adoption, unchanged.
- Do not copy, move or rename existing data. A developer who needs a signed-in source run signs in again. An explicit opt-in to use the installed profile, such as an environment variable, is an open product choice (see Q1).
- Tests: a vm-slice test like `tests/branding-support.test.cjs:3-8` for the unpackaged branch. The existing legacy and smoke tests must keep passing unchanged.

### B. Ownership marker (record-only; needed before any removal option)

- Packaged runs that are not smoke runs write or update `anideck-profile.json` in the selected `userData`. It records:
  - schema version;
  - `appId`;
  - whether the folder was adopted as legacy;
  - a `claimants` list of `{installDir, kind: 'installed'|'preview'|'portable', lastSeen}` entries, built from `path.dirname(process.execPath)`.
- Source runs (after A) never write to the installed profile, so they never appear as claimants.
- The marker records which copies used the profile. It is **evidence, not proof**: an older build or an old checkout that ran before the marker existed leaves no trace. The legacy flag and the marker's first-written time let the uninstaller treat older use as unknown.

### C. Uninstall decision (later phase, separate approval)

The uninstaller offers to remove data only when **all** of these hold. Otherwise it keeps the data and says why, naming the exact path.

1. **Not an update.** Neither `--updated` nor an update hand-off. Updates never remove data, even if `--delete-app-data` is passed through. This deliberately overrides the stock pass-through.
2. **Truly unattended runs** keep data. The test must use the **original** command line (`$CMDLINE` contains `/S`), because one-click mode turns every uninstall silent after confirmation. Whether parsing `$CMDLINE` is reliable is unverified.
3. **Path checks.** The profile path is resolved to its canonical form and stays under the current user's `%APPDATA%`. The folder and its parent are not reparse points (`GetFileAttributes` with `FILE_ATTRIBUTE_REPARSE_POINT` not set), and folder redirection or OneDrive does not move it outside the expected root.
4. **Ownership.** The marker exists, its `appId` matches, and every claimant whose `installDir` still exists is this `$INSTDIR`, compared case-insensitively after canonicalization. Any other surviving claimant, or a legacy folder adopted before the marker existed with no evidence afterward, means keep.
5. **Not in use.** No copy is running against the profile. Chromium's profile `lockfile` must not be held; this is unverified. If that can't be determined, keep.
6. **Consent.** The person agrees in a dialog that defaults to **Keep**. It shows the exact folder path and says plainly what goes:

   > Remove AniDeck data stored on this PC at `<path>`? This deletes your on-device watchlist and episode progress, watch history, settings, the AniDeck account recovery key (keep a copy first, or you cannot sign back in to that AniDeck account), saved AniList, Kitsu, Trakt and Jellyfin sign-ins, the subtitle font, and browser sessions and caches. Lists stored on AniList or Kitsu themselves are not affected. **Keep my data** is the default.

7. Only then would deletion run, limited to that one verified folder. If deletion fails, report it and leave whatever remains. Recursive deletion code is **out of scope** for this task.

### D. Smoke profile cleanup (separate, small)

- The **parent** script (`native-smoke.cjs`, `mac-smoke.cjs`) creates the temp folder, with a random name under `fs.realpathSync(os.tmpdir())` and a marker file. It passes the folder to the child. `main.js` accepts it only when `smokeTest` is true and the path is inside the real temp root with the `anideck-smoke-` prefix.
- After the child's `close` event, meaning the process has exited and released its handles, the parent checks:
  - the real path is still inside the temp root;
  - `lstat` shows a plain folder, not a link or junction;
  - its own marker is present.
- If all checks pass, it removes the folder with `fs.rmSync({recursive:true, maxRetries, retryDelay})`. If any check fails, it prints the path, keeps the folder and reports a warning. Cleanup failure must not hide the smoke result.
- Never delete inside the child before `app.exit`.
- `tests/mac-support.test.cjs:23-27` currently pins `mkdtemp` inside `main.js`. It would need a matching update in that change. Verify with a disposable fixture folder.

## Open product questions (cannot be settled from source)

- **Q1.** Should source runs ever be able to use the installed profile on purpose, through an explicit opt-in, or always stay isolated?
- **Q2.** Should data removal live in the uninstaller (as in C) or in the app, for example a "Remove data from this PC" action in Settings > Account, where the live profile path and running state are known? The in-app option avoids the uninstaller's silent-mode and running-instance problems.

## Test coverage

| Behavior | Covered | Gap |
| --- | --- | --- |
| Legacy chosen when it exists, else no `setPath` | `tests/branding-support.test.cjs:3-8` | Unpackaged runs; both folders existing |
| Smoke isolation skips the legacy check | `tests/mac-support.test.cjs:23-27` | That both conditions are needed; cleanup |
| App ID, names, shortcut name | `tests/branding-support.test.cjs:9-13` | NSIS `oneClick`, `perMachine`, no deletion option |
| Smoke runs never publish to Discord | `tests/discord-presence.test.cjs:33` | — |
| Private files kept out of the package | `release-guard.cjs`, `audit-package.cjs` | Nothing covers uninstall behavior |

## Remaining unknowns

- The actual default `userData` for `npm start` and for packaged builds. Needs a disposable run that logs `app.getPath('userData')`.
- Where `${isDeleteAppData}` and `${isUpdated}` are defined, and how `$CMDLINE` and `/S` behave after `SetSilent` in the built uninstaller.
- Whether `un.checkAppRunning` catches every running copy; whether NSIS `RMDir /r` follows junctions; whether Chromium's `lockfile` reliably shows the profile is in use on Windows.
- How shortcuts, install location and `ShortcutName` carry over on a machine with a real AniShelf-era install.
- Whether portable copies are actually distributed from this source; `package.json` builds only `nsis`.
- I ran no tests; this is a documentation-only change.

## Smallest safe implementation proposal

**Step A only**: isolate unpackaged source runs into their own profile, leaving packaged selection, legacy adoption, the app ID and partition names untouched, with one focused vm-slice test.

It deletes nothing, migrates nothing and leaves installed preview and release data alone. It also removes the largest everyday overlap (F1) before any ownership marker or removal option is built. B, C and D each need their own approval.

## Revision 2 corrections

1. **Update semantics.** "Always prevents deletion" is replaced with the qualified behavior, including the explicit `--delete-app-data` paths in `installUtil.nsh:202-207` and `uninstaller.nsh:198-212`.
2. **Ownership.** The literal-folder-name `RMDir /r` proposal is withdrawn and replaced by the ownership design in B and C. It covers legacy adoption, shared source and preview use, canonical paths and reparse points, other running copies, and update and silent runs. Anything unverified is kept.
3. **What removal affects.** The data inventory and consent text now cover the watchlist and progress, watch history, the recovery key, sign-ins, browser sessions and caches.
4. **Smoke cleanup.** The proposal now waits for the child to exit, checks ownership and handles failure. The claim that temp folders hold no secrets is removed.
5. **Design choices and the updater claim.** Shared preview profiles and default retention are described as current design choices. The updater statement is limited to what the source does.

## Handoff

- Agent/task: Claude, follow-up to the installer/profile audit (`AGENT-REVIEW.md`). Coordinator: Codex.
- Checkout `work/anideck-claude`. Branch `agent/claude-installer-audit`, base `7809185210201ebc480817ec2ba179304459a6a1`.
- Changed files: `docs/audits/INSTALLER-PROFILE-AUDIT.md` only (untracked). `AGENT-TASK.md` and `AGENT-REVIEW.md` are untouched and untracked.
- Checks actually run: `git status`/`git log`, then `rg`/`sed`/`grep` reads of the files cited above and of the app-builder-lib 25.1.8 templates in the main checkout. I also listed `%LOCALAPPDATA%\electron-builder\Cache\nsis` while looking for the macro definitions; it does not exist. No tests, builds, installers or app launches.
- Commit/push: none.
