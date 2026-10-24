# AniDeck cloud

A small Cloudflare Worker (with a D1 database) that lets AniDeck users share their watcher card with friends who also
use AniDeck. It never stores AniList or Kitsu tokens: the app sends the token once, the worker asks AniList / Kitsu
whose it is, and hands back a signed AniDeck session.

Nothing is shared until someone joins from their profile and picks a handle.

## Deploy (once)

```sh
cd server
npx wrangler login
npx wrangler d1 create anideck-cloud              # copy the database_id it prints into wrangler.toml
npx wrangler d1 execute anideck-cloud --remote --file=schema.sql
npx wrangler secret put SESSION_SECRET            # any long random string
npx wrangler deploy                               # prints https://anideck-cloud.<you>.workers.dev
```

Then add the URL to the app's `config.json`:

```json
{ "cloudUrl": "https://anideck-cloud.<you>.workers.dev" }
```

The free Workers and D1 tiers comfortably cover this.

## API

| Method | Path | |
|---|---|---|
| POST | `/v1/session` | `{ provider: 'anilist' \| 'kitsu', token }` → `{ session, joined, me, suggested }` |
| GET / PUT / DELETE | `/v1/me` | your profile; PUT joins or updates `{ handle, visibility, name, avatar, card }`; DELETE leaves |
| GET / POST | `/v1/friends` | friends, incoming and outgoing requests; POST `{ to: handle or friend code }` |
| POST | `/v1/friends/:handle/accept` | accept a request |
| DELETE | `/v1/friends/:handle` | remove a friend, cancel or decline a request |
| GET | `/v1/users/:handle` | their card if you're friends (or they're public); otherwise name and avatar only |

## Messaging upgrade

The Worker requires a D1 binding named **DB**. For an existing database, run the idempotent migration before deploying:

```sh
cd server
npx wrangler d1 execute anideck-cloud --remote --file=social-v2.sql
npx wrangler deploy
```

New databases use schema.sql, which includes all messaging tables. GET /v1/health advertises messages, blocks and media-friends; the app keeps messaging unavailable until those capabilities are advertised.

Messages are stored as plain text in D1, protected by signed sessions and accepted-friend checks; they are not end-to-end encrypted. Blocking removes the friendship and prevents profile access and messaging in either direction. Leaving profiles deletes the account's messages, reads, blocks and friendships. Public profile visibility never permits non-friends to send messages.

Routes: GET /v1/conversations; GET/POST /v1/messages/:handle; POST /v1/messages/:handle/read; GET/POST /v1/blocks; DELETE /v1/blocks/:handle; GET /v1/media/:id/friends. Messages are limited to 2,000 characters and 30 sends per minute. Client IDs make retries idempotent.
