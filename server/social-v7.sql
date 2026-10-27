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
