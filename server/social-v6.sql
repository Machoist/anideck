-- Favorite anime are explicit profile choices, independent of tracker entries.
CREATE TABLE IF NOT EXISTS profile_favorites (
 owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 media_id INTEGER NOT NULL, position INTEGER NOT NULL,
 title TEXT NOT NULL, poster TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(owner,media_id), UNIQUE(owner,position)
);
