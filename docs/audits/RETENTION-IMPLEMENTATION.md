# Retention-only installer hardening: results

Scope: the first phase approved by `AGENT-RETENTION-IMPLEMENTATION.md`. Explicit `--delete-app-data` requests are refused, and nothing else changes. There is no local-data removal, migration, ownership marker, single-instance change, UI change or remote action.

## Baseline

- **Checkout:** `work/anideck-claude`, branch `agent/claude-installer-audit`, at commit `7809185`. The earlier accepted, still uncommitted edits are present and untouched: `main.js` development profiles, `docs/DEVELOPMENT.md`, two existing-test fixture updates, `tests/development-profile.test.cjs`, `scripts/native-development-profile.cjs` and `docs/audits/*`.
- **Coordinator main is newer** and includes unrelated fixes that are not in this checkout. Results below are for **this checkout's source**.
- **Read-only tools used:**
  - coordinator `node_modules` (app-builder-lib **25.1.8**, through `NODE_PATH` for tests);
  - the coordinator builder cache `work/builder-cache/nsis/nsis-3.0.4.1` (makensis **v3.04**) and `nsis-resources-3.4.1` (StdUtils plugins).

  Nothing was installed or modified.

## Changed files

| File | Change |
| --- | --- |
| `build/installer.nsh` (new, sha256 `e183beaa…4bb6dc`) | `customInit` and `customUnInit` each insert `anideckRefuseAppDataDeletion`. A compile-time `!error` fires if `DELETE_APP_DATA_ON_UNINSTALL` is defined. No `Delete`/`RMDir`/registry/file/shortcut/process instructions. |
| `scripts/release-guard.cjs` | Adds `verifyInstallerRetention` and `nsisStatements`. Adds `verifyRelease(root)`, which runs the existing `verify()` and then the installer policy; the `beforePack` hook and the command line now use it. The existing `verify()` checks, including `build.files`/`extraResources` and privacy, are unchanged. |
| `tests/installer-retention.test.cjs` (new, 7 tests) | Policy and regression fixtures. |
| `scripts/check-installer-retention.cjs` (new) | Inert NSIS compile-and-probe harness. |
| `docs/audits/RETENTION-IMPLEMENTATION.md` (new) | This report. |

`package.json`, the lockfile, `main.js` (beyond earlier work), existing tests, runtime and UI were not changed for this task. No `package.json` change was needed: electron-builder picks up `build/installer.nsh` automatically when `nsis.include` is unset (`NsisTarget.js:553-556`; `platformPackager.js:502-511`). It is a build resource, not an app file; `build.files` still lists only `build/icon.png`.

## Guard behavior

`anideckRefuseAppDataDeletion` (`build/installer.nsh`):
1. Runs `${GetParameters}`, then FileFunc `${GetOptions} … "--delete-app-data"`. This is the same parser and argument the stock uninstaller uses to decide deletion (`templates/nsis/uninstaller.nsh:202-203`).
2. Runs `${StdUtils.TestParameter} … "delete-app-data"`. This is the plugin call behind the generated `${isDeleteAppData}`. The builder generates that macro in `nsisScriptGenerator.js` `flags()`, called at `NsisTarget.js:533`, and the stock installer uses it to forward `--delete-app-data` to the old uninstaller on update (`include/installUtil.nsh:202-203`). This resolves the earlier "definition not found" question.
3. If either check matches, it runs `SetErrorLevel 2` and `Quit`. Otherwise it restores `$R0`/`$R1` and the stock flow continues unchanged.
4. **No dialog in any mode.** The original `/S` state is not established inside `customUnInit`; the one-click flow has already called `SetSilent` (`uninstaller.nsh:11-21`). So the refusal is always a silent non-zero exit. It refers to no removal or export UI.

**Hook timing (from template order):**
- **Installer:** `customInit` runs in `.onInit` (`installer.nsi:72-73`), before the install section's `CHECK_APP_RUNNING` and `uninstallOldVersion` (`installSection.nsh:33,36,52,56`).
- **Uninstaller:** `customUnInit` runs **after** the stock "Are you sure…?" prompt and `un.checkAppRunning` (`uninstaller.nsh:11-28`). **The stock uninstaller may therefore already have closed a running AniDeck before the refusal.** The refusal prevents program and data removal; it does not prevent those earlier steps.

## Release guard policy

> **Correction (after `AGENT-RETENTION-FIX-REVIEW.md`).** The original validator described below did **not** enforce control flow or register bindings. The coordinator showed it accepting `${If} ${Errors}` in place of `${IfNot} ${Errors}`, and `TestParameter $R2` while `$R1` was compared. Both mutations were reproduced locally, together with 13 more. The validator now compares **every normalized statement in order** against the approved guard. See "Corrected verification". The original description is kept for the record.

**Original validator (superseded):** `verifyInstallerRetention` parsed `installer.nsh` into statements. It strips `;`/`#` line comments and `/* */` blocks, keeps quoted strings, and joins `\` line continuations. It then enforces this structure:

- **Package settings:** `buildResources` is `build`, `nsis.oneClick === true`, `perMachine === false`, and `nsis.include`/`script`/`deleteAppDataOnUninstall` are absent (even `false`).
- **Instruction allowlist:** `!include`/`!ifdef`/`!error`/`!endif`/`!macro`/`!macroend`/`!insertmacro`, `Push`/`Pop`/`ClearErrors`/`SetErrorLevel`/`Quit`, `${GetParameters}`/`${GetOptions}`/`${StdUtils.TestParameter}`, and `${If}`/`${IfNot}`/`${EndIf}`. Anything else fails, for example `RMDir`, `Delete`, `WriteRegStr` or `ExecWait`.
- **Macro structure:**
  - The macros are exactly `customInit`, `customUnInit` and the helper, with no nesting or duplicates.
  - Each hook body is exactly one `!insertmacro anideckRefuseAppDataDeletion`.
  - The helper inserts no other macro.
- **File-level statements:** only `LogicLib.nsh`/`FileFunc.nsh` includes, the `DELETE_APP_DATA_ON_UNINSTALL` `!ifdef`/`!error` guard, and no instructions outside macros.
- **Refusal logic:** the helper contains the exact `GetOptions "--delete-app-data"` and `TestParameter "delete-app-data"` checks. There are exactly two `Quit`s, each directly after `SetErrorLevel 2`, and no other exit codes.

**Why existing tests are unaffected:** `verify()` keeps its scope because the existing test `tests/release-config.test.cjs:5-6` asserts `verify()` is true for a fixture without `build/`. Builds still enforce the policy because the `beforePack` hook now calls `verifyRelease`.

## Commands and results

| Command | Result |
| --- | --- |
| `node --check` on `scripts/release-guard.cjs`, `scripts/check-installer-retention.cjs`, `tests/installer-retention.test.cjs` | syntax ok |
| `node scripts/release-guard.cjs` | exit 0: "Release allowlist, public configuration and installer retention policy passed" |
| `node --test --test-timeout=15000` over `tests/installer-retention`, `release-config`, `branding-support`, `mac-support`, `development-profile` (`NODE_PATH`=coordinator `node_modules`) | **26/26 pass**, exit 0. An earlier run failed `release-config` "private state" because the policy was first added inside `verify()`; that led to the `verifyRelease` split above. |
| `node --test --test-timeout=15000 tests/*.test.cjs` | **725/725 pass**, exit 0. I first confirmed no test spawns processes. |
| `node scripts/check-installer-retention.cjs <coordinator app-builder-lib> <builder-cache nsis-3.0.4.1> <nsis-resources-3.4.1> <scratchpad>` | exit 0: compiled 3 probes with `-WX`; 20 command lines × 2 guards plus 2 relaunch checks passed. Fixture `<scratchpad>\anideck-retention-probe-6lmrw1` (kept, with `report.json`). The first run, `…-ftSewg`, failed one case because of my wrong hand expectation (`-delete-app-data`, see below). |
| The same harness with a copied guard whose two `Quit`s were commented out (`<scratchpad>\retention-negative`) | **exit 1 as expected**: 12 deletion forms plus the relaunch case failed. Fixture `…-d9iMhw`. |
| makensis with `-DDELETE_APP_DATA_ON_UNINSTALL` on the generated probe script | **exit 1 as expected**: `!error: AniDeck keeps app data on uninstall; remove deleteAppDataOnUninstall.` at `installer.nsh` line 10 |

### Probe design

The probe header is built by the **real** `NsisScriptGenerator` with the flag list read from `NsisTarget.js:533`, the StdUtils include, the plugin directory and `build/installer.nsh`, in the same order as `NsisTarget.js:525-556`. Three tiny programs are compiled:

- **probe installer:** `.onInit` inserts `customInit`, and its section writes a sentinel and sets exit 7;
- **probe uninstaller:** written by a writer program, as electron-builder's `BUILD_UNINSTALLER` pass does. `un.onInit` runs `SetSilent silent` and then `customUnInit`, matching the one-click order; its section writes a sentinel and sets exit 7;
- **stock-decision probe:** evaluates the stock `GetOptions` and `${isDeleteAppData}` decisions without the guard.

All writes are sentinel files in the fixture, and `TEMP`/`TMP` point into the fixture. The uninstaller cases append `_?=<fixture>\instdir`, as the stock update call does. Arguments are passed verbatim.

### Probe matrix

Columns:
- **del** = the stock uninstaller would delete;
- **fwd** = the stock installer would forward the flag;
- **guard** = exit code in both the installer and the uninstaller (2 refuses, 7 continues to the section).

| Command line | del | fwd | Guard (inst / uninst) |
| --- | --- | --- | --- |
| *(none)* | n | n | 7 / 7 |
| `--delete-app-data` | Y | Y | 2 / 2 |
| `/S --delete-app-data`, `--delete-app-data /S` | Y | Y | 2 / 2 |
| `--updated`; `/S /KEEP_APP_DATA --updated`; `… --keep-shortcuts --updated` | n | n | 7 / 7 |
| `/S /KEEP_APP_DATA --delete-app-data` (update form) | Y | Y | 2 / 2 |
| `--updated --delete-app-data` | Y | Y | 2 / 2 |
| `--DELETE-APP-DATA`; `--delete-app-data=1` | Y | Y | 2 / 2 |
| `--delete-app-data-later` | Y | n | 2 / 2 (prefix match, fails closed) |
| `/delete-app-data`; `"--delete-app-data"` | n | **Y** | 2 / 2 |
| `C:\dir--delete-app-data` (unquoted path text) | **Y** | n | 2 / 2 (fails closed) |
| `--package-file="C:\fixture\a --delete-app-data b.7z"` (quoted path) | n | n | 7 / 7 |
| `-delete-app-data` | n | n | 7 / 7: not a request to either stock parser |
| `/currentuser`; `/currentuser /S` (QuietUninstallString) | n | n | 7 / 7 |
| `/currentuser --delete-app-data` | Y | Y | 2 / 2 |

- **Safety property** checked in every row: whenever **del** or **fwd** is Y, both guards return 2. The two stock parsers disagree with each other (rows 9–10 of the table); the guard refuses whenever either matches.
- **The `-delete-app-data` case:** my first expectation was a refusal. The stock-decision probe showed neither stock parser treats it as the flag, so passing it on is correct, and the expectation was changed with that evidence.
- **Relaunch path**, the ordinary `UninstallString` with no `_?=`: the stub exits **0** after relaunching a copy from `TEMP`. For `/currentuser`, the copy reached its section. For `/currentuser --delete-app-data`, the copy did **not** reach its section, so it refused. **The caller sees exit 0 here, not 2.** A non-zero refusal code is only visible with `_?=`, as in the stock update call.

## Corrected verification (review fix)

The `verifyInstallerRetention` package checks are unchanged: `buildResources`, `oneClick`/`perMachine`, and no `include`/`script`/`deleteAppDataOnUninstall`. The `installer.nsh` check now works like this (`scripts/release-guard.cjs`, `RETENTION_STATEMENTS`):

1. **Parse and normalize.** `nsisStatements` strips comments, keeps quoted strings and joins continuations. Each statement is normalized to its tokens joined by single spaces. Indentation, blank lines, CRLF and extra spacing are harmless.
2. **Unknown instructions** produce the specific message "unexpected installer.nsh instruction X", for example `RMDir`, `Delete`, `WriteRegStr` or `ExecWait`.
3. **Exact comparison.** The statement list must equal the 29-statement approved list exactly, in order. The only free text is the single quoted `!error` message. The comparison fixes:
   - condition polarity: `${IfNot} ${Errors}`, `${If} $R1 == "true"`;
   - registers: `GetParameters $R0`, `GetOptions $R0 … $R1`, `TestParameter $R1`;
   - the comparison operator and value;
   - `ClearErrors` before `GetOptions`;
   - each `SetErrorLevel 2`/`Quit` inside its own conditional;
   - balanced `!ifdef DELETE_APP_DATA_ON_UNINSTALL`/`!error`/`!endif`;
   - balanced `!macro`/`!macroend`;
   - `Push $R0, $R1` … `Pop $R1, $R0`;
   - hooks that only insert the helper.

   A failure names the statement number and both the expected and actual text.

This is a fixed-text comparison, not an NSIS interpreter. Any legitimate change to the guard must update `RETENTION_STATEMENTS` in review.

**Before and after.** The new test "control flow, registers, ordering, stack and compile-time guard changes are rejected" applies 21 mutations. Against the original validator it **failed**: 15 were accepted.

| Mutation | Original validator | Corrected |
| --- | --- | --- |
| inverted stock-option branch (`${If} ${Errors}`) | **accepted** | rejected |
| TestParameter result in another register (`$R2`) | **accepted** | rejected |
| GetParameters removed / into `$R1` | **accepted** | rejected |
| GetOptions reads the wrong register | **accepted** | rejected |
| ClearErrors removed / moved after GetOptions | **accepted** | rejected |
| TestParameter compared with `"false"` / with `!=` | **accepted** | rejected |
| TestParameter conditional removed / comparison before TestParameter | **accepted** | rejected |
| stock-option conditional removed | **accepted** | rejected |
| Pops in the wrong order / a Push removed | **accepted** | rejected |
| compile-time guard left unbalanced (`!endif` removed) | **accepted** | rejected |
| `!error` → `!warning`; `!error` removed; different define; `!ifndef`; helper `!macroend` removed | rejected | rejected |

With the correction, the test passes: 0 accepted. The earlier mutation cases (`RMDir`/`Delete`/`WriteRegStr`/`ExecWait`, exit codes, flag text, hook bodies, extra macro or include, statements outside macros, duplicate macro) still fail; they now assert the canonical-mismatch message instead of the removed specific messages. A reformatted helper (tabs, blank lines, CRLF, extra spacing) and commented prose still pass.

**The coordinator's evidence script.** `outputs/review-retention-validator.cjs` was run as a scratchpad copy whose only change is the repository path (`diff` shows the one line). Running it in place would have written a fixture into `outputs/`. Both mutations are now **Rejected**: statement 12 `${IfNot} ${Errors}` and statement 16 `TestParameter $R1`. Fixture: `<scratchpad>\validator-review-repro\retention-validator-review-zcFM3W`.

**Commands after the correction:**

| Command | Result |
| --- | --- |
| `node --check scripts/release-guard.cjs tests/installer-retention.test.cjs` | ok |
| `node scripts/release-guard.cjs` | exit 0 |
| Focused: `node --test --test-timeout=15000 tests/installer-retention.test.cjs tests/release-config.test.cjs tests/branding-support.test.cjs tests/mac-support.test.cjs tests/development-profile.test.cjs` | **27/27 pass**, exit 0. Before the correction the new mutation test failed with the 15 accepted mutations listed. |
| Full: `node --test --test-timeout=15000 tests/*.test.cjs` | **726/726 pass**, exit 0 (log `<scratchpad>\full-suite-retention-fix.log`) |
| Inert NSIS probe `scripts/check-installer-retention.cjs` (same arguments as before) | exit 0: 3 probes compiled; 20 × 2 command lines plus 2 relaunch checks passed. Guard sha256 unchanged (`e183beaa…4bb6dc`). Fixture `<scratchpad>\anideck-retention-probe-PALNjR` |

`build/installer.nsh`, the probe harness, the existing `verify()` privacy and runtime checks, and all other files are unchanged by this correction. Only `scripts/release-guard.cjs`, `tests/installer-retention.test.cjs` and this report were edited.

## Limits and unexercised modes

- **Inert probes, not acceptance.** These are not AniDeck's real installer or uninstaller. Not exercised:
  - the full electron-builder NSIS build;
  - one-click UI prompts (the probe uninstaller sets silent itself);
  - `un.checkAppRunning`/process closing;
  - the update retry loop and `appCannotBeClosed` after a refusal;
  - how Windows Settings reports a refused uninstall;
  - real `$INSTDIR` and registry state;
  - shortcuts.

  No real install, uninstall or update was run, and no profile or registry was touched.
- **Already-shipped uninstallers are stock** and still honor an explicit `--delete-app-data`. The guard protects only builds that contain it.
- **No user-facing message.** An interactive explicit-flag uninstall exits silently. Whether to show a message depends on establishing the original `/S` state, which was not done.
- **Still required before shipping:** coordinator review, plus the disposable Windows user, VM or Sandbox v1 → v2 matrix from `DATA-RETENTION-DESIGN.md` with generated marker profiles. This work does not establish ship readiness.

## Retained fixtures

All under the session scratchpad. Nothing was deleted:
- `anideck-retention-probe-6lmrw1` (passing run, `report.json`);
- `anideck-retention-probe-ftSewg` (first run);
- `anideck-retention-probe-d9iMhw` and `retention-negative` (negative control);
- `full-suite-retention.log`;
- after the correction: `anideck-retention-probe-PALNjR`, `validator-review-repro` (the coordinator script copy and its fixture) and `full-suite-retention-fix.log`.

The new tests' own `os.tmpdir()` fixtures are removed after each test, as in the existing release tests.

No commit or push.

## Coordinator integration — 6 November 2026

Accepted corrected structural validation after independent reproduction that both inverted-condition and mismatched-register mutations are rejected. Integrated only build/installer.nsh, release-guard.cjs, the new retention tests/probe and this report. Normalized line endings in the test's source fixture so exact mutation edits work after Windows CRLF checkouts.

Coordinator focused tests: 27 passed in Claude's worktree. Integrated full suite: 735 passed. Independent inert NSIS rerun: 20 command lines across both guards plus 2 relaunch checks passed; outputs/anideck-retention-probe-eHDDGc/report.json and outputs/retention-integrated-probe.log in the enclosing workspace retain evidence. Full-suite log is outputs/retention-integrated-tests.log. No real install/uninstall/update ran; no profile/registry/data deletion or migration. The outer-stub exit-0 limitation remains as reported. Full app NSIS compilation is the next verification; disposable Windows end-to-end acceptance remains outstanding. WindowsSandbox.exe was not present at the standard system path; no feature enablement was attempted.

The current delivered preview remains e9b843a. This source integration does not retrofit protection into existing uninstallers or change the running development app's UI/runtime.
