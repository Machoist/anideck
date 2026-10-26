-- Public AniDeck profile details; existence marks explicitly customized identity.
CREATE TABLE IF NOT EXISTS profile_details (
 owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 bio TEXT NOT NULL DEFAULT ''
);
