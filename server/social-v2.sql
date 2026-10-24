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
