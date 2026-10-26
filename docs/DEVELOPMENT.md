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

Public desktop defaults are in `config.release.json`. Optional local overrides belong in an ignored `config.json`. `config.example.json` contains public example defaults. Never commit credentials or private server addresses.

Pushes to `main` run checks and create an unpublished test installer in GitHub Actions. A tagged release (`v*`) or an explicit Release workflow run publishes an installer. This initial source upload does not publish a release.

## Backend and project history


`server/` contains the social Worker, database schema and identity-verification bridge. Self-hosting requires your own database binding and secrets. Deployment credentials are not included.

AniDeck continues the maintainer's earlier AniShelf project. This repository begins with a fresh snapshot; earlier commit history remains in the original repository. Existing author information and third-party notices are retained. Vendored hls.js retains its license notice; dependency licenses remain with their respective packages.


## Mac test builds

Pushes to main also run the Mac test build workflow for Intel and Apple Silicon. It uploads test ZIPs as Actions artifacts and does not publish a release. Native build/launch and real-device results must pass before treating macOS as verified. See [Mac testing](MAC-TESTING.md).
