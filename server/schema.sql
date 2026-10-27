-- AniDeck profiles: who has opted in, their watcher card, and who is friends with whom.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,               -- 'anilist:123' or 'kitsu:456' (the account they joined with)
  handle      TEXT UNIQUE COLLATE NOCASE,     -- @handle, chosen when joining
  name        TEXT,
  avatar      TEXT,
  friend_code TEXT UNIQUE,                    -- 8 characters, for adding without a handle
  visibility  TEXT NOT NULL DEFAULT 'friends',-- 'friends' | 'public' (anyone signed in to AniDeck with the handle)
  card        TEXT,                           -- the watcher card snapshot (JSON)
  card_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friends (
  a          TEXT NOT NULL,                   -- who asked
  b          TEXT NOT NULL,                   -- who was asked
  status     TEXT NOT NULL,                   -- 'pending' | 'accepted'
  created_at INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE INDEX IF NOT EXISTS friends_b ON friends (b);

-- Social v2: private messages and blocking. Safe to apply more than once.
CREATE TABLE IF NOT EXISTS blocks (
 owner TEXT NOT NULL, target TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(owner,target)
);
CREATE INDEX IF NOT EXISTS blocks_target ON blocks(target);
CREATE TABLE IF NOT EXISTS messages (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, sender TEXT NOT NULL, recipient TEXT NOT NULL,
 body TEXT NOT NULL, created_at INTEGER NOT NULL, client_id TEXT NOT NULL,
 UNIQUE(sender,client_id)
);
CREATE INDEX IF NOT EXISTS messages_pair ON messages(sender,recipient,created_at,id);
CREATE INDEX IF NOT EXISTS messages_recipient ON messages(recipient,created_at);
CREATE TABLE IF NOT EXISTS message_reads (
 owner TEXT NOT NULL, peer TEXT NOT NULL, read_seq INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner,peer)
);

-- Social v3: structured messages and invitation responses. Re-runnable; existing messages stay intact.
CREATE TABLE IF NOT EXISTS message_extras (
 message_id TEXT PRIMARY KEY, payload TEXT, edited_at INTEGER, deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS watch_invites (
 message_id TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'pending', proposed_at INTEGER NOT NULL,
 responded_by TEXT NOT NULL, updated_at INTEGER NOT NULL, response_id TEXT
);

-- Public AniDeck profile details; existence marks explicitly customized identity.
CREATE TABLE IF NOT EXISTS profile_details (
 owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 bio TEXT NOT NULL DEFAULT ''
);

-- Favorite anime are explicit profile choices, independent of tracker entries.
CREATE TABLE IF NOT EXISTS profile_favorites (
 owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 media_id INTEGER NOT NULL, position INTEGER NOT NULL,
 title TEXT NOT NULL, poster TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(owner,media_id), UNIQUE(owner,position)
);

-- Optional presentation fields and consent-based messaging. Safe to apply repeatedly.
CREATE TABLE IF NOT EXISTS profile_style (
 owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 bio_format TEXT NOT NULL DEFAULT 'plain', banner TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS message_preferences (
 owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 policy TEXT NOT NULL DEFAULT 'friends'
);
CREATE TABLE IF NOT EXISTS message_requests (
 id TEXT NOT NULL UNIQUE, sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 PRIMARY KEY(sender,recipient)
);
CREATE INDEX IF NOT EXISTS message_requests_inbox ON message_requests(recipient,status,created_at);
