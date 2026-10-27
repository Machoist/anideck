# Verification and packaging

Read for setup, functional changes or build delivery. Commands run from the repository root.

Use Node.js 24 and npm as documented in `docs/DEVELOPMENT.md`. Install missing dependencies with `npm ci` when needed; do not replace the lockfile casually. Normal commands from the repository root:

```text
npm start
npm test
node --test --test-timeout=15000 tests/*.test.cjs
npm run dist:win
npm run dist:mac:test
```

Choose tests that verify observable behavior and meaningful failure paths. For functional changes, run relevant tests and then the full suite when practical. Documentation-only changes do not need an app rebuild. For UI changes, inspect actual rendering at wide and narrow sizes; verify hover/focus/loading states and reduced motion when applicable.

Packaging uses the existing release guard and after-pack audit. For an already packaged Windows app, these commands inspect that package and run the existing isolated smoke/check harness:

```text
node scripts/audit-package.cjs "path/to/win-unpacked"
node scripts/native-smoke.cjs "path/to/win-unpacked/AniDeck.exe" --anideck-checks
```

Replace the example paths with real artifact paths. Read the scripts and workflow before changing flags. Native smoke checks use an isolated signed-out test profile; do not substitute the user's real profile. A source edit or passing unit test does not update an already built installer. When delivering a build, record its source revision, test results and artifact location; verify the delivered artifact corresponds to that revision.

## Focused checks first

Discover relevant tests with filename and symbol searches; read their setup before choosing a command. For example, after inspecting the Social request tests:

```text
node --test --test-timeout=15000 tests/message-requests.test.cjs tests/message-start.test.cjs
```

This is a focused starting point, not a complete acceptance gate for every Social change. Check callers, backend permissions and integration tests affected by the diff. Run the full suite for functional changes when practical and report anything not run. Capture exit status and inspect the actual summary; truncated logs are not evidence of success.

Read `.github/workflows/check.yml`, `.github/workflows/mac-test.yml` and `.github/workflows/release.yml` before CI/build changes. Do not run release publication commands as a test. See `docs/MAC-TESTING.md` for Mac requirements and `server/README.md` for backend setup. Native, fixture and physical acceptance are distinct; use `WORKLIST.md` for what still lacks live evidence.
