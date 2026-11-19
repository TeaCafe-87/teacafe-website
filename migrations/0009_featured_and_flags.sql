-- Run after 0008. Home featured photos picked by admins, and sitewide feature switches.

-- One row per featured image. media_id points at community_media (gallery posts);
-- the photo disappears from the wall automatically if the post is hidden or deleted.
CREATE TABLE IF NOT EXISTS featured_photos (
  media_id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  label TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_featured_photos_order ON featured_photos(position, created_at);

-- Feature switches. A missing row means the feature is enabled;
-- note is shown to players on the paused page.
CREATE TABLE IF NOT EXISTS site_features (
  feature TEXT PRIMARY KEY CHECK (feature IN ('forum','gallery','wiki','market','featured')),
  enabled INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
