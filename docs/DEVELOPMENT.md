# Development and self-hosting

These instructions are for contributors and self-hosters. People using the Windows app do not need Node.js, npm, or their own backend.

## Build from source


Requires Node.js 24 and npm. Windows is the established desktop target. Experimental Intel and Apple Silicon Mac test builds are configured; see [Mac testing](MAC-TESTING.md).

```sh
npm ci
npm start
npm test
npm run dist:win
```

### Source runs use their own profile

On Windows, double-click `Start-AniDeck-Development.cmd` in the project folder after dependencies are installed. It opens this checkout directly, without running an installer. After source files change, exit the development app and open that launcher again. `npm start` does the same from a terminal. Settings > About identifies it as Development; use the project launcher rather than the installed AniDeck shortcut for this testing workflow. A source change does not update the installed app or another checkout.

`npm start` (any unpackaged run) never opens the installed app's profile. Each checkout gets its own folder under `%APPDATA%\AniDeck Development\` on Windows or `~/Library/Application Support/AniDeck Development/` on macOS. Settings, the on-device list, sign-ins and browser sessions all live there. The folder name is the first 16 hex characters of a SHA-256 hash of the checkout's resolved path, so it does not reveal where the checkout lives. On Windows the path is compared case-insensitively, and junctions resolve to their target first. Relaunching the same checkout reuses its profile. Separate worktrees or clones never share stores or sessions.

A new checkout therefore starts signed out with empty settings. Sign in again inside it, and preferably use a test account. Source runs cannot opt into the installed profile, and nothing copies, moves or deletes an existing profile. Installed release and preview builds keep using `%APPDATA%\AniDeck`, or the earlier `%APPDATA%\AniShelf` folder when it exists. Packaged smoke checks (`--anideck-smoke-test` on a test build) still use a temporary isolated profile. Delete an old development folder by hand when you no longer need it.

Public desktop defaults are in `config.release.json`. Optional local overrides belong in an ignored `config.json`. `config.example.json` contains public example defaults. Never commit credentials or private server addresses.

Pushes to `main` run checks and create an unpublished test installer in GitHub Actions. A tagged release (`v*`) or an explicit Release workflow run publishes an installer. This initial source upload does not publish a release.

## Backend and project history


`server/` contains the social Worker, database schema and identity-verification bridge. Self-hosting requires your own database binding and secrets. Deployment credentials are not included.

AniDeck continues the maintainer's earlier AniShelf project. This repository begins with a fresh snapshot; earlier commit history remains in the original repository. Existing author information and third-party notices are retained. Vendored hls.js retains its license notice; dependency licenses remain with their respective packages.


## Mac test builds

Pushes to main also run the Mac test build workflow for Intel and Apple Silicon. It uploads test ZIPs as Actions artifacts and does not publish a release. Native build/launch and real-device results must pass before treating macOS as verified. See [Mac testing](MAC-TESTING.md).

## Synopsis enrichment

Full existing descriptions are retained. Missing/relationship-only descriptions may use exact MyAnimeList IDs through [Tenrai](https://api.tenrai.org/llms.txt) (public, read-only, currently beta), then [Jikan](https://github.com/jikan-me/jikan-rest/blob/master/storage/api-docs/api-docs.json). Responses must match the requested MAL ID; no title search or prequel substitution. Requests are paced, bounded, coalesced per ID and backed off after failures. These services improve coverage without guaranteeing that every season has a published plot. Enrichment runs after title rendering and never opens a browser-verification window.
