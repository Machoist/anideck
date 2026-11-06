# Windows data-retention design

Status: **design for review, revision 2.** The coordinator accepted the retain-by-default direction. No runtime, installer, deletion or migration change is authorized by this document. Any future local-data deletion is **blocked** pending a separate design (see "Later phase").

## Basis

- **Current source** is coordinator main `work/anideck-upload` at `f79c365`, read-only. Line references are to that revision. They supersede the older `INSTALLER-PROFILE-AUDIT.md` line numbers, which were for base `7809185`; profile selection, for example, is now `main.js:23-45`.
- **Templates and builder code:** pinned app-builder-lib **25.1.8** in `work/anideck-upload/node_modules/app-builder-lib/`. Read only; not built, installed or executed.
- **Build configuration** in current `package.json`:
  - `win.target` is `nsis` only.
  - `nsis.oneClick: true` and `perMachine: false`.
  - No `include`, `script` or `deleteAppDataOnUninstall`; there is no `build/*.nsh`.

## Program removal versus local data (from source and templates)

### Program removal

- **Which folder is removed.** Uninstalling removes the actual registered install folder `$INSTDIR` (`uninstaller.nsh:169`).
  - A **fresh** per-user one-click install defaults to `<UserProgramFiles>\anideck`, normally `%LOCALAPPDATA%\Programs\anideck`. That comes from `APP_FILENAME`, which is `sanitizedName` (`NsisTarget.js:156`; `targetUtil.js:40-41`; `multiUser.nsh:30-40`).
  - If HKCU `Software\<guid>` already has an `InstallLocation`, that path is reused (`multiUser.nsh:26-28`). The GUID is derived from the unchanged app ID `com.machoist.anishelf`, so an upgrade chain that began under an earlier name or location, such as a possible `Programs\anishelf`, keeps that folder.
  - **The actual installed path on a given machine is not established by source.**
- **What else goes.** Shortcuts and the AUMID registration (`uninstaller.nsh:172-189`), and the registry keys (`:232-236`).

### Local data

Local data lives in the profile, the one folder chosen by `main.js:23-45`: a smoke temp folder, `AniDeck Development\<hash>`, `AniShelf`, or Electron's default `AniDeck`.

| Data | Where | Restorable if lost locally? |
| --- | --- | --- |
| On-device watchlist, status, episode progress, ratings | `store.json` → `localTracker` (`src/api.js:1179-1186`, "No provider credentials or network writes") | **No.** Recovery (`src/profile-account.js:32-35`) restores the AniDeck identity only; it keeps whatever local list is present. No source path writes the published watcher card (`src/watcher.js:79`) back into `localTracker`. |
| Watch history, settings, notification, Jellyfin and request settings, caches and mappings | `store.json` | No. Caches rebuild themselves. |
| AniDeck recovery key, cloud session | `secrets.json` → `anideckIdentity`, `anideckCloud` (`src/api.js:1184-1187`; `src/profile-account.js:17,34`) | Only if the user saved the key elsewhere. |
| AniList, Kitsu, Trakt and Jellyfin sign-ins | `secrets.json` | Yes, by signing in again. |
| Subtitle font | `subtitle-font.json` (`main.js:887`) | Only by re-importing the font file. |
| Browser sessions and caches, including the `persist:anishelf-*` partitions | Chromium files in the profile (`main.js:794,852`) | Yes; they rebuild themselves or the user signs in again. |

**Never affected by local data handling:**
- AniList and Kitsu lists and scores;
- the cloud AniDeck profile, friends, messages and published card. Deleting the cloud profile is a separate action, `Cloud.leave` (`src/watcher.js:317`).

## Template constraints (from templates)

1. **The one-click uninstall goes silent after its prompts.** `un.onInit` shows "Are you sure you want to uninstall AniDeck?" (OK/Cancel). It then runs `un.checkAppRunning`, which can close a running `AniDeck.exe`, then `SetSilent silent`, then `initMultiUser`, and only then `customUnInit` (`uninstaller.nsh:11-28`). So `${Silent}` cannot tell an interactive uninstall from an unattended one.
2. **App-data deletion is inline section code** (`uninstaller.nsh:198-227`). It runs when `$CMDLINE` has `--delete-app-data`; `DELETE_APP_DATA_ON_UNINSTALL` is unset, so it doesn't run by default. **No supported hook that replaces this block was found in the inspected templates.**
   - `customRemoveFiles` (`:145`) replaces only the program-file removal.
   - `customUnInstall` (`:238`) runs after the block.

   The interception points identified:
   - **Uninstaller: `customUnInit`.** It runs before the uninstall section, so a refusal there prevents program and profile deletion. It runs **after** `un.checkAppRunning`, so a running AniDeck may already have been closed, and the uninstall prompt has already been answered. A refusal there means "**no program or profile deletion**", not "nothing changed".
   - **Installer: `customInit`.** It runs in `.onInit` after the single-instance mutex and `initMultiUser` (`installer.nsi:62-73`). That is before the install section's `CHECK_APP_RUNNING` (`installSection.nsh:33,36`) and `uninstallOldVersion` (`:52,56`). From the template order, a refusal there runs before the app is closed and before the old version is removed. That still needs build confirmation.
   - Not `preInit`: it also runs while the uninstaller itself is being generated under `BUILD_UNINSTALLER` (`installer.nsi:48-57`).
3. **Updates.** The new installer runs the **already-installed old** uninstaller as `"<old>" /S /KEEP_APP_DATA <flags> _?=<dir>`. The flags are `--updated`, or `--delete-app-data` when the installer's `${isDeleteAppData}` is true (`include/installUtil.nsh:202-207,224,230`). A non-zero exit is retried 5 times, then `appCannotBeClosed`, which defaults to Cancel when silent (`:215-241`).
   - Shipped uninstallers cannot be changed retroactively. They are stock, and they delete only with an explicit `--delete-app-data`.
   - I could not find where `${isDeleteAppData}` and `${isUpdated}` are defined (**unresolved**).
4. **Unattended uninstall.** The registry has `QuietUninstallString '"<uninst>" /currentuser /S'` (`include/installer.nsh:123`).
5. **Running copies.** `_CHECK_APP_RUNNING` matches the current user's `AniDeck.exe` processes by image name and closes them after OK, which is the default when silent (`include/allowOnlyOneInstallerInstance.nsh:41-75`). Source `electron.exe` runs are not matched.
6. **Single instance.** No `requestSingleInstanceLock` exists in current source.
7. **The custom include is picked up automatically.** With `nsis.include` unset, `getResource(undefined, "installer.nsh")` adds `build/installer.nsh` if that file exists (`NsisTarget.js:553`; `platformPackager.js:502-511`). Build resources are not app files: `build.files` lists only `build/icon.png`.

## Decision: retain local data in every installer path

Ownership of the profile cannot be shown from the uninstaller:
- release and preview builds share it by design;
- `AniShelf` is adopted because the folder exists (`main.js:41`);
- older checkouts, older builds and the AniShelf-era app may have written it;
- a newly written marker records only later writers.

The uninstaller also runs silent in every one-click flow. It therefore never deletes the profile, and it refuses explicit deletion requests.

### Final retention-only user copy

- **Uninstall prompt:** stock and unchanged: "Are you sure you want to uninstall AniDeck?"
- **Refusal message**, shown only if `/S` was not on the original command line; otherwise exit silently with an error code:

  > AniDeck doesn't delete your data when it is uninstalled or updated, so this request was not carried out. Nothing was uninstalled or deleted. Your AniDeck data stays on this PC.

- **Help text** (README or user docs):

  > Uninstalling or updating AniDeck removes or replaces only the program. Your AniDeck data on this PC is kept. That includes your on-device watchlist and progress, watch history, settings, sign-ins, recovery key and browser data, in your Windows user's AppData\Roaming folder (`AniDeck`, or `AniShelf` if you used AniDeck under its earlier name). Lists stored on AniList or Kitsu and your online AniDeck profile are not affected by uninstalling.

  This copy promises no removal or export feature.

### Journey and expected state

| Path | Program and shortcuts | Profile | Other side effects to expect |
| --- | --- | --- | --- |
| Interactive uninstall, OK | Removed from the registered `$INSTDIR` | Kept | A running `AniDeck.exe` is closed (stock) |
| Uninstall, Cancel at the prompt | Kept | Kept | None from the uninstall section |
| "AniDeck is running", Cancel | Kept | Kept | Stock `Quit` |
| `/S` or `QuietUninstallString` | Removed | Kept | Running app closed |
| Uninstaller with `--delete-app-data` | Kept (refused in `customUnInit`) | Kept | Prompt already answered; running app may already be closed; non-zero exit |
| Normal update | Replaced | Kept (`--updated`) | Stock |
| Installer with `--delete-app-data` | Old version kept (refused in `customInit`) | Kept | Refusal before `CHECK_APP_RUNNING` per template order; build needed to confirm |
| Update from a shipped stock version | Replaced | Kept: the new installer never passes the flag | Old uninstaller is stock |
| Program-file removal fails partway | Partially removed | Kept (not part of removal) | Stock behavior |

## Smallest retention-only implementation (proposal)

1. **Add `build/installer.nsh`.** It is picked up automatically, so no `package.json` change is needed. It contains only:
   - `customUnInit`: if `$CMDLINE` contains `--delete-app-data`, show the refusal copy (unless `/S` was on the original command line), then `SetErrorLevel 2` and `Quit`.
   - `customInit`: the same refusal for the installer.
   - No `RMDir`, `Delete`, registry writes or other behavior.
2. **Configuration validation.** This is new and separate from the existing runtime allowlist. `release-guard.cjs:24-25` asserts only `build.files` and `extraResources`, and those stay as they are. Add a source test, or a release-guard check, that asserts:
   - `nsis.oneClick === true` and `perMachine === false`;
   - `deleteAppDataOnUninstall` is absent;
   - `nsis.include` and `nsis.script` are absent, so the auto-included `build/installer.nsh` is the only custom NSIS input;
   - `build/installer.nsh` exists, defines exactly `customUnInit` and `customInit`, contains `--delete-app-data`, and contains no `RMDir`, `Delete`, `RMDir /r`, `$APPDATA` or registry-write commands.
3. **Help text** from above.

### Disposable-build acceptance

Run on a Windows Sandbox, VM or throwaway Windows user, never the user's machine or real profile.

- **Setup:**
  - Build a fixture v1 **without** the include and a v2 **with** it, both from a generated or disposable copy.
  - Seed generated marker files into `%APPDATA%\AniDeck`, `%APPDATA%\AniShelf` and `%APPDATA%\AniDeck Development\fixture`, and record their hashes.
- **Checks** (after every step: markers unchanged; check program, shortcut and registry state as each row expects):
  1. **v2 interactive uninstall, OK:** program, shortcuts and keys gone.
  2. **v2 uninstall, Cancel:** program present.
  3. **v2 `QuietUninstallString`:** program gone.
  4. **v2 uninstaller `--delete-app-data`:**
     - program still present;
     - non-zero exit;
     - record whether the running fixture app was closed;
     - record the `$CMDLINE` contents and the refusal-dialog behavior, both with and without `/S`.
  5. **v1 → v2 update:** v2 installed.
  6. **v2 installer started with `--delete-app-data` over an existing install:**
     - refused, the old install still present;
     - record whether a running app was closed.
  7. **v1 (stock) uninstaller run directly with `--delete-app-data`:** an expected-deletion **negative control**, run only on generated markers in the sandbox. It documents the legacy gap.
  8. **Partial failure:** record the outcome of an uninstall with a locked program file.
- **Unresolved items to record** from these runs:
  - the definitions and parsing of `${isDeleteAppData}` and `${isUpdated}`;
  - the update retry and `appCannotBeClosed` behavior after a refusal;
  - how Windows Settings reports a refused uninstall.

## Later phase: local-data removal is BLOCKED

The in-app "Remove data from this PC" idea is **not** part of the retention-only increment. **It remains blocked pending a separate reviewed deletion design.** The copy below is hypothetical and must not ship or be referenced until that design exists:

> *(hypothetical)* Remove AniDeck data from this PC? This permanently deletes everything AniDeck stores in `<folder>`: your on-device watchlist, progress, ratings and history, settings, the recovery key and sign-ins on this PC, the subtitle font, and browser data. Your recovery key does **not** bring the watchlist back. Lists on AniList or Kitsu and your online AniDeck profile are not affected. Other AniDeck copies on this PC using this folder will also start fresh.

### Why it is blocked: unresolved prerequisites, none solved by this document

1. **Writers outside the app's control cannot be excluded.** Electron's `requestSingleInstanceLock` covers only processes that request it. Already-installed AniDeck versions, preview builds made before it was added, older source checkouts and the AniShelf-era app do not participate. Even a passing native test with two **cooperating** new processes would leave this legacy-writer gap open. Any future flow must **fail closed**: refuse while such writers cannot be ruled out. No mechanism to rule them out has been identified.
2. **Links inside the profile.** A recursive delete must not follow symlinks, junctions or other reparse points inside the selected profile. Checking the folder's ancestors does not cover entries within it.
3. **Path substitution during deletion.** A folder or link could be replaced between the check and the delete (a TOCTOU race). Unresolved.
4. **Forged or replayed requests.** A one-shot request file with a nonce in its name is not an authenticated or replay-safe authorization. Unresolved.
5. **Crashes and partial failures.** Locked Chromium files, a crash mid-delete, and what state is left behind on retry are all unresolved.
6. **Redirected or OneDrive `APPDATA`,** and network locations. Unresolved.

Until a separate design resolves these, deletion stays limited to the user's own manual action. The retention-only help text does not promise an in-app option.

## Unverified (needs a build or physical check)

- Definitions of `${isDeleteAppData}` and `${isUpdated}`; `$CMDLINE` contents (including `/S`) in the `_?=` re-executed uninstaller.
- Installer and Windows Settings behavior when `customInit` or `customUnInit` quit non-zero, including the update retry loop.
- The actual `InstallLocation` on upgraded machines.
- Whether `customInit` runs before any visible or process side effect (template order suggests yes).

## Inspected paths and checks performed

- `work/anideck-upload` (read-only, `f79c365`):
  - `WORKLIST.md`, `docs/audits/INSTALLER-PROFILE-AUDIT.md` (identical to this worktree's copy);
  - `main.js`, `package.json`, `scripts/release-guard.cjs`;
  - `src/api.js`, `src/profile-account.js`, `src/watcher.js`, `src/app.js`.
- `node_modules/app-builder-lib/templates/nsis/`:
  - `uninstaller.nsh`, `installer.nsi`, `installSection.nsh`, `multiUser.nsh`, `common.nsh`, `messages.yml`;
  - `include/installUtil.nsh`, `include/installer.nsh`, `include/allowOnlyOneInstallerInstance.nsh`.
- `node_modules/app-builder-lib/out/`: `targets/nsis/NsisTarget.js`, `targets/targetUtil.js`, `platformPackager.js`.
- Checks run: `git status`, then `rg`/`grep`/`sed` reads. Nothing was built, run, installed or uninstalled, and no profile or registry was touched.
- Changed file: `docs/audits/DATA-RETENTION-DESIGN.md` only. All other dirty and untracked files are preserved. No commit or push.

## Coordinator review of revision 2 — 6 November 2026

Accepted as the design for a retention-only first increment, not as shipped behavior or approval of data removal. The revised copy does not promise a nonexistent removal/export action; actual install paths and hook ordering are qualified, nonparticipating legacy writers are explicitly unresolved, and deletion risks remain blocked. Coordinator independently verified automatic build/installer.nsh discovery in the pinned builder.

Claude has a separate scoped implementation handoff: new NSIS refusal guards, retention configuration validation and focused/inert compile tests only. No real install/uninstall runs on this user, profile deletion/migration, or changes to runtime UI. A full generated upgrade/uninstall acceptance run in a disposable Windows environment remains required before calling the policy end-to-end verified. The current installed/test preview still has its existing stock behavior until a reviewed build is delivered.
