PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('gallery', 'forum')),
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  author_name TEXT,
  author_avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'pending', 'hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_community_feed ON community_posts(kind, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_author ON community_posts(author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_media (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_community_media_post ON community_media(post_id, position);

CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  author_name TEXT,
  author_avatar_url TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS community_likes (
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, author_id)
);

CREATE TABLE IF NOT EXISTS community_shares (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  actor_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_community_shares_post ON community_shares(post_id);
