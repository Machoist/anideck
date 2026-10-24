# AniDeck

Your anime, on deck. A Windows desktop app for discovering, watching and tracking anime, with optional Jellyfin libraries and AniDeck friends.

## Features

- Track lists and episode progress with AniList or Kitsu.
- Customize Home with decks, widgets, a watch queue and discovery shelves.
- Watch episodes with subtitles, playback controls and next-episode support.
- Connect a TV browser and control compatible playback from the PC.
- Add friends, exchange messages and anime cards, compare shared tastes, and arrange watch invitations.
- Connect your own Jellyfin library optionally.

Under active development. Provider availability varies. Watch invitations save a shared plan; they do not start a synchronized watch party.

## Development

Requires Node.js 24 and npm. Windows is the currently tested desktop target.

```sh
npm ci
npm start
npm test
npm run dist:win
```

Public desktop defaults are in `config.release.json`. Optional local overrides belong in an ignored `config.json`. `config.example.json` contains public example defaults. Never commit credentials or private server addresses.

Pushes to `main` run checks and create an unpublished test installer in GitHub Actions. A tagged release (`v*`) or an explicit Release workflow run publishes an installer. This initial source upload does not publish a release.

## Privacy

Tracker and Jellyfin credentials use local native credential storage. Connected services receive requests needed for their features. Opting into AniDeck profiles sends identity verification and selected profile/list data to the AniDeck service. Friends and messages are hosted by AniDeck and are not end-to-end encrypted. Profile visibility is configurable. Desktop message alerts are optional.

Local configuration, credential stores, cloud CLI sessions, development notes and build outputs are excluded from this repository and public installers.

## Backend and history

`server/` contains the social Worker, database schema and identity-verification bridge. Self-hosting requires your own database binding and secrets. Deployment credentials are not included.

AniDeck continues the maintainer's earlier AniShelf project. This repository begins with a fresh snapshot; earlier commit history remains in the original repository. Existing author information and third-party notices are retained. Vendored hls.js retains its license notice; dependency licenses remain with their respective packages.

Project: https://github.com/Machoist/anideck
