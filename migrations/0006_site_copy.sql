-- Editable text for the built-in Wiki and Rules pages.
-- Run after 0001 and 0002 in the same D1 database bound as DB.
CREATE TABLE IF NOT EXISTS site_copy_overrides (
  page TEXT NOT NULL CHECK (page IN ('wiki', 'rules')),
  block_key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (page, block_key)
);
