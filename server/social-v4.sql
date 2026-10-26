CREATE TABLE IF NOT EXISTS title_comments (
 id TEXT PRIMARY KEY, media_id TEXT NOT NULL, author TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL, client_id TEXT NOT NULL, parent_id TEXT REFERENCES title_comments(id) ON DELETE SET NULL,
 spoiler INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, edited_at INTEGER, UNIQUE(author,client_id)
);
CREATE INDEX IF NOT EXISTS title_comments_media ON title_comments(media_id,created_at,id);
CREATE INDEX IF NOT EXISTS title_comments_author ON title_comments(author,created_at);
CREATE TABLE IF NOT EXISTS title_comment_likes (
 comment_id TEXT NOT NULL REFERENCES title_comments(id) ON DELETE CASCADE,
 owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(comment_id,owner)
);
