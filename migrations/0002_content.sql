CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  discord_url TEXT,
  published_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden'))
);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(status,published_at DESC);

CREATE TABLE IF NOT EXISTS wiki_entries (
  slug TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  source_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden'))
);
CREATE INDEX IF NOT EXISTS idx_wiki_section ON wiki_entries(section,status,title);

CREATE TABLE IF NOT EXISTS pass_seasons (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  xp_per_level INTEGER NOT NULL,
  max_level INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_links (
  discord_id TEXT PRIMARY KEY,
  minecraft_uuid TEXT NOT NULL UNIQUE,
  minecraft_name TEXT,
  verified_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
