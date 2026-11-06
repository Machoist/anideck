# Discord playback sharing

AniDeck uses Discord's documented local desktop IPC transport for opt-in Rich Presence. It does not log into Discord, create a bot, use a webhook, or require a client secret.

## Registered application

AniDeck public Application ID: `1568285269717946439`, verified against its Developer Portal General Information page. It is configured for packaged and local developer runs. Live activity publication remains a separate opt-in acceptance check. Automated smoke profiles force Discord registration off so UI fixtures cannot publish to a real profile.

## One-time project setup

1. Open [Discord Developer Portal applications](https://discord.com/developers/applications) and create an application named **AniDeck**. Choose AniDeck artwork for its application icon.
2. Copy its public **Application ID** from General Information. Do not copy the public key, bot token or client secret.
3. Put that numeric ID in `discordClientId` in `config.release.json` for packaged builds, and the local `config.json` for developer runs. Empty means setup pending; the sharing switch stays disabled. This ID is public and can be committed. The release guard rejects malformed IDs and continues rejecting unexpected/private configuration fields.
4. Build normally. Users then choose Settings > Discord > Share playback. No RPC Origin, OAuth redirect or bot setup is used by this local IPC-only implementation.

## Behavior and privacy

Sharing defaults off. Users choose Title & episode, Title only, or Activity only. Activity comes only from active desktop remote-anime playback; private Jellyfin and TV receiver playback are excluded. Paused activity has no running timer. Closing/stopping/ending playback, opt-out, sign-out, main-window navigation/crash and app exit clear activity. After sign-out the same playback session cannot republish; a new explicit playback session is required.

The native boundary independently checks the sender, saved opt-in and configured ID, constructs an allowlisted activity, and accepts only HTTPS artwork from known public AniList/Kitsu image hosts without query parameters. Provider media URLs, tokens, account keys, usernames and private server addresses are never included. Discord absence/restart is handled quietly. Updates coalesce with a five-second minimum interval; clearing and privacy reductions are immediate. Settings preview uses illustrative labels, not a claim of an actual Discord connection.

## Verification

`node --test tests/discord-presence.test.cjs` covers privacy, framing, partial reads, ping/pong, disconnect/restart, newest-state coalescing, clear/revoke, missing registration and IPC authorization. A real isolated local pipe server verifies actual byte transport without connecting to Discord or publishing activity. Native visual checks use the real packaged renderer/CSS and a renderer-only registration fixture. The native smoke-profile guard forces the application ID off, so opt-in/preview interactions cannot connect to the real Discord client even though public configuration is now registered.

**Live acceptance remains pending consent.** With the application configured, explicitly agree to a real Discord activity test, open Discord desktop, enable sharing, play a public anime, verify title/episode, pause, seek, change privacy, close playback, opt out, and restart Discord. Check a Jellyfin title stays private. Physical macOS acceptance remains separate. Do not claim simulated acceptance proves publication on Discord.

References: [Discord RPC over IPC and SET_ACTIVITY](https://docs.discord.com/developers/topics/rpc), [Discord RPC implementation notes](https://github.com/discord/discord-rpc/blob/master/documentation/hard-mode.md).
