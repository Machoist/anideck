# Message-request acceptance flow

Repository paths below are relative to the root. Function names are retrieval anchors; this is a description of current behavior, not a general security audit.

## UI and client

`MessageRequests.inbox()` in `src/message-requests.js` renders Accept and Decline buttons. Its `panel.onclick` handler locates `[data-message-request]`; `data-action` supplies `accept` or `decline`, and `data-handle` identifies the conversation destination. It disables request buttons while the operation is pending and guards against stale account/page results.

It calls `Friends.request('/v1/message-requests/'+encodeURIComponent(id), {method:'POST', json:{action}})`. `Friends.request()` in `src/friends.js` wraps the call as `Cloud.withSession(() => Cloud.call(path, options))`.

After success it clears `Friends.snapshot`. Acceptance closes the modal and navigates to `App.nav('friends', {handle})`. Decline removes the request's article without navigating. Errors appear in the inbox and connected controls are re-enabled in `finally`.

## Authentication and server routing

`readSession()` in `server/src/worker.js` verifies the session's HMAC signature and expiry and returns the caller ID. The Worker rejects missing/invalid sessions before the authenticated routes. Authentication identifies the caller; it does not grant unrestricted resource access.

`socialRoute()` in `server/src/social.js` additionally requires a joined profile (`me.handle`) and delegates message-request endpoints to `messageRequestRoute()` in `server/src/message-requests.js`.

## Request acceptance and state

For `POST /v1/message-requests/{id}`, `messageRequestRoute()`:

1. Loads the request by ID and authenticated recipient ID. A missing request or block in either direction produces 404. `blocked()` checks both directions.
2. Accepts only `accept` or `decline` actions. An already resolved request returns success without repeating the pending transition.
3. For a pending acceptance, rejects recipient policy `none` with 403. Creating a new introduction is a separate path: it requires the recipient's policy to be `requests`, subject to existing-contact handling and other checks.
4. Batches a conditional pending-to-accepted update with insertion of the original introduction into `messages`. The update rechecks recipient, pending state, blocks and policy in SQL. `INSERT OR IGNORE` and the existing resolved-request path prevent duplicate introduction messages on retry. It then confirms accepted state before returning success.

Acceptance does not insert a friendship or write `message_extras`. `conversationAllowed()` separately recognizes an accepted friendship or accepted message request when checking conversation access; additional block and message-policy checks still apply on message routes. Accepting an introduction does not grant private watcher-card access. Decline changes a pending request to declined.

## Evidence and limits

`tests/message-requests.test.cjs` uses the real Worker with an isolated in-memory SQLite fixture. Relevant tests include:

- `nonfriends require opt-in, one text introduction and recipient acceptance before chat`: recipient-only acceptance, no pre-acceptance chat, original introduction, no friendship and retry behavior.
- `decline cannot be retried and blocking revokes even an accepted contact`: decline and block revocation.
- `accepting a request does not grant private watcher-card access, and removal revokes its chat grant`: private-card isolation and removal.
- `policy change blocks acceptance and preserves original introduction`: pending request survives policy `none`, rejected acceptance inserts no message and grants no chat, restoring policy allows acceptance, retry returns success without duplication, and no friendship is created.

These are fixture checks, not live two-account delivery, OS notifications or physical-device acceptance. Those remain in `WORKLIST.md`.

## Executed verification — 27 October 2026

- `node --test --test-timeout=15000 tests/message-requests.test.cjs`: 6 passed, 0 failed.
- `npm test`: 426 passed, 0 failed, exit 0 with localhost access. The initial sandboxed run could not access loopback sockets; no production changes were needed.
- No app runtime code changed. Existing packaged app remains `preview-3de4263`.
