-- Social v3: structured messages and invitation responses. Re-runnable; existing messages stay intact.
CREATE TABLE IF NOT EXISTS message_extras (
 message_id TEXT PRIMARY KEY, payload TEXT, edited_at INTEGER, deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS watch_invites (
 message_id TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'pending', proposed_at INTEGER NOT NULL,
 responded_by TEXT NOT NULL, updated_at INTEGER NOT NULL, response_id TEXT
);
