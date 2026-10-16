CREATE TABLE IF NOT EXISTS supporters (
  id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  supported_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supporters_date ON supporters(supported_at DESC, created_at DESC);
